# JJ 歌词速查

Vue 3 + TypeScript + Vite 的本地歌词检索工具。支持单字、多字、拼音、模糊歌词与歌名搜索，显示词曲署名和命中位置。搜索在浏览器内完成；QQ 音乐和网易云音乐由本地服务手动更新。

## 开始使用

安装 Node.js 后，在项目目录运行：

```bash
npm ci
npm run setup:data   # 下载历史数据，清洗并生成索引；首次使用执行
npm run dev          # 打开终端显示的本地地址
```

页面点击 **更新数据**，即可检查两平台目录、补充新歌并自动载入新索引。也可直接执行 `npm run update:data` 建立近期曲库，之后启动页面。

**日常使用 `update:data`。** `setup:data` 和 `import:all` 是历史初始化，会替换当前曲库，并先备份原数据。仓库仅包含源码和结构示例，生成的歌词与索引保存在本地。

当前工作区还提供可删除的临时运行基线：

```bash
.baseline.local/start.sh                       # http://127.0.0.1:5173
.baseline.local/run.sh run update:data          # 命令更新
.baseline.local/run.sh test                     # 检查
.baseline.local/run.sh run build                # 构建
python3 .baseline.local/cleanup.py --stop-only  # 关闭临时服务
python3 .baseline.local/cleanup.py              # 删除临时运行环境、生成数据及缓存
```

清理脚本核验并关闭自己的服务，保留项目源码、配置和借用的 Node。临时目录不随仓库分发；正常 Node/npm 环境直接使用上面的标准命令。

## 更新命令

页面和命令使用同一套更新逻辑：

```bash
npm run update:data                           # 默认检查两个平台
npm run update:data -- --providers qq          # 只检查 QQ 音乐
npm run update:data -- --providers netease     # 只检查网易云音乐
npm run update:data -- --limit 2               # 每个平台最多获取 2 首歌词
npm run update:data -- --dry-run               # 联网检查目录，不获取歌词、不写文件
npm run update:data -- --refresh --limit 5     # 绕过缓存，重取目录中前 5 首候选的歌词
npm run update:data -- --help                  # 参数说明
```

默认保留有效歌词，优先匹配平台曲目 ID；跨平台使用完整歌名和歌手匹配，存在歧义时再核对专辑。同一平台不同 ID 的录音分别保存，版本名（Live、Remix、Jazz 等）保留。已有专辑和年份保留，仅补齐缺少的字段。

达到歌词获取上限后，再次普通更新会继续补充。平台没有可用歌词的曲目会列为未完成项，等待下次重试；新曲目至少有两行有效歌词才入库。`--refresh` 每次从目录开头按上限重取，并不轮转整个历史曲库。

## 调整配置

编辑 [data/update-sources.json](data/update-sources.json)，下一次更新即生效。目录每次联网重新检查；缓存仅用于歌词。

| 配置 | 默认 | 用途 / 范围 |
|---|---:|---|
| `artist` | 林俊杰 | 目标歌手名称，与平台 ID 对应 |
| `qq.enabled` / `netease.enabled` | true | 开关数据源；关闭时该源其他字段可省略 |
| `qq.artistId` | 001BLpXF2DyJe2 | QQ 歌手 MID |
| `netease.artistId` | 3684 | 网易云歌手 ID |
| 各源 `catalogLimit` | 60 | 每次最多检查的曲目，1–300 |
| `netease.albumLimit` | 8 | 从近期专辑中取曲目，1–100 |
| `maxLyricsPerSource` | 20 | 每次每源获取歌词上限，1–100；命令 `--limit` 可覆盖 |
| `timeoutMs` | 12000 | 单次请求超时，1000–60000 毫秒 |
| `requestDelayMs` | 400 | 请求间隔，0–10000 毫秒 |
| `cacheHours` | 168 | 歌词缓存，0–8760 小时；0 表示不复用 |

这些上限控制本次读取范围，不表示平台或歌手的全部作品。切换歌手时需同时调整名称和 ID；现有曲库仍保留，要建立单独曲库请使用独立项目副本。

