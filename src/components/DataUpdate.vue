<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface SourceReport {
  name: string
  label: string
  status: string
  catalog: number
  fetched: number
  missing: number
  missingTitles?: string[]
  pending: number
  errors: string[]
}
interface UpdateReport {
  status: string
  startedAt?: string
  finishedAt?: string
  lastSuccessAt?: string | null
  after?: number
  added?: number
  updated?: number
  sources?: SourceReport[]
  error?: string
}
interface Job {
  id: string
  status: string
  progress: { stage: string; source?: string; current?: number; total?: number } | null
  report: UpdateReport | null
}
interface StatusResponse { available: boolean; running: boolean; job: Job | null; report: UpdateReport | null }

const emit = defineEmits<{ updated: [] }>()
const localMode = import.meta.env.DEV
const available = ref(false)
const busy = ref(false)
const starting = ref(false)
const job = ref<Job | null>(null)
const report = ref<UpdateReport | null>(null)
const message = ref('')
const observedJob = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const progressText = computed(() => {
  const progress = job.value?.progress
  if (!progress) return '正在准备更新…'
  if (progress.stage === 'catalog') return `正在检查${progress.source}的最新曲目…`
  if (progress.stage === 'lyrics') return `${progress.source}：正在获取歌词（${progress.current}/${progress.total}）`
  return '正在整理歌词与检索索引…'
})
const summary = computed(() => {
  if (!report.value) return '现有数据可直接搜索，更新后会自动载入新歌。'
  if (report.value.status === 'failed') return report.value.error || '此次更新未完成，现有歌曲仍可搜索。'
  const added = report.value.added ?? 0, updated = report.value.updated ?? 0
  const count = report.value.after ? ` · 共 ${report.value.after} 首` : ''
  if (!added && !updated) return `检查完成：本次暂无变更${count}`
  return `${report.value.status === 'partial' ? '部分更新完成' : '更新完成'}：新增 ${added} 首，补充 ${updated} 首${count}`
})
const checkedAt = computed(() => {
  const value = report.value?.finishedAt
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : ''
})
const pending = computed(() => report.value?.sources?.reduce((sum, source) => sum + source.pending, 0) ?? 0)
const sourceLabel = (status: string) => ({ success: '已检查', partial: '部分完成', failed: '暂不可用' }[status] ?? '检查中')

