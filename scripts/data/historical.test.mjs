import { describe, expect, it } from 'vitest'
import { importHistoricalData } from './historical.mjs'
const entry = (name, id, extra = {}) => ({ name, id, singer: [{ name: '林俊杰' }], lyric: '测试第一句\n测试第二句', ...extra })
describe('historical initialization', () => {
  it('does not collapse all English titles into one empty key', () => {
    const { songs } = importHistoricalData({ a: entry('Always', 1), b: entry('Stay', 2), c: entry('Test 2024', 3) })
    expect(songs).toHaveLength(3)
  })
  it('prefers the canonical recording and parses lyrics with the shared parser', () => {
    const { songs } = importHistoricalData({ a: entry('新歌 (Live)', 1), b: entry('新歌', 2, { lyric: '[00:00]词：作者\n[00:10]新歌\n[00:20]测试正文' }) })
    expect(songs).toHaveLength(1)
    expect(songs[0]).toMatchObject({ id: '2', title: '新歌', lyricist: '作者', lyric: '新歌\n测试正文' })
  })
  it('rejects empty data and ignores other artists and instrumental entries', () => {
    expect(() => importHistoricalData({ a: entry('新歌 (Instrumental)', 1), b: entry('别的歌', 2, { singer: [{ name: '其他歌手' }] }) })).toThrow('没有可用歌曲')
  })
})
