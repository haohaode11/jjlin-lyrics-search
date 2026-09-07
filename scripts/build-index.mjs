/**
 * 歌词索引构建脚本
 * 输入  : data/lyrics.json  （人工整理或由 fetch-lyrics.mjs 生成）
 * 输出  : public/lyrics-index.json
 * 用途  : 构建/发布前运行一次，把「汉字 -> 行」倒排索引与拼音映射预计算出来
 * 运行  : npm run build:index
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinyin } from 'pinyin-pro'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataPath = join(root, 'data', 'lyrics.json')
const outPath = join(root, 'public', 'lyrics-index.json')

const raw = JSON.parse(readFileSync(dataPath, 'utf8'))
const songs = Array.isArray(raw.songs) ? raw.songs : []

if (songs.length === 0) {
  console.warn('[build-index] data/lyrics.json 中没有歌曲，跳过索引生成。')
  process.exit(0)
}

const hanziRe = /[\u3400-\u9fff]/
const tagRe = /^\[[^\]]*\]/ // LRC 时间标签等
const emptyRe = /^[\s\u3000\u00a0]*$/

/** 规范化一行：去两端空白、去掉 LRC 标签 */
function normalizeLine(rawLine) {
  const clean = rawLine.replace(tagRe, '').trim()
  if (!clean || emptyRe.test(clean)) return null
  if (clean.length === 1 && !hanziRe.test(clean)) return null // 单个符号行
  return clean
}

/** 单字拼音（无声调），非汉字返回空 */
function sylOf(ch) {
  if (!hanziRe.test(ch)) return ''
  return pinyin(ch, { toneType: 'none' }).toLowerCase()
}

const lines = [] // { s, t, p }
const charIndex = {}
const pinyinMap = {}
let lineCount = 0

function addChar(char, lineIdx) {
  ;(charIndex[char] ??= []).push(lineIdx)
}

/** 只保留带歌词的歌，输出 songs 下标与 lines[].s 严格对应 */
const usedSongs = []
songs.forEach((song, _origIdx) => {
  if (!song || !song.lyric) return
  const songIdx = usedSongs.length
  usedSongs.push(song)
  const textLines = String(song.lyric).split(/\r?\n/)
  let prevClean = null
  for (const rl of textLines) {
    const clean = normalizeLine(rl)
    if (!clean) continue
    if (clean === prevClean) continue // 去连续重复行
    prevClean = clean

    // 逐字生成拼音序列
    const syllables = []
    const chars = []
    for (const ch of clean) {
      if (!hanziRe.test(ch)) continue
      chars.push(ch)
      const sy = sylOf(ch)
      if (sy) syllables.push(sy)
    }
    if (chars.length === 0) continue

    lines.push({
      s: songIdx,
      t: clean,
      p: syllables.join(' '),
    })
    const lineIdx = lineCount
    for (const ch of chars) addChar(ch, lineIdx)
    for (const ch of chars) {
      const sy = sylOf(ch)
      if (!sy) continue
      const bucket = (pinyinMap[sy] ??= [])
      if (!bucket.includes(ch)) bucket.push(ch)
    }
    lineCount++
  }
})

const index = {
  generatedAt: new Date().toISOString(),
  songCount: usedSongs.length,
  lineCount,
  songs: usedSongs.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist || '林俊杰',
    album: s.album,
    year: s.year,
    lyricist: s.lyricist || '',
    composer: s.composer || '',
    arranger: s.arranger || '',
    singerNote: s.singerNote || '',
    /** 标题拼音（无空格无声调，供“拼音搜歌名”），如 江南 -> jiangnan */
    py: titlePinyin(s.title),
  })),
  lines,
  charIndex,
  pinyinMap,
}

/** 标题 -> 拼音字母串：汉字转拼音，字母数字保留小写，其余忽略 */
function titlePinyin(title) {
  let out = ''
  for (const ch of String(title)) {
    if (hanziRe.test(ch)) {
      const sy = sylOf(ch)
      if (sy) out += sy
    } else if (/[a-z0-9]/i.test(ch)) {
      out += ch.toLowerCase()
    }
  }
  return out
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(index), 'utf8')
console.log(
  `[build-index] 完成: ${usedSongs.length} 首歌, ${lineCount} 行歌词, ` +
    `${Object.keys(charIndex).length} 个索引汉字, ${Object.keys(pinyinMap).length} 个拼音音节 -> ${outPath.replace(root, '.')}`,
)
