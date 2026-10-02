import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitDataset, readJSON, syncData, writeJSON } from './sync.mjs'

const roots = []
const config = { artist: '林俊杰', timeoutMs: 1000, requestDelayMs: 0, cacheHours: 168, maxLyricsPerSource: 2, qq: { enabled: true, artistId: 'mid', catalogLimit: 10 }, netease: { enabled: true, artistId: '3684', albumLimit: 2, catalogLimit: 10 } }
const lyric = '[00:01]测试第一句\n[00:02]测试第二句'
const song = (provider, id = 'new', title = '新歌') => ({ id: provider + ':' + id, title, artist: '林俊杰', sources: [{ provider, id, url: 'https://example.com/' + id }] })
const oldSong = { id: 'legacy', title: '老歌', artist: '林俊杰', lyric: '保留第一句\n保留第二句' }
const adapter = (candidates, text = lyric) => ({ catalog: vi.fn().mockResolvedValue(candidates), lyric: vi.fn().mockResolvedValue(text) })
const broken = () => ({ catalog: vi.fn().mockRejectedValue(new Error('HTTP 403')), lyric: vi.fn() })
function workspace(songs = [oldSong]) {
  const root = mkdtempSync(join(tmpdir(), 'jjlin-sync-test-'))
  roots.push(root)
  writeJSON(join(root, 'data/lyrics.json'), { songs })
  writeJSON(join(root, 'public/lyrics-index.json'), { sentinel: 'original' })
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('recoverable data synchronization', () => {
  it('allows disabling a source without configuring its unused fields', async () => {
    const root = workspace(), netease = broken()
    const report = await syncData({ root, config: { ...config, netease: { enabled: false } }, adapters: { qq: adapter([song('qq')]), netease } })
    expect(report.status).toBe('success')
    expect(report.sources.map(source => source.name)).toEqual(['qq'])
    expect(netease.catalog).not.toHaveBeenCalled()
  })
  it('initializes songs and an index in an empty workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jjlin-sync-test-'))
    roots.push(root)
    const report = await syncData({ root, config, providers: ['qq'], adapters: { qq: adapter([song('qq')]) } })
    expect(report).toMatchObject({ status: 'success', before: 0, after: 1, added: 1 })
    expect(readJSON(join(root, 'data/lyrics.json')).songs).toHaveLength(1)
    expect(readJSON(join(root, 'public/lyrics-index.json')).songCount).toBe(1)
    expect(existsSync(join(root, 'data/raw/music-sync/update.lock'))).toBe(false)
  })
  it('keeps the original data and index when every source fails', async () => {
    const root = workspace(), before = readFileSync(join(root, 'data/lyrics.json'), 'utf8')
    const report = await syncData({ root, config, adapters: { qq: broken(), netease: broken() } })
    expect(report.status).toBe('failed')
    expect(readFileSync(join(root, 'data/lyrics.json'), 'utf8')).toBe(before)
    expect(readJSON(join(root, 'public/lyrics-index.json'))).toEqual({ sentinel: 'original' })
    expect(existsSync(join(root, 'data/raw/music-sync/update.lock'))).toBe(false)
  })
  it('commits the successful source and preserves old songs on partial failure', async () => {
    const root = workspace()
    const report = await syncData({ root, config, adapters: { qq: adapter([song('qq')]), netease: broken() } })
    expect(report).toMatchObject({ status: 'partial', added: 1, updated: 0, before: 1, after: 2 })
    expect(readJSON(join(root, 'data/lyrics.json')).songs[0]).toEqual(oldSong)
    expect(readJSON(join(root, 'public/lyrics-index.json')).songCount).toBe(2)
    expect(readdirSync(join(root, 'data/raw/music-sync/backups'))).toHaveLength(1)
  })
  it('counts a cross-platform song once and reuses existing lyrics', async () => {
    const root = workspace(), qq = adapter([song('qq')]), netease = adapter([song('netease')])
    const first = await syncData({ root, config, adapters: { qq, netease } })
    expect(first).toMatchObject({ added: 1, updated: 0, after: 2 })
    expect(netease.lyric).not.toHaveBeenCalled()
    const result = readJSON(join(root, 'data/lyrics.json')).songs[1]
    expect(result.sources.map(source => source.provider)).toEqual(['qq', 'netease'])
    const second = await syncData({ root, config, adapters: { qq, netease } })
    expect(second).toMatchObject({ added: 0, updated: 0, after: 2 })
    expect(qq.lyric).toHaveBeenCalledTimes(1)
  })
  it('honors the lyric budget and resumes pending songs on the next update', async () => {
    const root = workspace(), qq = adapter([song('qq', '1', '新歌一'), song('qq', '2', '新歌二')])
    const first = await syncData({ root, config, providers: ['qq'], limit: 1, adapters: { qq } })
    expect(first.sources[0]).toMatchObject({ fetched: 1, pending: 1 })
    const second = await syncData({ root, config, providers: ['qq'], limit: 1, adapters: { qq } })
    expect(second.sources[0]).toMatchObject({ fetched: 1, pending: 0 })
    expect(second.after).toBe(3)
  })
  it('dry-run reads only the catalogue and writes no data, locks or reports', async () => {
    const root = workspace(), qq = adapter([song('qq')]), before = readFileSync(join(root, 'data/lyrics.json'), 'utf8')
    const report = await syncData({ root, config, providers: ['qq'], dryRun: true, adapters: { qq } })
    expect(report.sources[0]).toMatchObject({ pending: 1, fetched: 0 })
    expect(qq.lyric).not.toHaveBeenCalled()
    expect(readFileSync(join(root, 'data/lyrics.json'), 'utf8')).toBe(before)
    expect(existsSync(join(root, 'data/raw'))).toBe(false)
    expect(existsSync(join(root, 'public/data-status.json'))).toBe(false)
  })
  it('keeps usable old lyrics when refresh returns unavailable lyrics', async () => {
    const root = workspace(), qq = adapter([song('qq', 'old', '老歌')], '[99:00]纯音乐，请欣赏')
    const report = await syncData({ root, config, providers: ['qq'], refresh: true, adapters: { qq } })
    expect(report.status).toBe('partial')
    expect(report.sources[0].missing).toBe(1)
    expect(readJSON(join(root, 'data/lyrics.json')).songs[0].lyric).toBe(oldSong.lyric)
  })
  it('refuses parallel writers and leaves another writer’s lock alone', async () => {
    const root = workspace()
    writeJSON(join(root, 'data/raw/music-sync/dummy.json'), {})
    const lock = join(root, 'data/raw/music-sync/update.lock')
    writeFileSync(lock, 'other-job')
    await expect(syncData({ root, config, adapters: { qq: adapter([song('qq')]) } })).rejects.toThrow('已有数据更新')
    expect(readFileSync(lock, 'utf8')).toBe('other-job')
  })
  it('repairs a malformed optional status file and releases its lock', async () => {
    const root = workspace()
    writeFileSync(join(root, 'public/data-status.json'), '{bad json')
    const report = await syncData({ root, config, providers: ['qq'], adapters: { qq: adapter([song('qq')]) } })
    expect(report.status).toBe('success')
    expect(readJSON(join(root, 'public/data-status.json')).status).toBe('success')
    expect(existsSync(join(root, 'data/raw/music-sync/update.lock'))).toBe(false)
  })
  it('releases its lock if the source dataset is malformed', async () => {
    const root = workspace()
    writeJSON(join(root, 'data/lyrics.json'), { songs: [{ id: 'bad', title: '无歌词字段' }] })
    await expect(syncData({ root, config, providers: ['qq'] })).rejects.toThrow('现有歌曲数据格式')
    expect(existsSync(join(root, 'data/raw/music-sync/update.lock'))).toBe(false)
    expect(readJSON(join(root, 'public/lyrics-index.json'))).toEqual({ sentinel: 'original' })
  })
  it('does not replace original files if indexing fails', async () => {
    const root = workspace(), before = readFileSync(join(root, 'data/lyrics.json'), 'utf8')
    const report = await syncData({ root, config, providers: ['qq'], adapters: { qq: adapter([song('qq')]) }, indexFactory: () => { throw new Error('index failed') } })
    expect(report).toMatchObject({ status: 'failed', added: 0, updated: 0, after: 1 })
    expect(readFileSync(join(root, 'data/lyrics.json'), 'utf8')).toBe(before)
    expect(readJSON(join(root, 'public/lyrics-index.json'))).toEqual({ sentinel: 'original' })
  })
  it('retains three restorable snapshots', () => {
    const root = workspace()
    for (let i = 0; i < 5; i++) commitDataset(root, [oldSong], { startedAt: 'fixed', before: 1 })
    const backups = readdirSync(join(root, 'data/raw/music-sync/backups'))
    expect(backups).toHaveLength(3)
    for (const backup of backups) expect(readJSON(join(root, 'data/raw/music-sync/backups', backup, 'lyrics.json')).songs).toEqual([oldSong])
  })
  it('stops at rate limiting instead of flooding the source with retries', async () => {
    const root = workspace(), qq = adapter([song('qq', '1', '新歌一'), song('qq', '2', '新歌二')])
    qq.lyric.mockRejectedValue(new Error('平台请求失败（HTTP 429）'))
    const report = await syncData({ root, config, providers: ['qq'], adapters: { qq } })
    expect(qq.lyric).toHaveBeenCalledTimes(1)
    expect(report.sources[0]).toMatchObject({ status: 'partial', pending: 1, fetched: 0 })
    expect(report.after).toBe(1)
  })
  it('reuses successful lyric cache after a failed commit and refresh bypasses it', async () => {
    const root = workspace()
    const fetchImpl = vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body).req_0
      const data = request.method === 'GetSingerSongList'
        ? { songList: [{ songInfo: { mid: 'new', name: '新歌', singer: [{ name: '林俊杰' }] } }] }
        : { crypt: 0, lyric: Buffer.from(lyric).toString('base64') }
      return { ok: true, text: async () => JSON.stringify({ code: 0, req_0: { code: 0, data } }) }
    })
    const failed = await syncData({ root, config, providers: ['qq'], fetchImpl, indexFactory: () => { throw new Error('index failed') } })
    expect(failed.status).toBe('failed')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const recovered = await syncData({ root, config, providers: ['qq'], fetchImpl })
    expect(recovered.sources[0]).toMatchObject({ cacheHits: 1, requests: 1, fetched: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const refreshed = await syncData({ root, config, providers: ['qq'], refresh: true, fetchImpl })
    expect(refreshed.sources[0]).toMatchObject({ cacheHits: 0, requests: 2, fetched: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })
  it('rejects malformed network JSON without replacing the original dataset', async () => {
    const root = workspace(), before = readFileSync(join(root, 'data/lyrics.json'), 'utf8')
    const report = await syncData({ root, config, providers: ['qq'], fetchImpl: async () => ({ ok: true, text: async () => '<html>blocked</html>' }) })
    expect(report.status).toBe('failed')
    expect(report.sources[0].errors[0]).toContain('无效 JSON')
    expect(readFileSync(join(root, 'data/lyrics.json'), 'utf8')).toBe(before)
  })
})
