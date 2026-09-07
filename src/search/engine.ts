/**
 * 检索引擎
 *
 * 设计要点（数据量 ~2 万行歌词，全部常驻内存）：
 *  1. 汉字：charIndex 倒排表 O(1) 取行集合，多字取交集（强命中优先）
 *  2. 拼音：pinyinMap 音节前缀/整串切分（jiang -> 江/将；jiangnan -> 江南），再经 charIndex 落到行
 *  3. 模糊：严格路径无结果或结果稀疏时，用 Fuse.js 做编辑距离容错（容忍错字/记岔的歌词）
 *  4. 全部逻辑在浏览器内完成，单次查询毫秒级
 */
import Fuse from 'fuse.js'
import type { LyricsIndexFile, SearchHit, SongHit, SongMeta } from './types'

const MAX_SUGGEST = 8

let file: LyricsIndexFile | null = null
let songs: SongMeta[] = []
let lines: LyricsIndexFile['lines'] = []
/** 音节表，长音节在前，便于贪心切分（jiang > ji > j） */
let syllables: string[] = []
let fuse: Fuse<{ lineIdx: number; t: string; p: string }> | null = null

export function isLoaded(): boolean {
  return file !== null
}

export function getStats() {
  return file
    ? { songs: file.songCount, lines: file.lineCount, generatedAt: file.generatedAt }
    : null
}

export async function loadIndex(url = './lyrics-index.json'): Promise<LyricsIndexFile> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`歌词索引加载失败（HTTP ${res.status}）`)
  file = (await res.json()) as LyricsIndexFile
  songs = file.songs
  lines = file.lines
  syllables = Object.keys(file.pinyinMap).sort((a, b) => b.length - a.length)
  fuse = new Fuse(
    lines.map((l, i) => ({ lineIdx: i, t: l.t, p: l.p })),
    {
      keys: [
        { name: 't', weight: 0.75 },
        { name: 'p', weight: 0.25 },
      ],
      includeScore: true,
      includeMatches: true,
      threshold: 0.38,
      distance: 160,
      ignoreLocation: false,
      minMatchCharLength: 1,
      shouldSort: true,
    },
  )
  return file
}

/** 全部歌曲（按数据顺序，用于歌单浏览） */
export function allSongs(): SongMeta[] {
  return songs
}

/** 某首歌的全部歌词行文本 */
export function linesOfSong(songIdx: number): string[] {
  return lines.filter((l) => l.s === songIdx).map((l) => l.t)
}

const isHanzi = (ch: string) => /[\u3400-\u9fff]/.test(ch)

function charLines(char: string): number[] {
  return file?.charIndex[char] ?? []
}

/** 两指针求两个升序数组交集 */
function intersect(a: number[], b: number[]): number[] {
  const out: number[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(a[i])
      i++
      j++
    } else if (a[i] < b[j]) i++
    else j++
  }
  return out
}

/** 求一组升序数组的交集 */
function intersectAll(sets: number[][]): number[] {
  if (!sets.length) return []
  let acc = sets[0]
  for (let k = 1; k < sets.length && acc.length; k++) acc = intersect(acc, sets[k])
  return acc
}

function countChar(text: string, ch: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) if (text[i] === ch) n++
  return n
}

/** 贪心切分连续拼音串为音节序列；失败返回 null */
function segment(letters: string): string[] | null {
  let rest = letters
  const out: string[] = []
  while (rest.length > 0) {
    const hit = syllables.find((s) => rest.startsWith(s))
    if (!hit) return null
    out.push(hit)
    rest = rest.slice(hit.length)
  }
  return out
}

/** 一个查询“单元”匹配出的汉字集合（单个汉字 -> 自身；拼音单元 -> 发音匹配的字） */
function charsOfGroup(block: string): string[] {
  if (/^[\u3400-\u9fff]$/.test(block)) return [block]
  const set = new Set<string>()
  const seg = segment(block)
  if (seg) {
    for (const sy of seg) {
      const cs = file?.pinyinMap[sy] ?? []
      for (const c of cs) set.add(c)
    }
    return [...set]
  }
  // 整串切不开 -> 按“前缀”联想（边打字边出结果，如 j -> 就/将/江…）
  for (const sy of syllables) {
    if (sy.startsWith(block)) {
      const cs = file?.pinyinMap[sy] ?? []
      for (const c of cs) set.add(c)
    }
  }
  return [...set]
}

/** 生成一段文本的高亮位置 */
function hlChars(text: string, matched: string[]): number[] {
  const pos: number[] = []
  for (let i = 0; i < text.length; i++) if (matched.includes(text[i])) pos.push(i)
  return pos
}

/**
 * 主检索入口。
 * 支持：纯汉字（含多字短语）、拼音（jiang / jiang nan / jiangnan）、汉拼混输。
 */
