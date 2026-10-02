import { describe, expect, it, vi } from 'vitest'
import { createNeteaseProvider, createQQProvider } from './providers.mjs'

const config = { artist: '林俊杰', qq: { artistId: 'mid', catalogLimit: 60 }, netease: { artistId: '3684', albumLimit: 2, catalogLimit: 60 } }
const qqSong = { mid: 'song-mid', name: '新歌', singer: [{ name: '林俊杰' }, { name: '测试合作者' }], album: { name: '新专辑' }, time_public: '2026-02-27' }
const qqResponse = data => ({ code: 0, req_0: { code: 0, data } })

describe('QQ public provider', () => {
  it('requests the latest catalogue without cookies and filters other artists', async () => {
    const request = vi.fn().mockResolvedValue(qqResponse({ songList: [{ songInfo: qqSong }, { songInfo: { ...qqSong, mid: 'other', singer: [{ name: '其他歌手' }] } }] }))
    const songs = await createQQProvider(config, request).catalog()
    expect(songs).toHaveLength(1)
    expect(songs[0]).toMatchObject({ title: '新歌', year: 2026, singerNote: '测试合作者' })
    expect(JSON.parse(request.mock.calls[0][1].body).req_0.param.order).toBe(2)
    expect(request.mock.calls[0][1].headers).not.toHaveProperty('Cookie')
  })
  it('decodes base64 LRC but refuses encrypted responses', async () => {
    const request = vi.fn().mockResolvedValueOnce(qqResponse({ crypt: 0, lyric: Buffer.from('[00:01]测试第一句\n[00:02]测试第二句').toString('base64') })).mockResolvedValueOnce(qqResponse({ crypt: 1, lyric: 'encrypted' }))
    const provider = createQQProvider(config, request)
    const song = { sources: [{ id: 'song-mid' }] }
    expect(await provider.lyric(song)).toContain('测试第一句')
    await expect(provider.lyric(song)).rejects.toThrow('加密')
  })
  it('treats HTTP-success business errors as failures', async () => {
    const provider = createQQProvider(config, vi.fn().mockResolvedValue({ code: 0, req_0: { code: 1000, data: {} } }))
    await expect(provider.catalog()).rejects.toThrow('1000')
  })
  it('retains the full QQ title including Remix and version annotations', async () => {
    const provider = createQQProvider(config, vi.fn().mockResolvedValue(qqResponse({ songList: [{ songInfo: { ...qqSong, name: '新歌', title: '新歌 (Jazz Version)' } }] })))
    expect((await provider.catalog())[0].title).toBe('新歌 (Jazz Version)')
  })
})

describe('NetEase public provider', () => {
  it('uses current album details, removes duplicate songs and reports album errors', async () => {
    const request = vi.fn().mockResolvedValueOnce({ code: 200, artist: { id: 3684, name: '林俊杰' }, hotAlbums: [{ id: 1, publishTime: 1772121600000 }, { id: 2 }] })
      .mockResolvedValueOnce({ code: 200, songs: [{ id: 10, name: '新歌', ar: [{ name: '林俊杰' }], al: { name: '新专辑' } }, { id: 10, name: '新歌', ar: [{ name: '林俊杰' }] }, { id: 11, name: '他人歌曲', ar: [{ name: '其他歌手' }] }] })
      .mockResolvedValueOnce({ code: -462 })
    const result = await createNeteaseProvider(config, request).catalog()
    expect(result.songs).toHaveLength(1)
    expect(result.songs[0]).toMatchObject({ year: 2026, publishedAt: '2026-02-27' })
    expect(request.mock.calls[1][0]).toContain('/api/v1/album/1')
    expect(result.errors[0]).toContain('风控')
  })
  it('checks artist identity before loading albums', async () => {
    const request = vi.fn().mockResolvedValue({ code: 200, artist: { id: 1, name: '其他歌手' }, hotAlbums: [] })
    await expect(createNeteaseProvider(config, request).catalog()).rejects.toThrow('歌手')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('returns plain LRC and keeps unavailable lyrics empty', async () => {
    const request = vi.fn().mockResolvedValueOnce({ code: 200, lrc: { lyric: '[00:01]测试第一句\n[00:02]测试第二句' } }).mockResolvedValueOnce({ code: 200, uncollected: true })
    const provider = createNeteaseProvider(config, request)
    expect(await provider.lyric({ sources: [{ id: '10' }] })).toContain('测试第一句')
    expect(await provider.lyric({ sources: [{ id: '11' }] })).toBe('')
  })
})