async function readStatus() {
  if (timer) clearTimeout(timer)
  try {
    const response = await fetch('/api/data/status', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('暂时无法连接本地更新服务')
    const data: StatusResponse = await response.json()
    if (disposed) return
    const previousFinishedAt = report.value?.finishedAt
    available.value = data.available
    job.value = data.job
    busy.value = data.running
    report.value = data.report ?? data.job?.report ?? null
    message.value = ''
    if (data.job?.status === 'running') observedJob.value = data.job.id
    if (!data.running && observedJob.value) {
      const completed = data.job?.id === observedJob.value
        ? ['success', 'partial'].includes(data.job.status)
        : report.value?.finishedAt !== previousFinishedAt && ['success', 'partial'].includes(report.value?.status ?? '')
      observedJob.value = ''
      if (completed) emit('updated')
    }
  } catch (error) {
    if (disposed) return
    message.value = error instanceof Error ? error.message : '无法读取更新进度'
    // Keep polling an acknowledged job; never repeat an uncertain POST automatically.
  }
  if (!disposed && busy.value) timer = setTimeout(readStatus, 1200)
}

async function update() {
  if (busy.value || starting.value) return
  starting.value = true
  message.value = ''
  try {
    const response = await fetch('/api/data/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-JJLIN-Update': '1' },
      body: '{}', signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    if (!response.ok && response.status !== 409) throw new Error(data.error ?? '无法开始更新')
    if (disposed) return
    job.value = data.job
    observedJob.value = data.job.id
    busy.value = true
    await readStatus()
  } catch (error) {
    const reason = error instanceof Error ? error.message : '无法开始更新'
    // Reconcile the server state after a lost acknowledgement instead of resubmitting.
    await readStatus()
    if (!busy.value) message.value = reason
  } finally { starting.value = false }
}

onMounted(async () => {
  if (localMode) await readStatus()
  else {
    try {
      const response = await fetch('./data-status.json', { cache: 'no-store' })
      if (response.ok && !disposed) report.value = await response.json()
    } catch { /* The search page also works with a standalone index. */ }
  }
})
onUnmounted(() => { disposed = true; if (timer) clearTimeout(timer) })
</script>

<template>
  <section class="data-update" aria-label="音乐数据更新">
    <div class="data-update__top">
      <div>
        <p class="data-update__title">曲库更新 <span>QQ 音乐 · 网易云音乐</span></p>
        <p class="data-update__summary" role="status" aria-live="polite">{{ busy ? progressText : summary }}</p>
      </div>
      <button v-if="localMode" class="data-update__button" :disabled="!available || busy || starting" @click="update">
        {{ busy || starting ? '更新中…' : '更新数据' }}
      </button>
    </div>
    <div v-if="report?.sources?.length && !busy" class="data-update__sources">
      <span v-for="source in report.sources" :key="source.name" :class="{ 'data-update__warning': source.status !== 'success' }">
        {{ source.label }}：{{ sourceLabel(source.status) }}<template v-if="source.catalog"> · {{ source.catalog }} 首曲目</template>
      </span>
    </div>
    <p v-if="checkedAt && !busy" class="data-update__note">最近检查：{{ checkedAt }}</p>
    <p v-if="pending && !busy" class="data-update__note">还有 {{ pending }} 首曲目待补歌词，可再次更新继续获取。</p>
    <p v-if="!localMode" class="data-update__note">在本地开发服务中打开，即可从页面更新曲库。</p>
    <p v-if="message" class="data-update__warning" role="alert">
      {{ message }} <button v-if="localMode" class="data-update__retry" @click="readStatus">重新连接</button>
    </p>
    <details v-if="report?.sources?.some(source => source.errors.length || source.missing) && !busy" class="data-update__issues">
      <summary>查看未完成项</summary>
      <div v-for="source in report.sources" :key="source.name">
        <p v-if="source.missing">{{ source.label }}：{{ source.missing }} 首暂未取得可用歌词<template v-if="source.missingTitles?.length">（{{ source.missingTitles.join('、') }}）</template>。</p>
        <p v-for="issue in source.errors" :key="issue">{{ source.label }}：{{ issue }}</p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.data-update { max-width: 720px; margin: 22px auto 0; padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-1); text-align: left; }
.data-update__top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.data-update__title { margin: 0 0 6px; color: var(--text-0); font-size: 14px; font-weight: 600; }
.data-update__title span { color: var(--text-2); font-size: 11px; margin-left: 8px; font-weight: 400; }
.data-update__summary { margin: 0; color: var(--text-1); font-size: 12px; line-height: 1.6; }
.data-update__button { flex-shrink: 0; border: 1px solid rgba(255,179,71,.5); border-radius: 9px; background: var(--accent-soft); color: var(--accent); padding: 9px 16px; font-size: 13px; cursor: pointer; }
.data-update__button:hover { background: var(--bg-2); }
.data-update__button:disabled { opacity: .55; cursor: wait; }
.data-update__button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.data-update__retry { color: var(--accent); border: 0; background: none; text-decoration: underline; cursor: pointer; }
.data-update__sources { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 11px; color: var(--text-2); }
.data-update__note { margin: 7px 0 0; color: var(--text-2); font-size: 11px; line-height: 1.6; }
.data-update__warning { color: #efbd82; font-size: 12px; line-height: 1.6; }
.data-update__issues { margin-top: 10px; font-size: 11px; color: var(--text-2); overflow-wrap: anywhere; }
.data-update__issues summary { cursor: pointer; }
.data-update__issues p { margin: 6px 0; }
@media (max-width: 480px) { .data-update { padding: 14px; } .data-update__title span { display: block; margin: 4px 0 0; } .data-update__button { padding: 9px 12px; } }
</style>
