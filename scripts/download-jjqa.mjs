/**
 * 从 GitHub 下载林俊杰歌词数据集（bebetterest/JJQA, Apache-2.0）
 * 用法：node scripts/download-jjqa.mjs
 * 输出：data/raw/hf_song.json
 * 说明：本机 raw.githubusercontent 直连易超时，依次尝试 API raw / raw 直连 / huggingface 镜像。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'data', 'raw', 'hf_song.json')

const candidates = [
  {
    name: 'api.github.com raw',
    url: 'https://api.github.com/repos/bebetterest/JJQA/contents/dataset/hf_song.json',
    headers: { 'Accept': 'application/vnd.github.raw+json', 'User-Agent': 'jj-lyric-finder-demo' },
  },
  {
    name: 'raw.githubusercontent main',
    url: 'https://raw.githubusercontent.com/bebetterest/JJQA/main/dataset/hf_song.json',
    headers: { 'User-Agent': 'jj-lyric-finder-demo' },
  },
  {
    name: 'raw.githubusercontent master',
    url: 'https://raw.githubusercontent.com/bebetterest/JJQA/master/dataset/hf_song.json',
    headers: { 'User-Agent': 'jj-lyric-finder-demo' },
  },
  {
    name: 'huggingface mirror',
    url: 'https://huggingface.co/datasets/hobeter/JJQA/resolve/main/dataset/hf_song.json',
    headers: { 'User-Agent': 'jj-lyric-finder-demo' },
  },
]

for (const c of candidates) {
  try {
    const res = await fetch(c.url, {
      headers: c.headers,
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) {
      console.log(`FAIL(${res.status}) ${c.name}`)
      continue
    }
    const text = await res.text()
    const parsed = JSON.parse(text)
    const arr = Array.isArray(parsed) ? parsed : parsed.data
    if (!Array.isArray(arr)) throw new Error('JSON 不是数组/无 data 字段')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, text, 'utf8')
    console.log(`OK ${c.name}\n已保存 ${arr.length} 首歌 -> data/raw/hf_song.json`)
    if (arr[0]) console.log('示例:', JSON.stringify(arr[0]).slice(0, 180))
    process.exit(0)
  } catch (e) {
    console.log(`FAIL ${c.name} -> ${e.message}`)
  }
}

if (existsSync(out)) console.log('提示: data/raw/hf_song.json 已存在，保留现有文件。')
console.error('所有候选地址均失败')
process.exit(1)
