/** 歌词数据与检索索引的共享类型定义 */

/** 一首歌的元信息（与 data/lyrics.json 中的结构一致） */
export interface SongMeta {
  id: string
  title: string
  artist?: string
  album?: string
  year?: number
  /** 作词人（由词曲署名行解析） */
  lyricist?: string
  /** 作曲人 */
  composer?: string
  /** 编曲人 */
  arranger?: string
  /** 合唱/合作者（歌手表中除林俊杰之外的人） */
  singerNote?: string
  /** @internal 标题拼音（无空格无声调，索引生成），如 江南 -> jiangnan */
  py?: string
}

/** 索引里的一行歌词：s = songs 数组下标, t = 歌词文本, p = 该行拼音(空格分隔、无声调) */
export interface RawLine {
  s: number
  t: string
  p: string
}

/** 构建脚本输出的索引文件结构（public/lyrics-index.json） */
export interface LyricsIndexFile {
  generatedAt: string
  songCount: number
  lineCount: number
  songs: SongMeta[]
  lines: RawLine[]
  /** 汉字 -> 包含该字的行下标（升序），单字联想的核心 */
  charIndex: Record<string, number[]>
  /** 拼音音节(小写无声调) -> 发音为该音节的汉字列表，如 { "jiang": ["江","将","僵"] } */
  pinyinMap: Record<string, string[]>
}

/** 一次检索返回的一条结果 */
export interface SearchHit {
  /** lines 数组中的下标 */
  lineIdx: number
  /** 歌词行文本 */
  text: string
  /** 命中的查询汉字（去重、保序），用于“命中字高亮” */
  matchedChars: string[]
  /** 所属歌曲 */
  song: SongMeta
  /** 排序分数（越大越靠前） */
  score: number
  /** 是否经由模糊(编辑距离)路径命中 */
  fuzzy: boolean
  /** 需要高亮的字符位置集合 */
  hlPositions: number[]
}

/** 歌名检索的一条结果（联想框里的“歌曲”行） */
export interface SongHit {
  /** songs 数组下标 */
  songIdx: number
  song: SongMeta
  /** 排序分数（越大越靠前） */
  score: number
}

/** 联想框点选后抛出的载荷：歌词行 或 歌曲 */
export type SuggestionPick = { type: 'line'; hit: SearchHit } | { type: 'song'; songIdx: number }
