/**
 * Historical JJQA seed. If GitHub API is unavailable, use the same repository's raw file.
 * Download and validate before replacing the local source; importing is a separate step.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'data/raw/cleaned_song_info.json')
const headers = { 'User-Agent': 'jj-lyric-finder-demo' }
const rawURL = 'https://raw.githubusercontent.com/bebetterest/JJQA/main/dataset/cleaned_song_info.json'
async function request(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response
}

try {
  let text
  try {
    const meta = await (await request('https://api.github.com/repos/bebetterest/JJQA/contents/dataset/cleaned_song_info.json')).json()
    if (!/^[a-f0-9]{40}$/.test(meta.sha)) throw new Error('GitHub 文件信息格式不正确')
    const blob = await (await request(`https://api.github.com/repos/bebetterest/JJQA/git/blobs/${meta.sha}`)).json()
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new Error('GitHub 文件内容格式不正确')
    text = Buffer.from(blob.content, 'base64').toString('utf8')
  } catch (error) {
    console.log(`GitHub API 不可用（${error.message}），改用同一仓库的原始文件。`)
    text = await (await request(rawURL)).text()
  }
  if (text.length > 5 * 1024 * 1024) throw new Error('历史数据文件超出大小限制')
  const data = JSON.parse(text)
  const count = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).length : 0
  if (!count) throw new Error('历史数据不是有效歌曲记录，保留原文件')
  mkdirSync(dirname(out), { recursive: true })
  const temporary = out + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(temporary, text, { flag: 'wx' })
    renameSync(temporary, out)
  } finally { rmSync(temporary, { force: true }) }
  console.log(`已保存 ${count} 条历史记录 -> data/raw/cleaned_song_info.json`)
  console.log('SHA-256:', createHash('sha256').update(text).digest('hex'))
  console.log('初始化历史曲库：npm run import:all（会覆盖现有曲库）；日常更新：npm run update:data')
} catch (error) {
  console.error('历史数据下载失败：' + error.message)
  process.exitCode = 1
}
