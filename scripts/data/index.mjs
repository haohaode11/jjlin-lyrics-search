import { pinyin } from 'pinyin-pro'

export function createIndex(songs, generatedAt = new Date().toISOString()) {
  const lines = [], usedSongs = [], charIndex = {}, pinyinMap = {}
  const hanzi = /[\u3400-\u9fff]/u
  const syllable = (character) => pinyin(character, { toneType: 'none' }).toLowerCase()
  for (const song of songs) {
    if (!song?.lyric) continue
    const songLines = []
    let previous = ''
    for (const raw of String(song.lyric).split(/\r?\n/)) {
      const text = raw.replace(/^(?:\[[^\]]*\])+/, '').trim()
      if (!/[\p{L}\p{N}]/u.test(text) || text === previous) continue
      previous = text
      songLines.push(text)
    }
    if (!songLines.length) continue
    const songIdx = usedSongs.length
    const { lyric: _lyric, ...metadata } = song
    metadata.artist ||= '林俊杰'
    metadata.py = [...song.title].map((character) => hanzi.test(character) ? syllable(character) : /[a-z\d]/i.test(character) ? character.toLowerCase() : '').join('')
    usedSongs.push(metadata)
    for (const text of songLines) {
      const chars = [...text].filter((character) => hanzi.test(character))
      const lineIdx = lines.length
      lines.push({ s: songIdx, t: text, p: chars.map(syllable).join(' ') })
      for (const character of new Set(chars)) {
        ;(charIndex[character] ??= []).push(lineIdx)
        const key = syllable(character)
        const bucket = (pinyinMap[key] ??= [])
        if (!bucket.includes(character)) bucket.push(character)
      }
    }
  }
  return { generatedAt, songCount: usedSongs.length, lineCount: lines.length, songs: usedSongs, lines, charIndex, pinyinMap }
}
