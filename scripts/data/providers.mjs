import { decodeEntities } from './model.mjs'

const BROWSER_HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }

function requireCode(data, expected, name) {
  if (data?.code !== expected) throw new Error(`${name}接口返回错误码 ${data?.code ?? '未知'}${data?.code === -462 ? '（平台风控，请稍后重试）' : ''}`)
}

function metadata(provider, id, title, artists, album, date, artist) {
  if (!id || !title || !artists.includes(artist)) return null
  // NetEase album timestamps represent a release date in China, often UTC on the previous day.
  const publishedAt = typeof date === 'number' && date > 0
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date))
    : String(date ?? '').slice(0, 10)
  const year = /^\d{4}/.test(publishedAt) ? Number(publishedAt.slice(0, 4)) : undefined
  return {
    id: provider + ':' + id, title, artist, album: album ?? '', ...(year ? { year, publishedAt } : {}),
    singerNote: artists.filter((name) => name !== artist).join('/'),
    sources: [{ provider, id: String(id), url: provider === 'qq' ? `https://y.qq.com/n/ryqq/songDetail/${id}` : `https://music.163.com/#/song?id=${id}` }],
  }
}

export function createQQProvider(config, request) {
  const settings = config.qq
  async function rpc(module, method, param, cacheable = false) {
    const payload = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST', cacheable, headers: { ...BROWSER_HEADERS, Referer: 'https://y.qq.com/', 'Content-Type': 'application/json' },
      body: JSON.stringify({ comm: { ct: 24, cv: 4747474, uin: '0', format: 'json' }, req_0: { module, method, param } }),
    })
    requireCode(payload, 0, 'QQ 音乐')
    requireCode(payload.req_0, 0, 'QQ 音乐业务')
    if (!payload.req_0.data || typeof payload.req_0.data !== 'object') throw new Error('QQ 音乐返回的数据格式不符合预期')
    return payload.req_0.data
  }
  return {
    name: 'qq', label: 'QQ 音乐',
    async catalog() {
      const data = await rpc('musichall.song_list_server', 'GetSingerSongList', { singerMid: settings.artistId, order: 2, begin: 0, num: settings.catalogLimit, number: settings.catalogLimit })
      if (!Array.isArray(data.songList)) throw new Error('QQ 音乐未返回歌曲列表')
      const songs = data.songList.map((row) => row.songInfo ?? row).map((song) => metadata('qq', song.mid, song.title || song.name,
        (song.singer ?? []).map((singer) => singer.name), song.album?.name, song.time_public ?? song.album?.time_public, config.artist)).filter(Boolean)
      if (!songs.length) throw new Error('QQ 音乐未返回目标歌手的有效曲目')
      return [...new Map(songs.map(song => [song.sources[0].id, song])).values()].slice(0, settings.catalogLimit)
    },
    async lyric(song) {
      const data = await rpc('music.musichallSong.PlayLyricInfo', 'GetPlayLyricInfo', { songMid: song.sources[0].id }, true)
      if (data.crypt) throw new Error('QQ 音乐返回加密歌词，未导入')
      const text = String(data.lyric ?? '')
      return decodeEntities(text.trim().startsWith('[') ? text : Buffer.from(text, 'base64').toString('utf8'))
    },
  }
}

export function createNeteaseProvider(config, request) {
  const settings = config.netease
  async function get(path, cacheable = false) {
    const data = await request('https://music.163.com' + path, { cacheable, headers: { ...BROWSER_HEADERS, Referer: 'https://music.163.com/' } })
    requireCode(data, 200, '网易云音乐')
    return data
  }
  return {
    name: 'netease', label: '网易云音乐',
    async catalog() {
      const data = await get(`/api/artist/albums/${settings.artistId}?limit=${settings.albumLimit}&offset=0`)
      if (!Array.isArray(data.hotAlbums) || data.artist?.name !== config.artist || String(data.artist?.id) !== settings.artistId) throw new Error('网易云音乐歌手或专辑列表不符合预期')
      const songs = [], seen = new Set()
      const errors = []
      for (const album of data.hotAlbums.slice(0, settings.albumLimit)) {
        try {
          const detail = await get(`/api/v1/album/${album.id}`)
          if (!Array.isArray(detail.songs)) throw new Error('专辑没有有效歌曲列表')
          for (const song of detail.songs) {
            const record = metadata('netease', song.id, song.name, (song.ar ?? song.artists ?? []).map((artist) => artist.name),
              song.al?.name ?? song.album?.name ?? album.name, song.publishTime || album.publishTime, config.artist)
            if (record && !seen.has(record.sources[0].id)) {
              seen.add(record.sources[0].id)
              songs.push(record)
            }
            if (songs.length >= settings.catalogLimit) break
          }
        } catch (error) {
          errors.push(`专辑 ${album.id}：${error.message}`)
          if (/HTTP (401|403|429)|风控/.test(error.message)) break
        }
        if (songs.length >= settings.catalogLimit) break
      }
      if (!songs.length) throw new Error(errors[0] ?? '网易云音乐没有返回有效曲目')
      return { songs, errors }
    },
    async lyric(song) {
      const data = await get(`/api/song/lyric?id=${song.sources[0].id}&lv=-1&tv=-1&rv=-1`, true)
      if (data.nolyric || data.uncollected) return ''
      return data.lrc?.lyric ?? ''
    },
  }
}
