import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createIndex } from './index.mjs'
import { matchSong, mergeSong, parseLyrics } from './model.mjs'
import { createQQProvider, createNeteaseProvider } from './providers.mjs'

export function readJSON(path, fallback = null) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
}

export function writeJSON(path, data, pretty = true) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(temporary, JSON.stringify(data, null, pretty ? 2 : undefined) + '\n', { flag: 'wx' })
    renameSync(temporary, path)
  } finally { if (existsSync(temporary)) unlinkSync(temporary) }
}

export function acquireUpdateLock(root) {
  const path = join(root, 'data/raw/music-sync/update.lock')
  mkdirSync(dirname(path), { recursive: true })
  const token = randomUUID()
  try { writeFileSync(path, token, { flag: 'wx' }) } catch (error) {
    if (error.code === 'EEXIST') throw new Error('已有数据更新任务正在执行；若此前异常退出，请确认任务已停止后删除 data/raw/music-sync/update.lock')
    throw error
  }
  return () => { if (existsSync(path) && readFileSync(path, 'utf8') === token) unlinkSync(path) }
}

export function validateConfig(config) {
  if (!config || typeof config.artist !== 'string' || !config.artist.trim()) throw new Error('更新配置缺少 artist')
  for (const [key, min, max] of [['timeoutMs', 1000, 60000], ['requestDelayMs', 0, 10000], ['cacheHours', 0, 8760], ['maxLyricsPerSource', 1, 100]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`更新配置 ${key} 应在 ${min}–${max} 之间`)
  }
  for (const name of ['qq', 'netease']) {
    const source = config[name]
    if (!source || typeof source.enabled !== 'boolean') throw new Error(`更新配置 ${name} 缺少 enabled`)
    if (!source.enabled) continue
    if (typeof source.artistId !== 'string' || !source.artistId.trim()) throw new Error(`更新配置 ${name} 缺少 artistId`)
    if (!Number.isInteger(source.catalogLimit) || source.catalogLimit < 1 || source.catalogLimit > 300) throw new Error(`${name}.catalogLimit 应在 1–300 之间`)
    if (name === 'netease' && (!Number.isInteger(source.albumLimit) || source.albumLimit < 1 || source.albumLimit > 100)) throw new Error('netease.albumLimit 应在 1–100 之间')
  }
  return config
}

function makeRequester(root, config, report, dryRun, refresh, fetchImpl) {
  let lastRequest = 0
  return async (url, options = {}) => {
    const { cacheable = false, ...init } = options
    const hash = createHash('sha256').update(JSON.stringify([url, init.method ?? 'GET', init.body ?? ''])).digest('hex')
    const path = join(root, 'data/raw/music-sync/cache', hash + '.json')
    if (cacheable && !refresh) {
      try {
        const cached = readJSON(path)
        if (cached && Date.now() - cached.savedAt < config.cacheHours * 3600000) {
          report.cacheHits++
          return cached.data
        }
      } catch { /* Invalid cache is refreshed, never used as a successful response. */ }
    }
    await delay(Math.max(0, config.requestDelayMs - (Date.now() - lastRequest)))
    lastRequest = Date.now()
    report.requests++
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(config.timeoutMs) })
    if (!response.ok) throw new Error(`平台请求失败（HTTP ${response.status}）`)
    const text = await response.text()
    if (text.length > 8 * 1024 * 1024) throw new Error('平台响应超出大小限制')
    let data
    try { data = JSON.parse(text) } catch { throw new Error('平台返回了无效 JSON，请稍后重试') }
    const successful = [0, 200].includes(data.code) && (!data.req_0 || data.req_0.code === 0)
    if (cacheable && !dryRun && successful) writeJSON(path, { savedAt: Date.now(), data })
    return data
  }
}

/** Replace lyrics + index as one recoverable transaction, with three local snapshots. */
export function commitDataset(root, songs, report, indexFactory = createIndex) {
  const index = indexFactory(songs)
  if (!index.songCount || !index.lineCount) throw new Error('新索引为空，保留原数据')
  const targets = [join(root, 'data/lyrics.json'), join(root, 'public/lyrics-index.json')]
  const previous = targets.map((path) => existsSync(path) ? readFileSync(path) : null)
  const backupRoot = join(root, 'data/raw/music-sync/backups')
  const backup = join(backupRoot, 'backup-' + Date.now() + '-' + randomUUID())
  mkdirSync(backup, { recursive: true })
  previous.forEach((bytes, i) => { if (bytes) writeFileSync(join(backup, i === 0 ? 'lyrics.json' : 'lyrics-index.json'), bytes) })
  writeJSON(join(backup, 'manifest.json'), { createdAt: report.startedAt, songsBefore: report.before, songsAfter: songs.length })
  try {
    writeJSON(targets[0], { songs })
    writeJSON(targets[1], index, false)
  } catch (error) {
    previous.forEach((bytes, i) => {
      if (bytes) {
        const temporary = targets[i] + '.restore-' + randomUUID()
        writeFileSync(temporary, bytes)
        renameSync(temporary, targets[i])
      } else if (existsSync(targets[i])) unlinkSync(targets[i])
    })
    throw error
  }
  // Snapshot cleanup must not turn an already committed update into a reported failure.
  try {
    for (const old of readdirSync(backupRoot).filter((name) => /^backup-\d+-[a-f\d-]+$/.test(name)).sort().slice(0, -3)) rmSync(join(backupRoot, old), { recursive: true })
  } catch { /* Retaining an extra backup is safe. */ }
  return index
}

