/** 展示用格式化工具 */
import type { SongMeta } from './types'

/** 专辑展示名：无专辑(翻唱/现场/单曲等)时兜底为「单曲」 */
export const albumLabel = (s: SongMeta): string => s.album || '单曲'
