/** 将文本拆成可高亮的片段 */
export interface CharSeg {
  ch: string
  hl: boolean
}

export function segmentHighlight(text: string, positions: number[] | Set<number>): CharSeg[] {
  const set = positions instanceof Set ? positions : new Set(positions)
  const out: CharSeg[] = []
  for (let i = 0; i < text.length; i++) out.push({ ch: text[i], hl: set.has(i) })
  return out
}
