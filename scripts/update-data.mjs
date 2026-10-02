import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { syncData } from './data/sync.mjs'

try {
  const { values } = parseArgs({ options: {
    'dry-run': { type: 'boolean', default: false }, refresh: { type: 'boolean', default: false },
    providers: { type: 'string' }, limit: { type: 'string' }, help: { type: 'boolean', default: false },
  } })
  if (values.help) {
    console.log(`用法：npm run update:data -- [参数]
  --providers qq,netease  选择已启用的平台，默认全部
  --limit 20             每个平台本次获取歌词的上限（1–100）
  --dry-run              联网检查目录，不获取歌词、不写文件
  --refresh              绕过缓存，按上限重新获取已有歌词
  --help                 显示帮助
默认保留已有有效歌词，增量补新歌。参数见 data/update-sources.json。`)
  } else {
    const report = await syncData({
      root: join(dirname(fileURLToPath(import.meta.url)), '..'), dryRun: values['dry-run'], refresh: values.refresh,
      providers: values.providers?.split(',').map(name => name.trim()), limit: values.limit === undefined ? undefined : Number(values.limit),
      onProgress: ({ stage, source, current }) => console.log(stage === 'catalog' ? `${source}：检查最新曲目…` : stage === 'lyrics' ? `${source}：获取第 ${current} 首歌词…` : '正在重建检索索引…'),
    })
    console.log(JSON.stringify(report, null, 2))
    if (report.status === 'failed') process.exitCode = 1
  }
} catch (error) {
  console.error(`${error.message}\n使用 --help 查看用法。`)
  process.exitCode = 1
}