export function search(rawQuery: string, limit = MAX_SUGGEST): SearchHit[] {
  if (!file || !fuse) return []
  const q = rawQuery.trim()
  if (!q) return []

  // 1) 解析查询为若干“单元”：汉字字符 或 拼音音节块
  const groups: string[] = []
  const pushGroup = (g: string) => {
    if (!groups.includes(g)) groups.push(g)
  }
  for (const h of q.match(/[\u3400-\u9fff]/g) ?? []) pushGroup(h)
  for (const lb of (q.toLowerCase().match(/[a-z]+/g) ?? [])) {
    const seg = segment(lb)
    if (seg && seg.length > 1) seg.forEach(pushGroup)
    else pushGroup(lb) // 单个音节：整块做前缀匹配
  }
  if (!groups.length) return []

  // 2) 每个单元 -> 匹配汉字 -> 命中的行集合（升序去重）
  const groupChars = groups.map(charsOfGroup)
  const groupLines = groupChars.map((cs) => {
    const set = new Set<number>()
    for (const c of cs) for (const li of charLines(c)) set.add(li)
    return [...set].sort((a, b) => a - b)
  })

  // 3) 强命中：全部单元都出现于同一行
  const strong = intersectAll(groupLines)

  const hits = new Map<number, SearchHit>()
  const pushHit = (lineIdx: number, chars: string[], score: number, fuzzy: boolean) => {
    if (hits.has(lineIdx)) return
    const l = lines[lineIdx]
    hits.set(lineIdx, {
      lineIdx,
      text: l.t,
      matchedChars: chars,
      song: songs[l.s],
      score,
      fuzzy,
      hlPositions: hlChars(l.t, chars),
    })
  }

  for (const idx of strong) {
    let occ = 0
    for (const cs of groupChars) for (const c of cs) occ += countChar(lines[idx].t, c)
    pushHit(idx, groups, 1000 + occ, false)
  }

  // 4) 模糊兜底：无全命中，或查询偏长且命中稀少（错字/记岔歌词时靠它）
  const needFuzzy = strong.length === 0 || (groups.length >= 2 && hits.size < 3)
  if (needFuzzy && fuse) {
    const r = fuse.search(q, { limit: limit * 2 })
    for (const item of r) {
      const { lineIdx } = item.item
      if (hits.has(lineIdx)) continue
      const pos = new Set<number>()
      const chars: string[] = []
      const text = lines[lineIdx].t
      for (const m of item.matches ?? []) {
        if (m.key !== 't') continue
        for (const [a, b] of m.indices ?? []) {
          for (let i = a; i <= b && i < text.length; i++) {
            pos.add(i)
            const ch = text[i]
            if (isHanzi(ch) && !chars.includes(ch)) chars.push(ch)
          }
        }
      }
      hits.set(lineIdx, {
        lineIdx,
        text,
        matchedChars: chars,
        song: songs[lines[lineIdx].s],
        score: (1 - (item.score ?? 0)) * 500,
        fuzzy: true,
        hlPositions: [...pos].sort((x, y) => x - y),
      })
    }
  }

  // 5) 弱命中：只覆盖部分单元（单字联想、部分命中短语时填充）
  if (hits.size < limit) {
    const seen = new Set(hits.keys())
    const union = new Map<number, number>()
    groupChars.forEach((cs) => {
      for (const c of cs) {
        for (const idx of charLines(c)) {
          if (seen.has(idx)) continue
          union.set(idx, (union.get(idx) ?? 0) + countChar(lines[idx].t, c))
        }
      }
    })
    const weak = [...union.entries()].sort((a, b) => b[1] - a[1])
    for (const [idx, occ] of weak) {
      if (hits.size >= limit) break
      pushHit(idx, groups.length > 1 ? [groups[0]] : groups, 100 + occ, false)
    }
  }

  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/* ================= 歌名检索 ================= */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev.splice(0, prev.length, ...cur)
  }
  return prev[b.length]
}

/** q 是否为 title 的“子序列”（按顺序出现，可跳字），返回跳字数；不是则 -1 */
function subseqGap(title: string, q: string): number {
  let ti = 0
  let qi = 0
  while (qi < q.length && ti < title.length) {
    if (title[ti] === q[qi]) qi++
    ti++
  }
  return qi === q.length ? ti - q.length : -1
}

/**
 * 歌名检索（含模糊）：支持 歌名全字 / 部分子序列 / 少量错字（编辑距离≤2）/
 * 拼音（jiangnan / jiang / ji…）。返回 top 联想歌曲，供“歌名搜索 + 显示词曲人”。
 */
export function searchSongs(rawQuery: string, limit = 4): SongHit[] {
  if (!file) return []
  const q = rawQuery.trim().toLowerCase()
  if (q.length < 2) return []
  const hanzi = q.match(/[\u3400-\u9fff]/g) ?? []
  const letters = q.match(/[a-z0-9]+/g) ?? []
  if (!hanzi.length && !letters.length) return []

  const results: SongHit[] = []
  songs.forEach((song, idx) => {
    const title = song.title.toLowerCase()
    const py = (song.py ?? '').toLowerCase()
    let score = 0

    // 汉字/整句路径
    if (hanzi.length) {
      if (title.includes(q)) score = Math.max(score, 400) // 全字包含
      else {
        const gap = subseqGap(title, q)
        if (gap >= 0) score = Math.max(score, gap <= 2 ? 240 : 180) // 子序列（跳 1-2 字也算较准）
        else if (q.length >= 2 && q.length <= 8) {
          const d = levenshtein(title, q)
          if (d <= 1) score = Math.max(score, 150) // 错 1 字
          else if (d === 2) score = Math.max(score, 70)
        }
        // 汉字查询若只命中其中单字，给很低分避免刷屏
        if (score === 0 && hanzi.length === 1 && title.includes(hanzi[0])) score = 50
      }
    }

    // 拼音路径
    if (letters.length) {
      const L = letters.join('')
      if (py.startsWith(L)) score = Math.max(score, 260)
      else if (py.includes(L)) score = Math.max(score, 150)
      else if (L.length >= 3 && Math.abs(py.length - L.length) <= 2) {
        const d = levenshtein(py, L)
        if (d <= 2) score = Math.max(score, 80)
      }
    }

    if (score > 0) results.push({ songIdx: idx, song, score })
  })

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}
