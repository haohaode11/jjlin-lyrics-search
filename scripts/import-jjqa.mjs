/**
 * 从 JJQA 数据集筛选林俊杰代表歌曲 -> data/lyrics.json
 *
 * 数据源：bebetterest/JJQA (Apache-2.0) dataset/hf_song.json，181 首完整歌词，
 *         下载脚本：scripts/download-jjqa.mjs
 * 用法  ：npm run fetch:jjqa
 * 输出  ：data/lyrics.json（仅个人学习/演示，请勿公开传播歌词全文）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcPath = join(root, 'data', 'raw', 'hf_song.json')
const outPath = join(root, 'data', 'lyrics.json')

/* 精选清单：标题 + 专辑 + 年份（专辑/年份用于展示；匹配按标题） */
const WANT = [
  // 第二天堂 2004
  ['江南', '第二天堂', 2004], ['美人鱼', '第二天堂', 2004], ['豆浆油条', '第二天堂', 2004],
  ['害怕', '第二天堂', 2004],
  // 编号89757 2005
  ['一千年以后', '编号89757', 2005], ['简简单单', '编号89757', 2005], ['木乃伊', '编号89757', 2005],
  ['编号89757', '编号89757', 2005], ['突然累了', '编号89757', 2005],
  // 曹操 2006
  ['曹操', '曹操', 2006], ['只对你说', '曹操', 2006], ['不死之身', '曹操', 2006],
  ['原来', '曹操', 2006], ['你要的不是我', '曹操', 2006],
  // 西界 2007
  ['西界', '西界', 2007], ['杀手', '西界', 2007], ['不流泪的机场', '西界', 2007],
  ['大男人·小女孩', '西界', 2007],
  // JJ陆 2008
  ['小酒窝', 'JJ陆', 2008], ['醉赤壁', 'JJ陆', 2008], ['我还想她', 'JJ陆', 2008],
  ['Always Online', 'JJ陆', 2008], ['不潮不用花钱', 'JJ陆', 2008], ['黑武士', 'JJ陆', 2008],
  // 100天 2009
  ['背对背拥抱', '100天', 2009], ['第几个100天', '100天', 2009], ['爱不会绝迹', '100天', 2009],
  ['加油', '100天', 2009],
  // 她说 2010（概念自选辑）
  ['她说', '她说', 2010], ['记得', '她说', 2010], ['当你', '她说', 2010],
  ['爱笑的眼睛', '她说', 2010], ['心墙', '她说', 2010], ['一眼万年', '她说', 2010],
  ['只对你有感觉', '她说', 2010], ['我很想爱他', '她说', 2010],
  // 学不会 2011
  ['学不会', '学不会', 2011], ['那些你很冒险的梦', '学不会', 2011], ['Love U U', '学不会', 2011],
  // 因你而在 2013
  ['修炼爱情', '因你而在', 2013], ['裂缝中的阳光', '因你而在', 2013], ['因你而在', '因你而在', 2013],
  // 新地球 2014
  ['可惜没如果', '新地球', 2014], ['手心的蔷薇', '新地球', 2014], ['新地球', '新地球', 2014],
  ['生生', '新地球', 2014],
  // 和自己对话 2015
  ['不为谁而作的歌', '和自己对话', 2015], ['关键词', '和自己对话', 2015], ['弹唱', '和自己对话', 2015],
  // 伟大的渺小 2017
  ['伟大的渺小', '伟大的渺小', 2017], ['黑夜问白天', '伟大的渺小', 2017], ['圣所', '伟大的渺小', 2017],
  ['我继续', '伟大的渺小', 2017],
  // 幸存者·如你 2020
  ['幸存者', '幸存者·如你', 2020], ['交换余生', '幸存者·如你', 2020], ['暂时的记号', '幸存者·如你', 2020],
  ['最好是', '幸存者·如你', 2020],
  // 重拾_快乐 2023
  ['愿与愁', '重拾_快乐', 2023], ['谢幕', '重拾_快乐', 2023], ['自画像', '重拾_快乐', 2023],
  ['逆光白', '重拾_快乐', 2023], ['孤独娱乐', '重拾_快乐', 2023],
  // 重要单曲 / 合唱 / OST
  ['被风吹过的夏天', '单曲', 2005], ['黑暗骑士', '单曲', 2013], ['进阶', '单曲', 2018],
  ['我们很好', '单曲', 2019], ['将故事写成我们', '单曲', 2019], ['对的时间点', '单曲', 2019],
  ['Wonderland', '单曲', 2020], ['Stay With You', '单曲', 2020], ['裹着心的光', '单曲', 2021],
  ['最向往的地方', '单曲', 2020],
]

/** 署名/信息行前缀（词/曲/编曲/制作/录音/混音/母带/OP/SP/后期 等），整行丢弃 */
const creditRe =
  /^(词|曲|编曲|制作人|制作|配唱|录音|混音|母带|后期|和声|键盘|吉他|贝斯|鼓手|鼓|弦乐|小提琴|大提琴|钢琴|监制|出品|发行|OP|SP|MV|导演|执行|统筹|企划|文案|平面|封面|美术|设计|翻译|经纪|摄影|造型|服装|化妆|发型|项目|助理|额外|版本|备注)[^：:\n]{0,40}?[：:]/u
/** 顶部“歌名 - 林俊杰 (JJ Lin)”行 */
const headerRe = /^.+[－-]\s*林俊杰(?:\s*\(?JJ Lin\)?)?\s*$/u

function cleanLyric(rawLyric) {
  const out = []
  for (const line of String(rawLyric).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    if (headerRe.test(t)) continue
    if (creditRe.test(t)) continue
    out.push(t)
  }
  return out.join('\n')
}

if (!existsSync(srcPath)) {
  console.error(`缺少 ${srcPath}\n请先运行: node scripts/download-jjqa.mjs`)
  process.exit(1)
}

const all = JSON.parse(readFileSync(srcPath, 'utf8')).data ?? []
const byTitle = new Map()
for (const s of all) {
  const key = s.title || s.name
  if (!byTitle.has(key)) byTitle.set(key, s)
}

const songs = []
const missing = []
for (const [title, album, year] of WANT) {
  const s = byTitle.get(title)
  if (!s) {
    missing.push(title)
    continue
  }
  const lyric = cleanLyric(s.lyric)
  if (!lyric) {
    missing.push(title + '(空)')
    continue
  }
  songs.push({
    id: String(s.id || title),
    title,
    artist: '林俊杰',
    album,
    year,
    lyric,
  })
}

writeFileSync(outPath, JSON.stringify({ songs }, null, 2), 'utf8')
console.log(`已导入 ${songs.length}/${WANT.length} 首 -> data/lyrics.json`)
if (missing.length) console.log('缺失(数据源内未找到):', missing.join('、'))
