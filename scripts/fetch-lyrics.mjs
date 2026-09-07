/**
 * 歌词抓取/整理脚手架
 *
 * 用法：
 *   1. 把歌词文件放进 data/raw/ 目录（支持 .txt 或 .lrc，纯文本每行一句）
 *   2. 在 data/raw/meta.json 里登记每首歌的元信息，格式：
 *      [
 *        { "file": "jiang-nan.txt", "id": "jiangnan", "title": "江南", "album": "第二天堂", "year": 2004 },
 *        ...
 *      ]
 *   3. 运行 npm run fetch:lyrics，将合并清洗后写入 data/lyrics.json
 *
 * 注意：歌词受著作权保护，请仅用于个人学习/演示，勿公开传播全文。
 * 推荐从获得授权或公开许可的数据源整理（详见 README「数据来源与版权」）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = join(root, 'data', 'raw')
const metaPath = join(rawDir, 'meta.json')
const outPath = join(root, 'data', 'lyrics.json')

if (!existsSync(metaPath)) {
  console.error(`缺少 ${metaPath}，请先按文件头注释登记歌曲元信息。`)
  process.exit(1)
}

const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
const tagRe = /^\[[^\]]*\]/

function cleanLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(tagRe, '').trim())
    .filter((l) => l.length > 0)
}

const songs = []
for (const item of meta) {
  const fp = join(rawDir, item.file)
  if (!existsSync(fp)) {
    console.warn(`跳过缺失文件: ${item.file}`)
    continue
  }
  const lyric = cleanLines(readFileSync(fp, 'utf8')).join('\n')
  songs.push({
    id: item.id,
    title: item.title,
    artist: item.artist || '林俊杰',
    album: item.album,
    year: item.year,
    lyric,
  })
  console.log(`已整理: ${item.title} (${item.file}, ${lyric.length} 字符)`)
}

writeFileSync(outPath, JSON.stringify({ songs }, null, 2), 'utf8')
console.log(`\n完成: ${songs.length} 首歌 -> data/lyrics.json`)
