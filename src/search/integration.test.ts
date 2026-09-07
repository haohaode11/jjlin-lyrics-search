/**
 * 集成测试：直接加载真实构建出的 public/lyrics-index.json（若存在），
 * 验证典型真实查询与“错字容错”在完整语料上的表现。
 * 前置：先运行 npm run fetch:jjqa && npm run build:index
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadIndex, search, searchSongs } from './engine'
import type { LyricsIndexFile } from './types'

const indexPath = join(process.cwd(), 'public', 'lyrics-index.json')
const hasRealData = existsSync(indexPath)

describe.skipIf(!hasRealData)('真实语料集成', () => {
  beforeAll(() => {
    const data = JSON.parse(readFileSync(indexPath, 'utf8')) as LyricsIndexFile
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => data }) as unknown as Response),
    )
    return loadIndex('irrelevant')
  })

  it('语料规模符合预期（>50 首歌）', () => {
    const stats = dataStats()
    expect(stats.songs).toBeGreaterThan(50)
    expect(stats.lines).toBeGreaterThan(2000)
  })

  it('单字“爱”能联想出结果且都含“爱”', () => {
    const r = search('爱')
    expect(r.length).toBeGreaterThan(0)
    for (const h of r.slice(0, 5)) expect(h.text.includes('爱')).toBe(true)
  })

  it('拼音 jiangnan 命中“江南烟雨”相关歌词', () => {
    const r = search('jiangnan')
    expect(r.some((h) => h.text.includes('江南'))).toBe(true)
  })

  it('错字容错：“当梦被埋再江南烟雨中”（“在”误作“再”）能模糊命中原句', () => {
    const r = search('当梦被埋再江南烟雨中')
    const exact = r.find((h) => h.text.includes('当梦被埋'))
    // 允许经编辑距离路径命中，或直接命中含“烟雨”的原句
    const hit = exact ?? r.find((h) => h.fuzzy && h.text.includes('烟雨'))
    expect(hit).toBeTruthy()
  })

  it('真实歌名“修炼爱情”命中对应歌词行', () => {
    const r = search('修炼爱情')
    expect(r.some((h) => h.text.includes('修炼爱情'))).toBe(true)
  })

  it('歌名检索“修炼爱情”带出作词(易家扬)/作曲(林俊杰)', () => {
    const r = searchSongs('修炼爱情')
    const s = r.find((h) => h.song.title === '修炼爱情')
    expect(s).toBeTruthy()
    expect(s?.song.lyricist).toContain('易家扬')
    expect(s?.song.composer).toBe('林俊杰')
  })

  it('歌名模糊检索：错字“可昔没如果”能找回《可惜没如果》', () => {
    const r = searchSongs('可昔没如果')
    expect(r.some((h) => h.song.title.includes('可惜没如果'))).toBe(true)
  })

  it('拼音歌名 jiangnan 命中《江南》', () => {
    const r = searchSongs('jiangnan')
    expect(r.some((h) => h.song.title === '江南')).toBe(true)
  })
})

function dataStats() {
  const ix = JSON.parse(readFileSync(indexPath, 'utf8')) as LyricsIndexFile
  return { songs: ix.songCount, lines: ix.lineCount }
}
