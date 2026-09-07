/**
 * 全量歌词导入（推荐入口）
 *
 * 数据源：bebetterest/JJQA (Apache-2.0) dataset/cleaned_song_info.json
 *         —— 391 条林俊杰演唱条目，每条含 album(专辑+发行日)、完整 lyric、词曲署名行
 * 用法  ：npm run import:all
 * 输出  ：data/lyrics.json（仅个人学习/演示，请勿公开传播歌词全文）
 *
 * 清洗要点：
 *  1. 解析歌词头部署名行 -> lyricist(作词)/composer(作曲)/arranger(编曲)
 *  2. 剔除「歌名 - 林俊杰」头行、词曲制作等署名行、纯伴奏/序曲等无词条目
 *  3. 按规范化歌名去重：优先保留「无版本后缀的正典版」（如 可惜没如果 优先于
 *     可惜没如果(CCTV音乐频道)），再比发行年/歌词长度
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcPath = join(root, 'data', 'raw', 'cleaned_song_info.json')
const outPath = join(root, 'data', 'lyrics.json')

if (!existsSync(srcPath)) {
  console.error(`缺少 ${srcPath}\n请先运行: node scripts/probe-sources.mjs`)
  process.exit(1)
}

/* ---------------- 歌词解析 ---------------- */

/** 词/曲/制作等署名行（允许中英混排，如 配唱制作 VOCAL PRODUCTION：…） */
const creditStripRe =
  /^(词|曲|编曲|编\s*曲|作词|作曲|制作人|制作|监制|配唱|录音|混音|母带|后期|和声|键盘|吉他|贝斯|鼓|鼓手|弦乐|小提琴|大提琴|钢琴|OP|SP|出品|发行|企划|统筹|文案|封面|摄影|造型|服装|化妆|发型|经纪|执行|助理|版权|数位|配唱制作|录音室|混音室|原曲|原词|填词|改编|改编曲|Lyricist|Composer|Arrangement|Producer|Mixed|Mastered|Guitar|Bass|Piano|Strings|Drum)[^：:\n]{0,36}?[：:]/iu

const tagRe = /^\[[^\]]*\]/
const headerRe = /^.{0,60}?[－-].{0,40}?林俊杰/ // 「歌名 - 林俊杰 (JJ Lin)」等

/**
 * 解析署名 + 返回清洗后的歌词行。
 * 词/曲/编曲取值只认头部前 15 行；署名类行在任意位置都会被剔除出正文。
 */
function parseLyric(rawLyric) {
  const lines = String(rawLyric)
    .split(/\r?\n/)
    .map((l) => l.replace(tagRe, '').trim())
  const credits = { lyricist: '', composer: '', arranger: '' }
  const body = []
  lines.forEach((t, i) => {
    if (!t) return
    if (i < 8 && headerRe.test(t)) return
    if (creditStripRe.test(t)) {
      if (i < 15) {
        const v = t.split(/[：:]/).slice(1).join('：').trim()
        if (!credits.lyricist && /^(词|作词|Lyricist)/iu.test(t)) credits.lyricist = v
        if (!credits.composer && /^(曲|作曲|Composer)/iu.test(t)) credits.composer = v
        if (!credits.arranger && /^(编曲|编\s*曲|Arrangement)/iu.test(t)) credits.arranger = v
      }
      return
    }
    body.push(t)
  })
  return { ...credits, body }
}

/** 版本后缀检测：括号注解 或 常见版本词 → 视为「非正典版」 */
const versionRe = /[（(]|自白版|现场|Live|Remix|Bonus|录音室版|国语|粤语|CCTV|钢琴版|Demo/i
const isVariant = (title) => versionRe.test(title)

/* ---------------- 主流程 ---------------- */

const map = JSON.parse(readFileSync(srcPath, 'utf8'))
const rawList = Object.values(map).filter((e) => e && e.lyric)

const dropJunk = /伴奏|纯音乐|KTV|\(Instrumental\)/i
const dropList = []
const keep = []

for (const e of rawList) {
  const singers = (e.singer ?? []).map((s) => s.name ?? '')
  if (!singers.some((n) => n.includes('林俊杰'))) continue
  const title = (e.name || e.title || '').trim()
  if (!title) continue
  if (dropJunk.test(title)) {
    dropList.push(`[伴奏类] ${title}`)
    continue
  }
  const { lyricist, composer, arranger, body } = parseLyric(e.lyric)
  if (body.length < 2) {
    dropList.push(`[空词] ${title}`)
    continue
  }
  const yearText = (e.time_public || '').slice(0, 4)
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : undefined
  keep.push({
    id: String(e.id ?? title),
    title,
    artist: '林俊杰',
    album: (e.album && (e.album.name || e.album.title)) || '',
    year,
    lyricist,
    composer,
    arranger,
    lyric: body.join('\n'),
    singerNote: singers.filter((n) => n !== '林俊杰').join('/'),
  })
}

/** 规范化歌名：去括号版本/空白/英文后缀，用于合并同名不同版本 */
const norm = (s) =>
  s
    .replace(/[（(][^（）()]*[)）]/g, '')
    .replace(/[A-Za-z0-9 .\-—:/]+$/g, '')
    .replace(/\s+/g, '')
    .trim()

const best = new Map() // normTitle -> song
for (const s of keep) {
  const key = norm(s.title)
  const cur = best.get(key)
  if (!cur) {
    best.set(key, s)
    continue
  }
  // 优先级：正典版 > 有发行年 > 词曲署名更全 > 歌词更长
  const score = (x) =>
    (isVariant(x.title) ? 0 : 1000) + (x.year ? 10 : 0) + (x.composer ? 2 : 0) + (x.lyricist ? 2 : 0)
  const a = score(s)
  const b = score(cur)
  if (a > b || (a === b && s.lyric.length > cur.lyric.length)) {
    dropList.push(`[重复-留新] ${cur.title} (${cur.album || '?'}) -> ${s.title}`)
    best.set(key, s)
  } else {
    dropList.push(`[重复-弃] ${s.title} (${s.album || '?'})`)
  }
}

const songs = [...best.values()].sort(
  (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.album.localeCompare(b.album) || a.title.localeCompare(b.title),
)

const noCredits = songs.filter((s) => !s.lyricist && !s.composer).length
writeFileSync(outPath, JSON.stringify({ songs }, null, 2), 'utf8')

console.log(`全量导入完成: ${songs.length} 首歌 -> data/lyrics.json`)
console.log(`丢弃 ${dropList.length} 条，示例: ${dropList.slice(0, 6).join('；')}`)
console.log(`无词曲署名的歌: ${noCredits} 首`)
const yearCount = {}
for (const s of songs) yearCount[s.year ?? '未知'] = (yearCount[s.year ?? '未知'] ?? 0) + 1
console.log('发行年分布:', JSON.stringify(yearCount))
