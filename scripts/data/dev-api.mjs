import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readJSON, syncData } from './sync.mjs'

const loopback = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host)

export function isLocalRequest(request) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress)) return false
  try {
    const address = new URL('http://' + request.headers.host)
    if (!loopback(address.hostname) || address.username || address.password) return false
    if (request.headers.origin) {
      const origin = new URL(request.headers.origin)
      if (origin.protocol !== 'http:' || origin.host !== address.host) return false
    }
    return true
  } catch { return false }
}

function send(response, code, data) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(data))
}

async function emptyBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 512) throw new Error('更新请求过大')
  }
  const value = JSON.parse(body || '{}')
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length) throw new Error('更新请求不接受配置参数')
}

/** Development-only endpoint: fixed local configuration, no arbitrary URLs or credentials. */
export function dataUpdatePlugin({ run = syncData } = {}) {
  return {
    name: 'local-music-data-update',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      let job = null
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (!['/api/data/status', '/api/data/update'].includes(path)) return next()
        if (!isLocalRequest(request)) return send(response, 403, { error: '数据更新仅允许从本机页面访问' })
        if (path === '/api/data/status' && request.method === 'GET') {
          let report = null
          try { report = readJSON(join(root, 'public/data-status.json')) } catch { /* A damaged report must not prevent a new update. */ }
          if (job?.report && (!report || (job.report.finishedAt ?? '') > (report.finishedAt ?? ''))) report = job.report
          return send(response, 200, { available: true, running: job?.status === 'running', job, report })
        }
        if (path !== '/api/data/update' || request.method !== 'POST') return send(response, 405, { error: '请求方式不支持' })
        if (request.headers['x-jjlin-update'] !== '1' || !request.headers['content-type']?.startsWith('application/json')) return send(response, 403, { error: '请通过页面发起更新' })
        if (job?.status === 'running') return send(response, 409, { error: '更新正在进行', job })
        try { await emptyBody(request) } catch (error) { return send(response, 400, { error: error.message }) }
        // Check again after reading the request: concurrent POSTs can reach this point together.
        if (job?.status === 'running') return send(response, 409, { error: '更新正在进行', job })
        job = { id: randomUUID(), status: 'running', startedAt: new Date().toISOString(), progress: null, report: null }
        send(response, 202, { job })
        void Promise.resolve().then(async () => {
          try {
            job.report = await run({ root, onProgress: ({ stage, source, current, total }) => { job.progress = { stage, source, current, total } } })
            job.status = job.report.status
          } catch (error) {
            job.status = 'failed'
            job.report = { status: 'failed', error: error.message, finishedAt: new Date().toISOString() }
          }
          job.finishedAt = new Date().toISOString()
          job.progress = null
        })
      })
    },
  }
}
