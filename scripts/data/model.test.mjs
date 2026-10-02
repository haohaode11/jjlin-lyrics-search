import { describe, expect, it } from 'vitest'
import { decodeEntities, matchSong, mergeSong, normalizeTitle, parseLyrics } from './model.mjs'
import { createIndex } from './index.mjs'

const song = (provider = 'qq', extra = {}) => ({ id: provider + ':1', title: '新歌', artist: '林俊杰', lyric: '测试第一句\n测试第二句', sources: [{ provider, id: '1', url: 'https://example.com/song/1' }], ...extra })

describe('lyrics normalization and merge', () => {
  it('keeps English titles, digits and recording variants distinct', () => {
    expect(normalizeTitle(' Ｓｋｉｂｉｄｉ 2025 ')).toBe('skibidi2025')
    expect(normalizeTitle('新歌 (Live)')).not.toBe(normalizeTitle('新歌'))
    expect(normalizeTitle('Always')).not.toBe(normalizeTitle('Stay'))
  })
  it('decodes named and numeric entities without invalid codepoints', () => {
    expect(decodeEntities('A &amp; B &#x7231; &#29233; &#99999999;')).toBe('A & B 爱 爱 &#99999999;')
  })
  it('extracts credits and strips multiple timestamps and title headers', () => {
    const parsed = parseLyrics('[ti:新歌]\n[00:00.00]新歌 - 林俊杰\n[00:01.00]作词：测试作者\n[00:02.00]曲：测试作曲\n[00:03.00]编曲：测试编曲\n[00:04.00][01:04.00]测试第一句\n[00:05.00]Test &amp; verify', '新歌')
    expect(parsed).toEqual({ lyricist: '测试作者', composer: '测试作曲', arranger: '测试编曲', lyric: '测试第一句\nTest & verify', usable: true })
  })
  it('handles modern NetEase metadata and pure English lyric lines', () => {
    const parsed = parseLyrics('{"t":0,"c":[{"tx":"作词："},{"tx":"测试作者"}]}\n[00:10]First test line\n[00:20]Second test line')
    expect(parsed.lyricist).toBe('测试作者')
    expect(parsed.lyric).toBe('First test line\nSecond test line')
    expect(parsed.usable).toBe(true)
  })
  it('extracts English composition credits and excludes production metadata from lyrics', () => {
    const parsed = parseLyrics('Composed by: 作曲人\nArranged by: 编曲人\nWritten by: 作者\nRecording Studio: 录音室\n音乐总监：制作人\n低音吉他 BASS GUITAR：乐手\nProgrammer: 工程师\nFirst body line\nWritten in the sky: a body line')
    expect(parsed).toMatchObject({ composer: '作曲人', arranger: '编曲人', lyric: 'First body line\nWritten in the sky: a body line', usable: true })
    expect(parseLyrics('Composed by: 作曲人\nArranged by: 编曲人').usable).toBe(false)
  })
  it('keeps body lines that equal the title and song-like lines after the preamble', () => {
    const parsed = parseLyrics('[00:00]新歌 - 林俊杰\n[00:10]测试第一句\n[00:20]新歌\n[00:30]我们 - 林俊杰唱过的歌', '新歌')
    expect(parsed.lyric).toBe('测试第一句\n新歌\n我们 - 林俊杰唱过的歌')
  })
  it('rejects instrumental, credits-only and broken responses', () => {
    for (const input of ['', '[99:00]纯音乐，请欣赏', '曲：测试作者\n编曲：测试编曲', '{not json}\n[00:00]']) expect(parseLyrics(input).usable).toBe(false)
    expect(parseLyrics('1.INTRO\n作曲 Composer：作者\n混音室/后期母带处理录音室 Mixing & Mastering Studio：测试室', 'Intro').usable).toBe(false)
  })
  it('adds platform provenance without replacing usable old lyrics or IDs', () => {
    const songs = [song('qq', { id: 'legacy-id' })]
    expect(mergeSong(songs, song('netease', { lyric: '', album: '新专辑' }))).toBe('updated')
    expect(songs).toHaveLength(1)
    expect(songs[0].id).toBe('legacy-id')
    expect(songs[0].lyric).toBe('测试第一句\n测试第二句')
    expect(songs[0].sources.map(source => source.provider)).toEqual(['qq', 'netease'])
    expect(mergeSong(songs, song('netease', { lyric: '', album: '新专辑' }))).toBe('unchanged')
  })
  it('matches a platform ID when the display title changes', () => {
    const songs = [song()]
    expect(matchSong(songs, song('qq', { title: '修正歌名' }))).toBe(0)
    expect(mergeSong(songs, song('qq', { title: '修正歌名' }))).toBe('updated')
    expect(songs[0].title).toBe('修正歌名')
  })
  it('preserves annotated recording variants and rejects empty new records', () => {
    const songs = [song()]
    expect(mergeSong(songs, song('netease', { title: '新歌 (Live)' }))).toBe('added')
    expect(mergeSong(songs, song('netease', { id: 'netease:2', title: '空歌', lyric: '', sources: [{ provider: 'netease', id: '2' }] }))).toBe('skipped')
    expect(songs).toHaveLength(2)
  })
  it('keeps different IDs from the same platform as separate recordings', () => {
    const songs = [song('qq', { album: '录音室专辑' })]
    const candidate = song('qq', { id: 'qq:2', album: '现场专辑', sources: [{ provider: 'qq', id: '2' }] })
    expect(mergeSong(songs, candidate)).toBe('added')
    expect(songs[0].album).toBe('录音室专辑')
  })
  it('does not overwrite a known original album and release year with a compilation', () => {
    const songs = [song('qq', { album: '原始专辑', year: 2013 })]
    expect(mergeSong(songs, song('netease', { album: '精选合辑', year: 2025, lyric: '' }))).toBe('updated')
    expect(songs[0]).toMatchObject({ album: '原始专辑', year: 2013 })
  })
})

describe('shared index builder', () => {
  it('indexes English lyrics and retains source metadata', () => {
    const result = createIndex([song('qq', { title: 'English 2026', lyric: 'First test line\nSecond test line' })], 'fixed')
    expect(result.songCount).toBe(1)
    expect(result.lineCount).toBe(2)
    expect(result.songs[0].py).toBe('english2026')
    expect(result.songs[0].sources).toHaveLength(1)
    expect(result.songs[0]).not.toHaveProperty('lyric')
  })
  it('stores unique ascending postings and removes consecutive repeated lines', () => {
    const result = createIndex([song('qq', { lyric: '爱爱测试\n爱爱测试\n爱第二句' }), song('qq', { id: 'qq:2', title: '没有正文', lyric: '♪' })])
    expect(result.charIndex['爱']).toEqual([0, 1])
    expect(result.lineCount).toBe(2)
    expect(result.songCount).toBe(1)
  })
})
