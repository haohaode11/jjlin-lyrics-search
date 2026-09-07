# 🎶 JJ 歌词速查 · 林俊杰歌词快速检索

> 输入**一个字**，毫秒级联想出包含它的某句歌词；支持**拼音检索**与**模糊容错**；**搜歌名时直接显示作词/作曲人**。
> 全部检索在浏览器本地完成 —— 无后端、无搜索 API、无隐私上传，可一键部署为纯静态站点。

![Vue 3](https://img.shields.io/badge/Vue-3.x-42b883?logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/tests-23%20passed-6abf40)
![License](https://img.shields.io/badge/License-MIT-green)
![Privacy](https://img.shields.io/badge/100%25-client--side-blueviolet)

---

## ✨ 功能特性

| 能力 | 说明 | 示例 |
|---|---|---|
| 🔍 **单字联想** | 汉字倒排索引 O(1) 查表，边打字边出结果 | 输入 `爱` → 219+ 句含「爱」的歌词 |
| 🈶 **多字强命中** | 多个字同时命中同一句的排最前 | `江南` → 「当梦被埋在江南烟雨中」 |
| 🔊 **拼音检索** | 支持单音节前缀 / 整串自动切分（汉字、歌名均可） | `jiang`、`jiangnan`、`xiulianaiqing` |
| 🎭 **模糊容错** | 编辑距离兜底：整句记岔、错别字、歌词不完整都能找回 | `当梦被埋*再*江南烟雨中` → 原句「埋在」 |
| 🎵 **歌名搜词曲人** | 联想框顶部出现歌曲卡片，直接展示**作词 / 作曲 / 编曲** | 搜 `修炼爱情` → 词：易家扬 · 曲：林俊杰 |
| 🏷️ **命中高亮** | 命中字高亮标注；点选后查看整首歌并**定位该句** |
| 🖥️ **纯前端** | 歌词与索引打进静态文件，浏览器内存内检索，毫秒级响应，可断网运行 |

---

## 🚀 快速开始

> 仓库**不含歌词全文**（版权合规）。首次运行需先执行一步数据生成（联网从数据源下载，之后可离线运行）。

```bash
# 1. 安装依赖
npm install

# 2. 一步生成歌词数据 + 索引（下载 391 条记录 -> 清洗 293 首 -> 构建索引）
npm run setup:data

# 3. 启动开发服务器
npm run dev             # 打开 http://localhost:5173
```

`setup:data` 等价于以下三步（可单独执行）：

```bash
npm run fetch:cleaned   # ① 下载 391 条林俊杰原始记录（专辑/发行日/歌词/署名）
npm run import:all      # ② 清洗去重、解析词曲编曲署名 -> data/lyrics.json
npm run build:index     # ③ 生成前端索引 public/lyrics-index.json
```

默认附带 `data/schema.example.json` 展示数据结构；`data/lyrics.json` 与 `data/raw/` 已被 `.gitignore` 排除，不会进入版本库。

---

## 🏗 技术架构

```
┌────────────────────────────── 浏览器（无服务器） ─────────────────────────────┐
│                                                                             │
│  输入 "jiang" / "爱" / "修炼爱情"                                             │
│        │                                                                     │
│        ▼                                                                     │
│  ┌─────────────────────────── 检索引擎 (src/search/engine.ts) ────────────┐  │
│  │  汉字路径   charIndex 倒排表 ──► 多字交集 ──► 弱命中填充                   │  │
│  │  拼音路径   pinyinMap 音节前缀 / 贪心整串切分                              │  │
│  │  模糊路径   Fuse.js 编辑距离兜底（Fuzzy）                                  │  │
│  │  歌名路径   searchSongs：包含/子序列/编辑距离/标题拼音(py)                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│        │                                │                                     │
│        ▼                                ▼                                     │
│  ┌───────────┐                  ┌──────────────────┐                          │
│  │ 🎵 歌曲卡片 │◄──── 合并 ────► │ 📝 歌词行联想列表   │                        │
│  │ 词曲编曲人 │                  │ 命中字高亮 · 耗时显示 │                       │
│  └───────────┘                  └──────────────────┘                          │
│        │                                │                                     │
│        └────────── 点选 ────────────────┘                                     │
│                     ▼                                                         │
│         🎼 歌词详情：整首歌词 + 词曲署名 + 命中句高亮定位                          │
└─────────────────────────────────────────────────────────────────────────────┘

      构建期（node scripts/build-index.mjs，运行一次）
      data/lyrics.json ──► 汉字→行倒排表 / 音节→汉字 / 歌名拼音(py) ──► lyrics-index.json
```

### 数据结构

```jsonc
// data/lyrics.json（由 import:all 生成）
{
  "songs": [{
    "id": "string", "title": "修炼爱情", "artist": "林俊杰",
    "album": "因你 而在", "year": 2013,
    "lyricist": "易家扬", "composer": "林俊杰", "arranger": "吴庆隆",
    "singerNote": "",                       // 合作歌手（如 金莎）
    "lyric": "凭什么要失望\n藏眼泪到心脏\n…"  // 纯文本歌词，一行一句
  }]
}
```

### 检索原理（为什么能做到“打字即出词”）

1. **单字联想 = O(1) 查表**：构建期预生成 `汉字 → 命中行下标` 的倒排索引，输入一个字就是一次哈希查找，无需扫描文本。
2. **多字 = 有序数组求交集**：两个升序行号集合两指针相交，强命中（全部字出现在同一句）永远排最前。
3. **拼音 = 音节映射 + 贪心切分**：`pinyinMap` 记录 `音节→汉字`；`jiangnan` 按最长音节贪心切成 `jiang + nan` 后与汉字路径同流程。
4. **模糊 = 编辑距离兜底**：严格路径无结果或结果稀疏时，用 Fuse.js 做位图近似匹配，容忍错字与记岔的句子。
5. **歌名检索**：包含匹配 / 有序子序列（可跳 1-2 字）/ 编辑距离 ≤2 / 标题拼音前缀，四条路径打分取优。

| 查询类型 | 路径 | 典型耗时（本机演示实测） |
|---|---|---|
| 单字联想 | 倒排表查表 | **< 5ms** |
| 拼音 / 多字 | 音节映射 + 交集 | < 10ms |
| 模糊兜底（全量 1.2 万行） | Fuse.js | < 100ms |
| 索引加载（1.2MB，本地） | fetch + 解析 | ~70ms |

> 输入框每次查询后实时显示耗时（如 `2.1ms · 3 首歌曲 / 8 句歌词`）。「1 秒内」的需求被甩开一个数量级以上。

---

## 📂 项目结构

```
├── index.html                  # 入口页
├── vite.config.ts              # Vite 配置（base:'./' 便于任意子路径部署）
├── package.json / tsconfig.json
├── data/
│   ├── lyrics.json             # ★ 本地歌词数据（gitignore，不入库）
│   ├── schema.example.json     # 数据结构示例（入库）
│   └── raw/                    # 原始数据集（gitignore）
├── public/
│   └── lyrics-index.json       # ★ 构建产物索引（gitignore，本地生成）
├── scripts/
│   ├── fetch-cleaned.mjs       # 下载 JJQA cleaned_song_info.json（391 条）
│   ├── import-all.mjs          # 清洗：署名解析 / 剔伴奏空词 / 正典版去重
│   ├── build-index.mjs         # 生成倒排索引 + 拼音映射 + 歌名拼音
│   ├── probe-sources.mjs       # 数据源调研下载（godweiyang 文本，可选）
│   ├── download-jjqa.mjs       # （旧版 181 首源，备用）
│   └── import-jjqa.mjs         # （旧版精选导入，备用）
├── src/
│   ├── search/
│   │   ├── engine.ts           # ★ 检索引擎（歌词行 + 歌名双路径）
│   │   ├── engine.test.ts      # 单元测试（固定语料）
│   │   ├── integration.test.ts # 集成测试（真实语料，无数据时自动跳过）
│   │   ├── highlight.ts        # 命中高亮分段
│   │   └── types.ts            # 类型定义
│   ├── components/
│   │   ├── SearchBox.vue       # 联想框（歌曲卡片 + 歌词行）
│   │   └── SongDetail.vue      # 歌词详情（词曲署名 + 定位高亮）
│   ├── App.vue                 # 主界面
│   └── style.css
├── docs/
│   └── lyrics-data-report.md   # 数据来源调研报告
├── LICENSE                     # MIT
└── README.md
```

---

## 🧪 测试与开发命令

```bash
npm run dev            # 开发服务器 http://localhost:5173
npm test               # vitest：23 项（15 单元 + 8 真实语料集成）
npm run build          # 索引构建 + 类型检查 + 生产打包（dist/）
npm run preview        # 本地预览 dist/
npm run fetch:cleaned  # 下载全量原始数据（本地）
npm run import:all     # 清洗 -> data/lyrics.json（本地）
npm run build:index    # 仅重建索引
```

集成测试使用真实索引（`public/lyrics-index.json`），未生成数据时自动跳过，不会报红。

---

## 📚 数据来源与版权（必读）

- 数据来自 [bebetterest/JJQA](https://github.com/bebetterest/JJQA)（Apache-2.0）`cleaned_song_info.json`：391 条林俊杰演唱记录（2003-2023 专辑 + 单曲 + 合作 + 录音室翻唱），清洗后约 **293 首**入库。
- **歌词受《著作权法》保护**。GitHub 仓库的 Apache-2.0 仅覆盖数据整理，**不授予歌词版权**。本项目默认合规策略：
  1. 仓库**不含任何歌词全文**（`data/lyrics.json`、`data/raw/`、`public/lyrics-index.json` 均已 gitignore），歌词由使用者本地脚本生成；
  2. 请勿将生成的歌词数据公开传播或商用；
  3. 若做公开演示，建议只展示命中片段并外链官方音乐平台；
  4. 页面显著标注「歌词版权归原权利人，仅供个人学习演示」。
- 完整调研（备选数据源、LRCLIB 补新歌、API 评估、合规分析）：[docs/lyrics-data-report.md](docs/lyrics-data-report.md)。

---

## ☁️ 部署（纯静态）

项目构建产物为纯静态文件（`base: './'`），可部署到任意静态托管：

```bash
npm run build          # 产物在 dist/
npm run preview        # 本地验证

# 例如部署到 GitHub Pages（需自行配置 Pages 指向 dist）
npx gh-pages -d dist
# 或 Vercel / Netlify：构建命令 npm run build，输出目录 dist
```

> 注意：部署环境无法联网拉取歌词时，请在构建机执行 `npm run fetch:cleaned && npm run import:all` 生成 `public/lyrics-index.json`（或把数据文件放到 CDN 后修改 `loadIndex(url)`）。

---

## 🗺 Roadmap

- [x] 单字 / 多字 / 拼音 / 模糊歌词检索
- [x] 歌名检索 + 词曲人展示（含拼音、错字容错）
- [x] 全量数据管道（391 条 → 293 首清洗入库）
- [ ] 左侧歌单按专辑分组 / 词曲人筛选
- [ ] LRCLIB 增量补新歌（2024+）
- [ ] 英文歌词 / 拼音首字母（`jj`）检索
- [ ] 深色 / 浅色主题切换

---

## ❓ FAQ

**Q：为什么克隆后没有歌词？**
A：合规原因仓库不含歌词全文。执行 `npm run fetch:cleaned && npm run import:all && npm run build:index` 即可在本地生成。

**Q：如何新增一首歌？**
A：编辑本地 `data/lyrics.json` 追加一条（格式见 `data/schema.example.json`），再 `npm run build:index`。

**Q：为什么有些歌没有词曲信息？**
A：约 25 首（现场/组曲/公益类）原数据头部署名行缺失，界面会显示「暂无词曲信息」或 `—`。

**Q：能商用吗？**
A：代码本身是 MIT；但**歌词数据商用需词曲版权方/音著协授权**，请自行评估。

**Q：1 秒的要求怎么保证的？**
A：所有查询走内存倒排索引，无网络请求；构建期完成重活，运行期只做哈希/交集。实测单字 <5ms，模糊 <100ms。

---

## 💖 致谢与许可

- 歌词数据整理：[bebetterest/JJQA](https://github.com/bebetterest/JJQA)（Apache-2.0）与 [godweiyang/lyric-crawler](https://github.com/godweiyang/lyric-crawler)（Apache-2.0，交叉校对）
- 依赖：Vue 3 · Vite · TypeScript · Fuse.js · pinyin-pro · Vitest
- 代码许可：MIT（见 [LICENSE](LICENSE)）
- 林俊杰先生与所有词曲作者的音乐是这份代码存在的意义 —— 请支持正版音乐。
