/**
 * 下载 JJQA 的 cleaned_song_info.json（391 条林俊杰演唱条目，含专辑/发行日/歌词/署名）
 * 用法：node scripts/fetch-cleaned.mjs
 * 输出：data/raw/cleaned_song_info.json
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'data', 'raw', 'cleaned_song_info.json')
const UA = { 'User-Agent': 'jj-lyric-finder-demo' }

let res = await fetch('https://api.github.com/repos/bebetterest/JJQA/contents/dataset/cleaned_song_info.json', {
  headers: UA,
  signal: AbortSignal.timeout(45_000),
})
if (!res.ok) {
  console.error(`contents 请求失败 HTTP ${res.status}`)
  process.exit(1)
}
const meta = await res.json()
console.log('文件 sha:', meta.sha, 'size:', meta.size)

res = await fetch(`https://api.github.com/repos/bebetterest/JJQA/git/blobs/${meta.sha}`, {
  headers: UA,
  signal: AbortSignal.timeout(120_000),
})
if (!res.ok) {
  console.error(`blob 请求失败 HTTP ${res.status}`)
  process.exit(1)
}
const blob = await res.json()
const text = Buffer.from(blob.content, 'base64').toString('utf8')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, text, 'utf8')
const count = Object.keys(JSON.parse(text)).length
console.log(`已保存 ${count} 条歌曲记录 -> data/raw/cleaned_song_info.json`)
if (existsSync(out)) console.log('下一步: npm run import:all')
