import { describe, expect, it, vi } from 'vitest'
import { dataUpdatePlugin, isLocalRequest } from './dev-api.mjs'

const local = (headers = {}, remoteAddress = '127.0.0.1') => ({ socket: { remoteAddress }, headers: { host: '127.0.0.1:5173', ...headers } })
describe('local update endpoint', () => {
  it('allows same-origin loopback and rejects foreign hosts, origins and remote clients', () => {
    expect(isLocalRequest(local({ origin: 'http://127.0.0.1:5173' }))).toBe(true)
    expect(isLocalRequest(local({ host: 'attacker.example' }))).toBe(false)
    expect(isLocalRequest(local({ origin: 'https://attacker.example' }))).toBe(false)
    expect(isLocalRequest(local({ origin: 'null' }))).toBe(false)
    expect(isLocalRequest(local({}, '192.168.1.1'))).toBe(false)
  })
  it('requires the page update header before starting a job', async () => {
    let middleware
    const run = vi.fn()
    dataUpdatePlugin({ run }).configureServer({ config: { root: '/unused' }, middlewares: { use: fn => { middleware = fn } } })
    const response = { writeHead: vi.fn(), end: vi.fn() }
    await middleware({ ...local({ 'content-type': 'application/json' }), method: 'POST', url: '/api/data/update' }, response, vi.fn())
    expect(response.writeHead).toHaveBeenCalledWith(403, expect.anything())
    expect(run).not.toHaveBeenCalled()
  })
  it('accepts one concurrent update, exposes progress and rejects the second writer', async () => {
    let middleware, finish
    const run = vi.fn(({ onProgress }) => {
      onProgress({ stage: 'catalog', source: 'QQ 音乐' })
      return new Promise(resolve => { finish = resolve })
    })
    dataUpdatePlugin({ run }).configureServer({ config: { root: '/unused' }, middlewares: { use: fn => { middleware = fn } } })
    const request = () => ({ ...local({ 'x-jjlin-update': '1', 'content-type': 'application/json' }), method: 'POST', url: '/api/data/update', async *[Symbol.asyncIterator]() { yield '{}' } })
    const response = () => ({ writeHead: vi.fn(), end: vi.fn() })
    const first = response(), second = response()
    await Promise.all([middleware(request(), first, vi.fn()), middleware(request(), second, vi.fn())])
    expect([first.writeHead.mock.calls[0][0], second.writeHead.mock.calls[0][0]].sort()).toEqual([202, 409])
    expect(run).toHaveBeenCalledTimes(1)
    const status = response()
    await middleware({ ...local(), method: 'GET', url: '/api/data/status' }, status, vi.fn())
    expect(JSON.parse(status.end.mock.calls[0][0])).toMatchObject({ running: true, job: { progress: { stage: 'catalog', source: 'QQ 音乐' } } })
    finish({ status: 'success', added: 1, updated: 0, after: 2 })
  })
  it('does not accept arbitrary update configuration from the browser', async () => {
    let middleware
    const run = vi.fn()
    dataUpdatePlugin({ run }).configureServer({ config: { root: '/unused' }, middlewares: { use: fn => { middleware = fn } } })
    const response = { writeHead: vi.fn(), end: vi.fn() }
    const request = { ...local({ 'x-jjlin-update': '1', 'content-type': 'application/json' }), method: 'POST', url: '/api/data/update', async *[Symbol.asyncIterator]() { yield '{"url":"https://attacker.example"}' } }
    await middleware(request, response, vi.fn())
    expect(response.writeHead).toHaveBeenCalledWith(400, expect.anything())
    expect(run).not.toHaveBeenCalled()
  })
})
