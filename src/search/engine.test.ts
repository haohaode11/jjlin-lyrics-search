/**
 * 检索引擎单元测试：用一个小型固定语料验证核心检索语义。
 * 运行：npm test
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadIndex, search, searchSongs } from './engine'
import type { LyricsIndexFile } from './types'

/** 与 build-index.mjs 输出同构的最小语料（江南 + 一首含“爱”的歌） */
function fixture(): LyricsIndexFile {
  return {
    generatedAt: 'test',
    songCount: 2,
    lineCount: 5,
    songs: [
      { id: 'jiangnan', title: '江南', album: '第二天堂', year: 2004, py: 'jiangnan', lyricist: '李瑞洵', composer: '林俊杰' },
      { id: 'xiao', title: '小酒窝', album: 'JJ陆', year: 2008, py: 'xiaojiuwo', lyricist: '王雅君', composer: '林俊杰' },
      { id: 'xiulian', title: '修炼爱情', album: '因你而在', year: 2013, py: 'xiulianaiqing', lyricist: '易家扬', composer: '林俊杰' },
    ],
    lines: [
      { s: 0, t: '江南可采莲', p: 'jiang nan ke cai lian' },
      { s: 0, t: '莲叶何田田', p: 'lian ye he tian tian' },
      { s: 0, t: '鱼戏莲叶间', p: 'yu xi lian ye jian' },
      { s: 1, t: '你爱笑的眼睛', p: 'ni ai xiao de yan jing' },
      { s: 1, t: '风到这里就是粘', p: 'feng dao zhe li jiu shi zhan' },
    ],
    charIndex: {
      江: [0],
      南: [0],
      可: [0],
      采: [0],
      莲: [0, 1, 2],
      叶: [1, 2],
      何: [1],
      田: [1],
      鱼: [2],
      戏: [2],
      间: [2],
      你: [3],
      爱: [3],
      笑: [3],
      的: [3],
      眼: [3],
      睛: [3],
      风: [4],
      到: [4],
      这: [4],
      里: [4],
      就: [4],
      是: [4],
      粘: [4],
    },
    pinyinMap: {
      jiang: ['江'],
      nan: ['南'],
      lian: ['莲'],
      ye: ['叶'],
      ni: ['你'],
      ai: ['爱'],
      feng: ['风'],
      zhan: ['粘'],
    },
  }
}

beforeAll(() => {
  const data = fixture()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => data }) as unknown as Response),
  )
  return loadIndex('irrelevant-url')
})

describe('单字联想', () => {
  it('输入“南”应命中含“南”的行', () => {
    const r = search('南')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].text).toContain('南')
  })

  it('输入“粘”命中唯一行', () => {
    const r = search('粘')
    expect(r.some((h) => h.text === '风到这里就是粘')).toBe(true)
  })
})

describe('多字强命中', () => {
  it('“江南”应把含两字的行排在首位', () => {
    const r = search('江南')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].text).toBe('江南可采莲')
  })

  it('所有命中行都至少包含一个查询字', () => {
    const r = search('江南')
    for (const h of r) {
      expect(h.text.includes('江') || h.text.includes('南')).toBe(true)
    }
  })
})

describe('拼音检索', () => {
  it('单音节前缀 jiang 命中“江”', () => {
    const r = search('jiang')
    expect(r.some((h) => h.text === '江南可采莲')).toBe(true)
  })

  it('带空格多音节 jiang nan 命中同一行', () => {
    const r = search('jiang nan')
    expect(r[0]?.text).toBe('江南可采莲')
  })

  it('无空格整串 jiangnan 能切分命中', () => {
    const r = search('jiangnan')
    expect(r[0]?.text).toBe('江南可采莲')
  })

  it('未输完的前缀 jia 也能联想出“江”（jiang 的前缀）', () => {
    const r = search('jia')
    expect(r.some((h) => h.text === '江南可采莲')).toBe(true)
  })
})

describe('歌名检索（含词曲人）', () => {
  it('全字歌名“江南”命中并带出词曲人', () => {
    const r = searchSongs('江南')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].song.title).toBe('江南')
    expect(r[0].song.composer).toBe('林俊杰')
    expect(r[0].song.lyricist).toBe('李瑞洵')
  })

  it('拼音歌名 jiangnan 命中“江南”', () => {
    const r = searchSongs('jiangnan')
    expect(r[0]?.song.title).toBe('江南')
  })

  it('错字容错：小酒涡 -> 小酒窝', () => {
    const r = searchSongs('小酒涡')
    expect(r.some((h) => h.song.title === '小酒窝')).toBe(true)
  })

  it('部分歌名“修炼”命中“修炼爱情”', () => {
    const r = searchSongs('修炼')
    expect(r.some((h) => h.song.title === '修炼爱情')).toBe(true)
  })

  it('少于 2 字（单字）不进入歌名联想，避免刷屏', () => {
    expect(searchSongs('江')).toEqual([])
    expect(searchSongs('j')).toEqual([])
  })
})

describe('边界', () => {
  it('空查询返回空', () => {
    expect(search('')).toEqual([])
    expect(search('   ')).toEqual([])
  })

  it('不存在的内容不抛错并返回有限结果', () => {
    expect(() => search('根本没有的字龘')).not.toThrow()
    const r = search('根本没有的字龘')
    expect(Array.isArray(r)).toBe(true)
  })
})
