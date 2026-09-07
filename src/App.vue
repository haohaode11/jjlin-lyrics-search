<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SearchBox from './components/SearchBox.vue'
import SongDetail from './components/SongDetail.vue'
import { allSongs, getStats, loadIndex } from './search/engine'
import type { SongMeta, SuggestionPick } from './search/types'

const ready = ref(false)
const errorMsg = ref('')
const stats = ref<ReturnType<typeof getStats>>(null)
const songs = ref<SongMeta[]>([])
const view = ref<{ idx: number; song: SongMeta; focus: string | null } | null>(null)
const box = ref<InstanceType<typeof SearchBox> | null>(null)

const demoQueries = ['爱', '你', '笑', '风', '江南', '曹操', '修炼爱情', 'jiang']

onMounted(async () => {
  try {
    await loadIndex()
    songs.value = allSongs()
    stats.value = getStats()
    ready.value = true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errorMsg.value = msg.includes('HTTP 404')
      ? '未找到歌词索引文件。请先运行 npm run setup:data 生成歌词数据与索引，再刷新本页。'
      : `${msg}（数据缺失？请运行 npm run setup:data）`
  }
})

function onPick(p: SuggestionPick) {
  if (p.type === 'song') {
    openSong(p.songIdx)
    return
  }
  const hit = p.hit
  const idx = songs.value.findIndex((s) => s.id === hit.song.id)
  if (idx >= 0) {
    view.value = { idx, song: songs.value[idx], focus: hit.text }
    document.getElementById('detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function openSong(i: number) {
  view.value = { idx: i, song: songs.value[i], focus: null }
  document.getElementById('detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="app">
    <header class="hero">
      <p class="hero__eyebrow">JJ LIN · LYRICS</p>
      <h1 class="hero__title">JJ 歌词速查</h1>
      <p class="hero__sub">
        输入<b>一个字</b>，毫秒级联想出包含它的歌词；支持<b>拼音</b>（jiang）与<b>模糊容错</b>。
      </p>

      <div class="hero__search">
        <SearchBox ref="box" @pick="onPick" />
      </div>

      <div class="hero__demo">
        <span class="hero__demo-label">试试：</span>
        <button v-for="d in demoQueries" :key="d" class="chip" @click="box?.setQuery(d)">
          {{ d }}
        </button>
      </div>

      <p v-if="!ready && !errorMsg" class="hero__hint">正在加载歌词索引…</p>
      <p v-if="errorMsg" class="hero__error">{{ errorMsg }}（请先运行 npm run build:index）</p>
      <p v-if="ready && stats" class="hero__hint">
        已索引 {{ stats.songs }} 首歌 · {{ stats.lines }} 行歌词
      </p>
    </header>

    <main class="main">
      <!-- 歌单 -->
      <aside class="songlist">
        <h3 class="songlist__head">全部歌曲 <span>{{ songs.length }}</span></h3>
        <ul v-if="songs.length" class="songlist__ul">
          <li
            v-for="(s, i) in songs"
            :key="s.id"
            class="songlist__li"
            :class="{ 'songlist__li--on': view && view.song.id === s.id }"
            @click="openSong(i)"
          >
            <span class="songlist__name">{{ s.title }}</span>
            <span class="songlist__year">{{ s.year ?? '' }}</span>
          </li>
        </ul>
        <p v-else class="songlist__empty">暂无歌曲数据</p>
      </aside>

      <!-- 详情 -->
      <div id="detail" class="detail-slot">
        <section v-if="!view" class="placeholder">
          <p class="placeholder__big">♪</p>
          <p>在上方输入<b>一个字</b>试试 —— 比如「<button class="linklike" @click="box?.setQuery('爱')">爱</button>」</p>
          <p class="placeholder__small">命中后点击条目，可查看整首歌并定位该句歌词。</p>
        </section>
        <SongDetail
          v-else-if="view"
          :song="view.song"
          :song-idx="view.idx"
          :focus-text="view.focus"
        />
      </div>
    </main>

    <footer class="foot">
      <p>
        歌词版权归原权利人所有，本应用仅用于个人学习 / 演示，请勿公开传播全文 · 数据本地检索，无任何请求离开浏览器
      </p>
    </footer>
  </div>
</template>

<style scoped>
.app {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 20px 40px;
}

/* ===== Hero ===== */
.hero {
  text-align: center;
  padding: 56px 0 20px;
}

.hero__eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.4em;
  color: var(--accent);
}

.hero__title {
  margin: 0;
  font-size: clamp(34px, 6vw, 52px);
  letter-spacing: 0.04em;
  background: linear-gradient(120deg, #ffe3b3, var(--accent) 55%, #ff9d5c);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero__sub {
  margin: 12px auto 26px;
  color: var(--text-1);
  font-size: 14px;
  max-width: 560px;
}

.hero__sub b {
  color: var(--text-0);
}

.hero__search {
  max-width: 640px;
  margin: 0 auto;
}

.hero__demo {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

.hero__demo-label {
  color: var(--text-2);
  font-size: 13px;
}

.chip {
  border: 1px solid var(--border);
  background: var(--bg-1);
  color: var(--text-1);
  font-size: 13px;
  padding: 5px 12px;
  border-radius: 99px;
  cursor: pointer;
  transition: all 0.15s;
}

.chip:hover {
  color: var(--accent);
  border-color: rgba(255, 179, 71, 0.5);
  background: var(--accent-soft);
}

.hero__hint {
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-2);
}

.hero__error {
  margin-top: 14px;
  font-size: 13px;
  color: #ff7b72;
}

/* ===== Main ===== */
.main {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 20px;
  margin-top: 18px;
  align-items: start;
}

.songlist {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  position: sticky;
  top: 16px;
  max-height: 70vh;
  overflow-y: auto;
}

.songlist__head {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-1);
}

.songlist__head span {
  color: var(--text-2);
}

.songlist__ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.songlist__li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-1);
}

.songlist__li:hover {
  background: var(--bg-2);
  color: var(--text-0);
}

.songlist__li--on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.songlist__year {
  font-size: 11px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.songlist__empty {
  color: var(--text-2);
  font-size: 13px;
}

.detail-slot {
  min-height: 260px;
}

.placeholder {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-1);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.placeholder__big {
  margin: 0 0 6px;
  font-size: 52px;
  color: var(--accent);
  opacity: 0.8;
}

.placeholder__small {
  color: var(--text-2);
  font-size: 13px;
}

.linklike {
  border: none;
  background: none;
  color: var(--accent);
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

/* ===== Foot ===== */
.foot {
  margin-top: 40px;
  text-align: center;
  color: var(--text-2);
  font-size: 12px;
}

@media (max-width: 760px) {
  .main {
    grid-template-columns: 1fr;
  }

  .songlist {
    position: static;
    max-height: 240px;
  }
}
</style>