手动补充歌曲：按 [data/schema.example.json](data/schema.example.json) 编辑本地 `data/lyrics.json`，再运行 `npm run build:index`。每首歌需要唯一 `id`、`title`、`artist` 和按行分隔的 `lyric`；专辑、年份、署名、平台来源为可选字段。

## 故障与恢复

- 一个平台失败时仍可保存另一平台的结果；两个平台都失败时保留原曲库。页面可展开查看未完成项。
- 更新前保存最近三份数据与索引快照，位于 `data/raw/music-sync/backups/`；原始响应缓存和详细报告也在 `data/raw/music-sync/`。
- 恢复时，先停止更新，将选中快照的 `lyrics.json` 复制回 `data/lyrics.json`，运行 `npm run build:index` 后刷新页面。更新报告是检查记录，恢复歌词不会改写该记录。
- 页面与命令共用文件锁。异常退出若留下 `data/raw/music-sync/update.lock`，确认更新进程已停止后再删除它。
- 更新期间服务连接中断，页面会继续核对进度；可点击 **重新连接** 读取状态。它不会自动重复提交更新。

## 检查与静态构建

```bash
npm test             # 搜索、解析、合并、平台适配、本地接口与失败保留
npm run build:index  # 从本地歌词重建索引
npm run build        # 重建索引、类型检查、生成 dist/
npm run preview      # 预览静态产物
```

真实曲库集成测试需要先生成索引；缺少数据时会明确跳过。测试中的平台响应为固定样例，实际连接结果以更新报告为准。

**页面更新仅在本地开发服务启用。** 接口检查本机连接、请求来源与专用请求头，不接受页面传入的任意配置。静态产物只读已保存的数据和更新记录；要更新静态版本，在构建机运行 `update:data` 后重新构建。

## 代码入口

| 文件 | 调整内容 |
|---|---|
| `scripts/data/providers.mjs` | QQ / 网易云目录和歌词读取 |
| `scripts/data/model.mjs` | 歌名匹配、版本保留、歌词清洗与合并 |
| `scripts/data/historical.mjs` | 历史数据筛选、去重；保留不同英文歌名 |
| `scripts/data/sync.mjs` | 配置、限额、缓存、锁、备份与保存 |
| `scripts/data/index.mjs` | 汉字倒排、拼音映射和歌名索引 |
| `scripts/data/dev-api.mjs` | 本地更新接口 |
| `src/search/engine.ts` | 搜索排序、容错与命中高亮 |
| `src/components/DataUpdate.vue` | 更新按钮、进度和结果 |
| `src/components/SongDetail.vue` | 署名、平台链接和歌词定位 |

历史初始化入口是 `fetch:cleaned` → `import:all`（同时生成索引）。旧的 `fetch:jjqa`、`fetch:lyrics` 和探测脚本保留为备用，日常使用无需调用。

## 数据来源与许可

历史数据来自 [bebetterest/JJQA](https://github.com/bebetterest/JJQA) 的 `cleaned_song_info.json`。当前核验快照有 391 条记录，清洗后保留 355 首；在线更新后的数量见页面和本地 `public/data-status.json`。

更新器匿名直接访问 QQ 音乐和网易云音乐，不需要账号、Cookie 或代理。读取结构参考 [QQ 歌手曲目](https://github.com/ylw1997/qqmusic-api/blob/master/docs/apis/get-singer-songs.md)、[QQ 歌词](https://github.com/ylw1997/qqmusic-api/blob/master/docs/apis/get-lyric.md) 和 [网易云专辑](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/blob/main/module/album.js) 的公开实现。这些读取路径可能变化或受平台限流影响，失败时保留已有数据。

代码许可为 [MIT](LICENSE)。歌词版权归原权利人所有，生成的全文、索引、缓存、报告和备份均被 Git 忽略；本项目用于个人学习和演示，请勿公开传播歌词全文。历史来源调研见 [docs/lyrics-data-report.md](docs/lyrics-data-report.md)。
