# 林俊杰歌词数据来源调研报告

> 历史调研时间：2026-09；当前数据流程更新于 2026-10-02。旧版 66 首导入记录保留为历史背景。
> 凡实际抓取核验过的标注 **[已验证]**；未能直接确认的标注 **[未验证]**

## 当前使用的数据流程（2026-10-02）

本项目目前以 JJQA `cleaned_song_info.json` 初始化历史曲库（当前核验快照 391 条原始记录，清洗后 355 首），使用本地页面 **更新数据** 或 `npm run update:data` 增量接入 QQ 音乐与网易云音乐。下面的 181 首源 / 66 首精选方案是旧版本，不是当前默认初始化。

本次实际匿名读取验证了 QQ 歌手 `001BLpXF2DyJe2` 和网易云歌手 `3684` 均对应林俊杰。QQ 通过 `musicu.fcg` 的 `GetSingerSongList`（最新顺序）读取目录，通过 `GetPlayLyricInfo` 读取公开可解码歌词；网易云通过歌手专辑列表、`/api/v1/album/{id}` 与 `/api/song/lyric` 读取近期目录和歌词。后续数据数量随实际更新变化，以本地更新报告为准。

2026-10-02 的检查修正了历史导入把英文歌名清空后合并的问题，历史曲库由 293 首恢复到 355 首，原有歌曲标识全部保留。同时改用 QQ 完整标题，分别保存同平台不同 ID 的录音，并保留已知的原始专辑和年份。共享解析器保留与歌名相同的歌词正文，过滤制作署名；已有缓存按新规则重新解析，以修正之前导入的数据。

协议结构参考 [QQ 歌手曲目](https://github.com/ylw1997/qqmusic-api/blob/master/docs/apis/get-singer-songs.md)、[QQ 歌词](https://github.com/ylw1997/qqmusic-api/blob/master/docs/apis/get-lyric.md)、[网易云专辑](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/blob/main/module/album.js)、[网易云歌手专辑](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/blob/main/module/artist_album.js) 和 [网易云歌词](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/blob/main/module/lyric.js) 的公开实现，项目直接访问音乐平台域名。一次实测成功不保证接口后续可用性。

默认每次每平台最多获取 20 首歌词，缓存 7 天；平台受限、无歌词或索引失败会保留可用的现有数据，并记录未完成项。数据与索引更新前保存最近三份快照，不自动删除旧歌曲。平台来源 ID、曲目链接与歌词来源写入歌曲元信息；全文、缓存与报告不提交到 Git。具体配置、命令与静态部署边界见 [README](../README.md)。

## 一、历史结论速览

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

## 三、旧版落地情况（66 首精选方案）

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
