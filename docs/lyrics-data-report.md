# 林俊杰歌词数据来源调研报告

> 调研时间：2026-09 · 适用：个人学习/演示的静态前端，一次性导入、不商用
> 凡实际抓取核验过的标注 **[已验证]**；未能直接确认的标注 **[未验证]**

## 一、结论速览

**主推荐路径（本 Demo 已采用）**：从 GitHub 仓库 [bebetterest/JJQA](https://github.com/bebetterest/JJQA)（Apache-2.0）下载 `dataset/hf_song.json`（[已验证] 181 首林俊杰完整歌词，结构 `{"data":[{id,title,name,lyric}]}`），再按代表歌曲清单筛选 60 首左右清洗入库。

备选/交叉校对：
- [godweiyang/lyric-crawler](https://github.com/godweiyang/lyric-crawler)（Apache-2.0）output 目录有 `林俊杰_歌词.txt`（264KB，2003-2021，需清"词/曲/编曲"头行，偶有错位段）与按专辑分组的歌名清单。
- [dengxiuqi/ChineseLyrics](https://github.com/dengxiuqi/ChineseLyrics)：10 万首中文歌词，**无 LICENSE**，仅备选。

**补新歌**：[LRCLIB API](https://lrclib.net/docs)（[已验证] 免 key、可返回 JJ 完整 LRC，注意简繁混杂）> 自建 [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)（已 archived、无 LICENSE、需 cookie、网易维权激进，github/dmca 有 3,319 仓库下架记录）。

**已废弃**：geci.me（已死）、goolrc（转 VIP）、Musixmatch 免费档（只给部分歌词）、Genius（中文不全 + 禁爬）。

## 二、版权要点（务必阅读）

1. 歌词受《著作权法》保护，GitHub 仓库的 Apache-2.0 **只覆盖代码/数据整理，不授予歌词版权**。
2. 个人**本地/私有**运行、不对外公开部署 → 风险最低（本项目定位即此）。
3. **不要公开发布歌词 JSON**：公开仓库只放代码与歌名元数据，歌词由本地脚本注入（本项目已将 `public/lyrics-index.json` 与 `data/raw` 加入 .gitignore）。
4. 公开 Demo 建议"先摘要后全文"：结果只回显命中句/前几行，全文跳官方平台；页面显著标注版权提示。
5. 商用需走正式授权：音著协或词曲版权代理（海蝶/华纳等），超出本项目范围。

## 三、本项目落地情况

| 步骤 | 脚本 | 结果 |
|---|---|---|
| 下载数据 | `scripts/download-jjqa.mjs` | JJQA hf_song.json（181 首）→ `data/raw/hf_song.json`（已 gitignore） |
| 筛选清洗 | `scripts/import-jjqa.mjs` | 72 首清单命中 66 首（6 首标题变体缺失）→ `data/lyrics.json` |
| 建索引 | `scripts/build-index.mjs` | 66 首 · 2976 行 · 1602 汉字 · 366 音节 → `public/lyrics-index.json`（已 gitignore） |
| 数据元信息 | — | 专辑/年份来自公开信息，标注于 `data/lyrics.json` |

重新拉取：`npm run fetch:jjqa`（会覆盖 `data/lyrics.json`）。

## 四、来源 URL

- [bebetterest/JJQA](https://github.com/bebetterest/JJQA) [已验证] · [hf_song.json](https://raw.githubusercontent.com/bebetterest/JJQA/main/dataset/hf_song.json) [已验证] · [HuggingFace 镜像](https://huggingface.co/datasets/hobeter/JJQA)
- [godweiyang/lyric-crawler](https://github.com/godweiyang/lyric-crawler) [已验证] · [林俊杰_歌词.txt](https://raw.githubusercontent.com/godweiyang/lyric-crawler/master/output/%E6%9E%97%E4%BF%8A%E6%9D%B0_%E6%AD%8C%E8%AF%8D.txt) [已验证]
- [LRCLIB API](https://lrclib.net/api/search?q=%E6%B1%9F%E5%8D%97%20JJ%20Lin) [已验证]
- [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) [已验证元数据] · [github/dmca 网易通知](https://raw.githubusercontent.com/github/dmca/master/2021/10/2021-10-05-netease.md) [已验证]
- 合规参考：[中国音乐著作权协会](https://www.mcsc.com.cn/member/rules.html)
