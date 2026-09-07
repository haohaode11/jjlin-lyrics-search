/**
 * 调研辅助：下载可扩展数据源并落盘到 data/raw/，便于检查格式
 *  - JJQA 更大数据集（cleaned_song_info / song_info，若大小合适）
 *  - godweiyang/lyric-crawler 的 林俊杰_歌名.txt 与 林俊杰_歌词.txt
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = join(root, 'data', 'raw')
mkdirSync(raw, { recursive: true })

const UA = { 'User-Agent': 'jj-lyric-finder-demo' }
async function get(url, accept) {
  const r = await fetch(url, { headers: { ...UA, ...(accept ? { Accept: accept } : {}) }, signal: AbortSignal.timeout(60_000) })
  return r
}

async function fetchSmall(file, out, acceptRaw = 'application/vnd.github.raw+json') {
  try {
    const u = `https://api.github.com/repos/bebetterest/JJQA/contents/${file}`
    const r = await get(u, acceptRaw)
    if (!r.ok) { console.log(`skip ${file}: HTTP ${r.status}`); return false }
    const t = await r.text()
    if (!t.startsWith('{')) { writeFileSync(join(raw, out), t, 'utf8'); console.log(`saved ${out} (${t.length}B)`); return true }
    const meta = JSON.parse(t)
    console.log(`meta ${file}: size=${meta.size} download_url=${meta.download_url ?? '-'}`)
    return false
  } catch (e) { console.log(`err ${file}: ${e.message}`); return false }
}

// godweiyang
for (const f of ['林俊杰_歌名.txt', '林俊杰_歌词.txt']) {
  const url = `https://api.github.com/repos/godweiyang/lyric-crawler/contents/output/${encodeURIComponent(f)}`
  try {
    const r = await get(url, 'application/vnd.github.raw+json')
    if (!r.ok) { console.log(`gw ${f}: HTTP ${r.status}`); continue }
    const t = await r.text()
    writeFileSync(join(raw, `gw-${f}`), t, 'utf8')
    console.log(`gw saved gw-${f} (${t.length}B)`)
  } catch (e) { console.log(`gw ${f} err: ${e.message}`) }
}

// JJQA cleaned / song_info meta（可能 >1MB，先看大小）
for (const f of ['dataset/cleaned_song_info.json', 'dataset/song_info.json']) {
  const url = `https://api.github.com/repos/bebetterest/JJQA/contents/${f}`
  try {
    const r = await get(url)
    const meta = await r.json()
    console.log(`JJQA meta ${f}: size=${meta.size} sha=${(meta.sha || '').slice(0, 8)}`)
  } catch (e) { console.log(`JJQA meta err ${f}: ${e.message}`) }
}
