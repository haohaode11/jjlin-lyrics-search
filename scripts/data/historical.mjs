import { normalizeTitle, parseLyrics } from './model.mjs'

/** Import the historical seed; choose a canonical record for each title, including English. */
export function importHistoricalData(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('历史数据必须是歌曲记录对象')
  const best = new Map()
  const score = song => (/[（(]|自白版|现场|Live|Remix|Bonus|国语|粤语|CCTV|钢琴版|Demo/i.test(song.title) ? 0 : 1000)
    + (song.year ? 10 : 0) + (song.composer ? 2 : 0) + (song.lyricist ? 2 : 0)
  let dropped = 0
  for (const entry of Object.values(data)) {
    const singers = (entry?.singer ?? []).map(singer => singer.name ?? '')
    const title = (entry?.name || entry?.title || '').trim()
    if (!title || !singers.some(name => /^林俊杰(?:$|[\s（(])/.test(name)) || /伴奏|纯音乐|KTV|\(Instrumental\)/i.test(title)) { dropped++; continue }
    const parsed = parseLyrics(entry.lyric ?? '', title)
    if (!parsed.usable) { dropped++; continue }
    const yearText = String(entry.time_public ?? '').slice(0, 4)
    const { usable: _usable, ...lyrics } = parsed
    const song = { id: String(entry.id ?? title), title, artist: '林俊杰', album: entry.album?.name || entry.album?.title || '',
      ...(/^\d{4}$/.test(yearText) ? { year: Number(yearText) } : {}), ...lyrics, singerNote: singers.filter(name => name !== '林俊杰').join('/') }
    const key = normalizeTitle(title.replace(/[（(][^（）()]*[)）]/g, ''))
    const current = best.get(key)
    if (!current || score(song) > score(current) || (score(song) === score(current) && song.lyric.length > current.lyric.length)) best.set(key, song)
    if (current) dropped++
  }
  const songs = [...best.values()].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.album.localeCompare(b.album) || a.title.localeCompare(b.title))
  if (!songs.length) throw new Error('历史数据没有可用歌曲，未覆盖现有曲库')
  return { songs, dropped }
}
