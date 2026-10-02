import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importHistoricalData } from './data/historical.mjs'
import { acquireUpdateLock, commitDataset, readJSON } from './data/sync.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let release = () => {}
try {
  release = acquireUpdateLock(root)
  const raw = readJSON(join(root, 'data/raw/cleaned_song_info.json'))
  if (!raw) throw new Error('缺少历史数据，请先运行 npm run fetch:cleaned')
  const { songs, dropped } = importHistoricalData(raw)
  const before = readJSON(join(root, 'data/lyrics.json'))?.songs?.length ?? 0
  commitDataset(root, songs, { startedAt: new Date().toISOString(), before })
  console.log(`历史初始化完成：${songs.length} 首，略过 ${dropped} 条，数据与索引已保存；原曲库已备份。`)
  console.log('日常更新请使用 npm run update:data；重复初始化会替换当前曲库。')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { release() }