export async function syncData({ root, providers, limit, dryRun = false, refresh = false, onProgress = () => {}, fetchImpl = fetch, config: givenConfig, adapters, indexFactory } = {}) {
  const config = validateConfig(givenConfig ?? readJSON(join(root, 'data/update-sources.json')))
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw new Error('每个平台获取歌词数量应在 1–100 之间')
  if (providers && (!Array.isArray(providers) || !providers.length || providers.some((name) => !['qq', 'netease'].includes(name)))) throw new Error('providers 只能选择 qq、netease')
  const names = [...new Set(providers ?? ['qq', 'netease'])].filter((name) => config[name].enabled)
  if (!names.length) throw new Error('没有启用任何数据源')
  const storage = join(root, 'data/raw/music-sync')
  const release = dryRun ? () => {} : acquireUpdateLock(root)
  let baseline, songs, previous = null
  try {
    // Read only after acquiring the lock so another completed update cannot be lost.
    baseline = readJSON(join(root, 'data/lyrics.json'), { songs: [] })
    if (!Array.isArray(baseline?.songs) || baseline.songs.some((song) => !song?.id || !song?.title || typeof song.lyric !== 'string')) throw new Error('现有歌曲数据格式不符合预期，未执行更新')
    songs = structuredClone(baseline.songs)
    try { previous = readJSON(join(root, 'public/data-status.json')) } catch { /* The optional report can be repaired by this update. */ }
  } catch (error) {
    release()
    throw error
  }
  const report = { version: 1, startedAt: new Date().toISOString(), status: 'running', dryRun, before: songs.length, after: songs.length, added: 0, updated: 0, sources: [], lastSuccessAt: previous?.lastSuccessAt ?? null }
  try {
    for (const name of names) {
      const source = { name, label: name === 'qq' ? 'QQ 音乐' : '网易云音乐', status: 'running', catalog: 0, fetched: 0, missing: 0, missingTitles: [], pending: 0, requests: 0, cacheHits: 0, errors: [] }
      report.sources.push(source)
      const request = makeRequester(root, config, source, dryRun, refresh, fetchImpl)
      const adapter = adapters?.[name] ?? (name === 'qq' ? createQQProvider(config, request) : createNeteaseProvider(config, request))
      onProgress({ stage: 'catalog', source: source.label, report: structuredClone(report) })
      try {
        const catalog = await adapter.catalog()
        const candidates = Array.isArray(catalog) ? catalog : catalog.songs
        if (!Array.isArray(candidates) || !candidates.length) throw new Error('数据源没有返回有效歌曲列表')
        source.catalog = candidates.length
        source.errors.push(...(catalog.errors ?? []))
        let attempts = 0, consecutiveErrors = 0
        for (const entry of candidates) {
          const candidate = structuredClone(entry)
          const existingIndex = matchSong(songs, candidate)
          const needsLyric = refresh || existingIndex < 0 || !parseLyrics(songs[existingIndex].lyric).usable
          if (needsLyric && (dryRun || attempts >= (limit ?? config.maxLyricsPerSource))) {
            source.pending++
          } else if (needsLyric) {
            attempts++
            onProgress({ stage: 'lyrics', source: source.label, current: attempts, total: limit ?? config.maxLyricsPerSource, report: structuredClone(report) })
            try {
              const parsed = parseLyrics(await adapter.lyric(candidate), candidate.title)
              if (!parsed.usable) { source.missing++; source.missingTitles.push(candidate.title) }
              else {
                Object.assign(candidate, parsed, { lyricSource: name })
                delete candidate.usable
                source.fetched++
              }
              consecutiveErrors = 0
            } catch (error) {
              source.errors.push(`${candidate.title}：${error.message}`)
              consecutiveErrors++
              if (consecutiveErrors >= 3 || /HTTP (401|403|429)|风控/.test(error.message)) {
                source.pending += candidates.length - candidates.indexOf(entry) - 1
                break
              }
              continue
            }
          }
          if (!dryRun) mergeSong(songs, candidate)
        }
        source.status = source.errors.length || source.missing ? 'partial' : 'success'
      } catch (error) {
        source.status = 'failed'
        source.errors.push(error.message)
      }
      source.errors = source.errors.slice(0, 8)
      source.missingTitles = source.missingTitles.slice(0, 8)
    }
    const successful = report.sources.some((source) => source.status !== 'failed')
    report.status = !successful ? 'failed' : report.sources.every((source) => source.status === 'success') ? 'success' : 'partial'
    // Both platforms can refer to the same song; the summary counts distinct songs.
    if (!dryRun) {
      const originals = new Map(baseline.songs.map((song) => [song.id, JSON.stringify(song)]))
      report.added = songs.filter((song) => !originals.has(song.id)).length
      report.updated = songs.filter((song) => originals.has(song.id) && originals.get(song.id) !== JSON.stringify(song)).length
    }
    if (!dryRun && successful && (report.added || report.updated)) {
      onProgress({ stage: 'index', report: structuredClone(report) })
      const index = commitDataset(root, songs, report, indexFactory)
      report.lines = index.lineCount
    } else if (!dryRun && successful && !existsSync(join(root, 'public/lyrics-index.json')) && songs.length) {
      writeJSON(join(root, 'public/lyrics-index.json'), (indexFactory ?? createIndex)(songs), false)
    }
    report.after = songs.length
    report.finishedAt = new Date().toISOString()
    if (!dryRun && successful) report.lastSuccessAt = report.finishedAt
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    report.after = baseline.songs.length
    report.added = 0
    report.updated = 0
    report.finishedAt = new Date().toISOString()
  } finally {
    try {
      if (!dryRun) {
        writeJSON(join(storage, 'last-report.json'), report)
        writeJSON(join(root, 'public/data-status.json'), report)
      }
    } finally {
      release()
    }
  }
  return report
}
