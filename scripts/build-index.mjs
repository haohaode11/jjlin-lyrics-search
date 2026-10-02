import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIndex } from './data/index.mjs'
import { acquireUpdateLock, readJSON, writeJSON } from './data/sync.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let release = () => {}
try {
  release = acquireUpdateLock(root)
  const data = readJSON(join(root, 'data/lyrics.json'))
  if (!Array.isArray(data?.songs) || !data.songs.length) throw new Error('未找到歌曲数据。请先运行 npm run update:data 或 npm run setup:data。')
  const index = createIndex(data.songs)
  if (!index.songCount || !index.lineCount) throw new Error('没有可检索的歌词，未覆盖原索引。')
  writeJSON(join(root, 'public/lyrics-index.json'), index, false)
  console.log(`已索引 ${index.songCount} 首歌 · ${index.lineCount} 行歌词 · ${Object.keys(index.charIndex).length} 个汉字`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { release() }
