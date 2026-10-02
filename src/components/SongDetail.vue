<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { linesOfSong } from '../search/engine'
import { albumLabel } from '../search/format'
import type { SongMeta } from '../search/types'

const props = defineProps<{
  song: SongMeta
  /** 歌曲在索引 songs 数组中的下标 */
  songIdx: number
  /** 需要聚焦高亮的歌词行（整行高亮） */
  focusText?: string | null
}>()

const lineIdx = computed(() => linesOfSong(props.songIdx))
const lyricContainer = ref<HTMLElement | null>(null)
watch(() => [props.songIdx, props.focusText], async () => {
  await nextTick()
  lyricContainer.value?.querySelector('.detail__line--focus')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}, { immediate: true })
</script>

<template>
  <section class="detail">
    <header class="detail__head">
      <div>
        <h2 class="detail__title">{{ song.title }}</h2>
        <p class="detail__meta">
          {{ song.artist }}<template v-if="song.singerNote"> · feat. {{ song.singerNote }}</template
          > · 《{{ albumLabel(song) }}》<template v-if="song.year"> · {{ song.year }}</template>
        </p>
        <p v-if="song.lyricist || song.composer || song.arranger" class="detail__credits">
          <template v-if="song.lyricist"><b>词</b> {{ song.lyricist }}</template>
          <template v-if="song.composer"><i v-if="song.lyricist">·</i><b>曲</b> {{ song.composer }}</template>
          <template v-if="song.arranger"><i v-if="song.lyricist || song.composer">·</i><b>编曲</b> {{ song.arranger }}</template>
        </p>
        <p v-if="song.sources?.length" class="detail__sources">
          平台曲目：
          <a v-for="source in song.sources" :key="`${source.provider}:${source.id}`" :href="source.url" target="_blank" rel="noopener noreferrer">
            {{ source.provider === 'qq' ? 'QQ 音乐' : '网易云音乐' }}
          </a>
        </p>
      </div>
      <span class="detail__badge">歌词查看</span>
    </header>
    <div ref="lyricContainer" class="detail__lines">
      <p
        v-for="(ln, i) in lineIdx"
        :key="i"
        class="detail__line"
        :class="{ 'detail__line--focus': focusText && ln === focusText }"
      >
        {{ ln }}
      </p>
      <p v-if="!lineIdx.length" class="detail__none">（暂无歌词数据）</p>
    </div>
  </section>
</template>

<style scoped>
.detail {
  margin-top: 28px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.detail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
}

.detail__title {
  margin: 0;
  font-size: 24px;
}

.detail__meta {
  margin: 6px 0 0;
  color: var(--text-1);
  font-size: 13px;
}

.detail__credits {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-1);
}

.detail__credits b {
  color: var(--accent);
  font-weight: 600;
  margin-right: 4px;
}

.detail__credits i {
  font-style: normal;
  margin: 0 8px;
  color: var(--text-2);
}

.detail__sources { margin: 9px 0 0; color: var(--text-2); font-size: 11px; }
.detail__sources a { color: var(--accent); margin-right: 12px; text-underline-offset: 3px; }

.detail__badge {
  flex: none;
  font-size: 12px;
  color: var(--accent);
  border: 1px solid rgba(255, 179, 71, 0.45);
  border-radius: 99px;
  padding: 4px 12px;
}

.detail__lines {
  padding: 20px 24px 28px;
  max-height: 420px;
  overflow-y: auto;
  line-height: 1.1;
}

.detail__line {
  margin: 0 0 16px;
  font-size: 15px;
  color: var(--text-1);
  break-inside: avoid;
  border-radius: 6px;
  transition: color 0.2s;
}

.detail__line--focus {
  color: var(--text-0);
  font-weight: 600;
  background: var(--accent-soft);
  outline: 1px solid rgba(255, 179, 71, 0.4);
}

.detail__none {
  color: var(--text-2);
}

</style>
