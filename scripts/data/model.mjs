/** Shared data normalization. Keep recording versions and English titles distinct. */
export const normalizeTitle = (title) => String(title ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim()

export function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return String(text).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (full, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? full
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : full
  })
}

const creditRe = /^(词|詞|作词|作詞|曲|作曲|编曲|編曲|编\s*曲|制作|製作|监制|監製|配唱|录音|錄音|混音|母带|母帶|后期|和声|和聲|和音|音乐总监|音响总监|音乐混音|成音工程师|键盘|低音吉他|吉他|贝斯|鼓|打击乐|弦乐|第[一二]小提琴|小提琴|中提琴|大提琴|钢琴|长号|小号|萨克斯|乌克丽丽|计算机音乐|原唱|OP|SP|出品|发行|统筹|企划|文案|封面|摄影|造型|服装|化妆|发型|经纪|执行|助理|数位|版权|原曲|原词|填词|改编|Lyricist|Lyrics|Composer|Composed by|Arrangement|Arranged by|Producer|Produced by|Written by|Mixed|Mixing|Mastered|Mastering|Recording|Vocal|Program|Instrument|Chorus|Guitar|Bass|Piano|Strings|Drum)[^：:\n]*[：:]/iu

export function parseLyrics(raw, title = '') {
  const credits = { lyricist: '', composer: '', arranger: '' }
  const body = []
  for (const original of decodeEntities(raw).split(/\r?\n/)) {
    let text = original.trim()
    if (text.startsWith('{')) {
      try {
        const metadata = JSON.parse(text)
        text = Array.isArray(metadata.c) ? metadata.c.map((part) => part.tx ?? '').join('') : ''
      } catch { continue }
    }
    text = text.replace(/^(?:\[[^\]]*\])+/, '').replace(/<\d+,\d+>/g, '').trim()
    if (!text || /^(纯音乐[，,]?请欣赏|纯音乐|暂无歌词|歌词暂缺|此歌曲为没有填词的纯音乐)$/u.test(text)) continue
    if (creditRe.test(text)) {
      const value = text.split(/[：:]/).slice(1).join('：').trim()
      if (/^(词|詞|作词|作詞|Lyricist|Lyrics)/iu.test(text)) credits.lyricist ||= value
      if (/^(曲|作曲|Composer|Composed by)/iu.test(text)) credits.composer ||= value
      if (/^(编曲|編曲|编\s*曲|Arrangement|Arranged by)/iu.test(text)) credits.arranger ||= value
      continue
    }
    // A title/artist header belongs to the preamble; a repeated title in the body is a lyric.
    if (!body.length && /^.{0,120}?[－-].{0,60}?林俊杰/u.test(text)) continue
    const numberedTitle = text.match(/^\d+\s*[.、]\s*(.+)$/u)
    if (!body.length && numberedTitle && normalizeTitle(numberedTitle[1]) === normalizeTitle(title)) continue
    if (/[\p{L}\p{N}]/u.test(text)) body.push(text)
  }
  return { ...credits, lyric: body.join('\n'), usable: body.length >= 2 }
}

export function matchSong(songs, candidate) {
  const source = candidate.sources?.[0]
  if (source) {
    const bySource = songs.findIndex((song) => song.sources?.some((item) => item.provider === source.provider && item.id === source.id))
    if (bySource >= 0) return bySource
  }
  const matches = songs.map((song, index) => ({ song, index })).filter(({ song }) =>
    normalizeTitle(song.title) === normalizeTitle(candidate.title)
    && normalizeTitle(song.artist) === normalizeTitle(candidate.artist)
    && (!source || !song.sources?.some(item => item.provider === source.provider)))
  if (matches.length === 1) return matches[0].index
  const albumMatches = candidate.album ? matches.filter(({ song }) => normalizeTitle(song.album) === normalizeTitle(candidate.album)) : []
  return albumMatches.length === 1 ? albumMatches[0].index : -1
}

export function mergeSong(songs, candidate) {
  const index = matchSong(songs, candidate)
  const existing = index < 0 ? null : songs[index]
  if (!existing && !parseLyrics(candidate.lyric ?? '').usable) return 'skipped'
  const merged = existing ? { ...existing } : { ...candidate }
  for (const key of ['title', 'artist', 'singerNote', 'lyricist', 'composer', 'arranger']) {
    if (candidate[key] !== undefined && candidate[key] !== '') merged[key] = candidate[key]
  }
  for (const key of ['album', 'year', 'publishedAt']) {
    if (!merged[key] && candidate[key]) merged[key] = candidate[key]
  }
  if (parseLyrics(candidate.lyric ?? '').usable) {
    merged.lyric = candidate.lyric
    merged.lyricSource = candidate.lyricSource
  }
  const sources = new Map((existing?.sources ?? []).map((source) => [source.provider + ':' + source.id, source]))
  for (const source of candidate.sources ?? []) sources.set(source.provider + ':' + source.id, source)
  merged.sources = [...sources.values()]
  if (existing) {
    merged.id = existing.id
    if (JSON.stringify(existing) === JSON.stringify(merged)) return 'unchanged'
    songs[index] = merged
    return 'updated'
  }
  songs.push(merged)
  return 'added'
}
