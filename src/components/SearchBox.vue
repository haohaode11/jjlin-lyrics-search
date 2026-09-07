<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { search, searchSongs } from '../search/engine'
import type { SearchHit, SongHit, SuggestionPick } from '../search/types'
import { segmentHighlight, type CharSeg } from '../search/highlight'
import { albumLabel } from '../search/format'

const emit = defineEmits<{ pick: [payload: SuggestionPick] }>()

type Row =
  | { kind: 'line'; key: string; hit: SearchHit; segs: CharSeg[] }
  | { kind: 'song'; key: string; hit: SongHit }

const q = ref('')
const open = ref(false)
const active = ref(-1)
const rows = ref<Row[]>([])
const timing = ref('')

let timer: number | undefined

function run() {
  const t0 = performance.now()
  const songHits = searchSongs(q.value, 3)
  const lineHits = search(q.value)
  const ms = performance.now() - t0
  const merged: Row[] = [
    ...songHits.map((hit) => ({ kind: 'song' as const, key: `s-${hit.songIdx}`, hit })),
    ...lineHits.map((hit) => ({
      kind: 'line' as const,
      key: `l-${hit.lineIdx}`,
      hit,
      segs: segmentHighlight(hit.text, hit.hlPositions),
    })),
  ]
  rows.value = merged
  timing.value = `${ms.toFixed(1)}ms · ${songHits.length} 首歌曲 / ${lineHits.length} 句歌词`
  active.value = rows.value.length ? 0 : -1
}

function schedule() {
  window.clearTimeout(timer)
  timer = window.setTimeout(run, 60)
  open.value = q.value.trim().length > 0
}

function choose(i: number) {
  const row = rows.value[i]
  if (!row) return
  open.value = false
  if (row.kind === 'song') emit('pick', { type: 'song', songIdx: row.hit.songIdx })
  else emit('pick', { type: 'line', hit: row.hit })
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    if (rows.value.length) {
      e.preventDefault()
      active.value = (active.value + 1) % rows.value.length
    }
  } else if (e.key === 'ArrowUp') {
    if (rows.value.length) {
      e.preventDefault()
      active.value = (active.value - 1 + rows.value.length) % rows.value.length
    }
  } else if (e.key === 'Enter') {
    choose(active.value)
  } else if (e.key === 'Escape') {
    open.value = false
    q.value = ''
    rows.value = []
  }
}

/** 供外部（示例标签）直接填入查询词 */
function setQuery(text: string) {
  q.value = text
  run()
  open.value = true
}

defineExpose({ setQuery })

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="sb">
    <div class="sb__bar" :class="{ 'sb__bar--open': open }">
      <svg class="sb__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <input
        v-model="q"
        class="sb__input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="搜一句歌词 / 搜歌名看词曲人，例如：爱 / 江南 / 修炼爱情 / jiangnan"
        @input="schedule"
        @focus="open = q.trim().length > 0"
        @blur="open = false"
        @keydown="onKey"
      />
      <span v-if="timing && q.trim()" class="sb__timing">{{ timing }}</span>
    </div>

    <transition name="drop">
      <ul v-if="open && q.trim()" class="sb__list">
        <li v-if="!rows.length" class="sb__empty">
          没有找到匹配 —— 试试别的字 / 拼音 / 歌名，或换更完整的句子
        </li>

        <!-- 歌曲行：歌名 + 作词作曲 -->
        <li
          v-for="(row, i) in rows"
          :key="row.key"
          class="sb__item"
          :class="{ 'sb__item--on': active === i }"
          @mousedown.prevent="choose(i)"
          @mousemove="active = i"
        >
          <template v-if="row.kind === 'song'">
            <span class="sb__song">
              <span class="sb__song-head">
                <span class="sb__icon-note">♪</span>
                <span class="sb__song-title">{{ row.hit.song.title }}</span>
                <em class="sb__tag-song">歌曲</em>
              </span>
              <span class="sb__song-credits">
                <template v-if="row.hit.song.lyricist || row.hit.song.composer">
                  词：{{ row.hit.song.lyricist || '—' }}
                  <i class="sb__dot">·</i>
                  曲：{{ row.hit.song.composer || '—' }}
                  <template v-if="row.hit.song.arranger">
                    <i class="sb__dot">·</i>编曲：{{ row.hit.song.arranger }}
                  </template>
                </template>
                <span v-else class="sb__muted">暂无词曲信息</span>
              </span>
            </span>
            <span class="sb__meta">
              <template v-if="row.hit.song.singerNote">feat. {{ row.hit.song.singerNote }} · </template
              >《{{ albumLabel(row.hit.song) }}》<template v-if="row.hit.song.year"> · {{ row.hit.song.year }}</template>
            </span>
          </template>

          <!-- 歌词行 -->
          <template v-else>
            <span class="sb__txt">
              <template v-for="(s, si) in row.segs" :key="si">
                <mark v-if="s.hl" class="sb__mark">{{ s.ch }}</mark
                ><template v-else>{{ s.ch }}</template>
              </template>
            </span>
            <span class="sb__meta sb__meta--stack">
              <span class="sb__meta-l1">
                {{ row.hit.song.title }}<em v-if="row.hit.fuzzy" class="sb__fuzzy">模糊</em>
              </span>
              <span class="sb__meta-l2">
                《{{ albumLabel(row.hit.song) }}》<template v-if="row.hit.song.year"
                  > · {{ row.hit.song.year }}</template
                >
              </span>
            </span>
          </template>
        </li>
      </ul>
    </transition>
  </div>
</template>

<style scoped>
.sb {
  position: relative;
  width: 100%;
}

.sb__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.sb__bar--open {
  border-color: rgba(255, 179, 71, 0.55);
  box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow);
}

.sb__icon {
  width: 20px;
  height: 20px;
  flex: none;
  color: var(--text-2);
}

.sb__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-0);
  font-size: 18px;
  letter-spacing: 0.02em;
}

.sb__input::placeholder {
  color: var(--text-2);
}

.sb__timing {
  flex: none;
  font-size: 12px;
  color: var(--ok);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sb__list {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  max-height: 420px;
  overflow-y: auto;
}

.sb__empty {
  padding: 22px 16px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}

.sb__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.sb__item--on {
  background: var(--accent-soft);
}

/* 歌曲行 */
.sb__song {
  flex: 1;
  min-width: 0;
}

.sb__song-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sb__icon-note {
  color: var(--accent);
  font-style: normal;
}

.sb__song-title {
  font-size: 15px;
  font-weight: 600;
}

.sb__tag-song {
  font-style: normal;
  font-size: 10px;
  color: var(--accent);
  border: 1px solid rgba(255, 179, 71, 0.4);
  border-radius: 99px;
  padding: 1px 7px;
}

.sb__song-credits {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-1);
}

.sb__dot {
  font-style: normal;
  margin: 0 4px;
  color: var(--text-2);
}

.sb__muted {
  color: var(--text-2);
}

/* 歌词行 */
.sb__txt {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.sb__mark {
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-underline-offset: 3px;
  padding: 0;
}

.sb__meta {
  flex: none;
  max-width: 44%;
  font-size: 12px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}

.sb__meta--stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.sb__meta-l1 {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb__meta-l2 {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-2);
  font-size: 11px;
}

.sb__fuzzy {
  margin-left: 6px;
  font-style: normal;
  font-size: 11px;
  color: var(--accent);
  border: 1px solid rgba(255, 179, 71, 0.4);
  border-radius: 99px;
  padding: 1px 7px;
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
