<template>
  <div class="story-view">
    <header class="story-header">
      <button class="back-btn" @click="handleBack">← 返回</button>
      <button
        class="save-btn"
        :class="{ saved: isSaved }"
        @click="handleSave"
      >{{ isSaved ? '⭐ 已收藏' : '☆ 收藏' }}</button>
    </header>

    <div class="story-content">
      <h2 class="story-title">{{ story.title }}</h2>
      <div class="story-meta">
        <span v-if="story.name">👤 {{ story.name }}</span>
        <span>{{ story.keywords?.join(' · ') }}</span>
      </div>
      <div class="story-text">
        <p v-for="(para, i) in paragraphs" :key="i">{{ para }}</p>
      </div>
    </div>

    <!-- 朗读控制 -->
    <div class="tts-controls">
      <!-- 音色选择 -->
      <div class="voice-row">
        <button
          v-for="v in voices"
          :key="v.id"
          class="voice-btn"
          :class="{ active: selectedVoice === v.id }"
          @click="switchVoice(v.id)"
        >{{ v.label }}</button>
      </div>

      <button class="tts-btn" :disabled="loading" @click="handlePlay">
        <span v-if="loading" class="loading-dots">语音生成中<span class="dots">...</span></span>
        <span v-else>
          <span class="tts-icon">{{ isPlaying ? '⏸' : '▶' }}</span>
          {{ isPlaying ? '暂停朗读' : voiceSwitched ? '以新音色朗读' : '开始朗读' }}
        </span>
      </button>

      <!-- 进度条 -->
      <div v-if="audioReady" class="progress-row">
        <span class="time">{{ formatTime(currentTime) }}</span>
        <input
          type="range"
          class="progress-slider"
          :value="currentTime"
          :max="duration"
          step="0.1"
          @input="seek"
        >
        <span class="time">{{ formatTime(duration) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({ story: Object })
const emit = defineEmits(['back', 'save'])

const isSaved = ref(false)
const isPlaying = ref(false)
const loading = ref(false)
const audioReady = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const selectedVoice = ref('longxiaochun_v3')

let audio = null
let animFrame = null
let abortController = null
const voiceSwitched = ref(false)

const voices = [
  { id: 'longxiaochun_v3', label: '👩 小纯（温柔）' },
  { id: 'longyuan_v3', label: '👧 龙媛（治愈）' },
  { id: 'longanyang', label: '👨 安阳（阳光）' },
]

function stopAndCleanup() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  if (audio) {
    audio.pause()
    URL.revokeObjectURL(audio.src)
    audio = null
  }
  cancelAnimationFrame(animFrame)
  isPlaying.value = false
  audioReady.value = false
  currentTime.value = 0
  duration.value = 0
}

function switchVoice(voiceId) {
  if (voiceId === selectedVoice.value) return
  selectedVoice.value = voiceId
  // 如果正在播放或加载中，停止当前音频，但不自动重新合成
  // 避免连续切换音色时反复请求 TTS API
  if (isPlaying.value || loading.value || audioReady.value) {
    stopAndCleanup()
    loading.value = false
    voiceSwitched.value = true
  }
}

const paragraphs = computed(() => {
  if (!props.story?.content) return []
  return props.story.content
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
})

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function updateProgress() {
  if (audio) {
    currentTime.value = audio.currentTime
    if (!audio.paused) {
      animFrame = requestAnimationFrame(updateProgress)
    }
  }
}

function seek(e) {
  if (audio) {
    audio.currentTime = parseFloat(e.target.value)
    currentTime.value = audio.currentTime
  }
}

function handlePlay() {
  voiceSwitched.value = false
  toggleSpeech()
}

async function toggleSpeech() {
  // 如果正在播放，暂停
  if (isPlaying.value && audio) {
    audio.pause()
    isPlaying.value = false
    return
  }

  // 如果已有音频且只是暂停了，继续播放
  if (audio && audioReady.value && audio.paused) {
    audio.play()
    isPlaying.value = true
    updateProgress()
    return
  }

  // 流式生成 + 播放
  loading.value = true
  try {
    // 清理旧音频
    stopAndCleanup()

    abortController = new AbortController()

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: props.story.content,
        voice: selectedVoice.value
      }),
      signal: abortController.signal
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || '语音合成失败')
    }

    // 使用 MediaSource 实现边下边播
    const mediaSource = new MediaSource()
    const url = URL.createObjectURL(mediaSource)
    audio = new Audio(url)

    mediaSource.addEventListener('sourceopen', async () => {
      const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
      const reader = res.body.getReader()

      // 收到第一块数据后就开始播放
      let firstChunk = true

      async function pump() {
        const { done, value } = await reader.read()
        if (done) {
          // 等待 sourceBuffer 更新完毕后关闭
          if (sourceBuffer.updating) {
            sourceBuffer.addEventListener('updateend', () => {
              if (mediaSource.readyState === 'open') mediaSource.endOfStream()
            }, { once: true })
          } else {
            if (mediaSource.readyState === 'open') mediaSource.endOfStream()
          }
          return
        }

        // 追加音频数据
        if (sourceBuffer.updating) {
          await new Promise(r => sourceBuffer.addEventListener('updateend', r, { once: true }))
        }
        sourceBuffer.appendBuffer(value)

        if (firstChunk) {
          firstChunk = false
          loading.value = false
          await audio.play()
          isPlaying.value = true
          updateProgress()
        }

        // 等待追加完成后继续读取
        if (sourceBuffer.updating) {
          await new Promise(r => sourceBuffer.addEventListener('updateend', r, { once: true }))
        }
        await pump()
      }

      await pump()
    })

    audio.addEventListener('loadedmetadata', () => {
      duration.value = audio.duration
      audioReady.value = true
    })
    // duration 在流式模式下可能是 Infinity，需要在 endOfStream 后更新
    audio.addEventListener('durationchange', () => {
      if (isFinite(audio.duration)) {
        duration.value = audio.duration
        audioReady.value = true
      }
    })
    audio.addEventListener('ended', () => {
      isPlaying.value = false
      currentTime.value = 0
    })
  } catch (err) {
    if (err.name === 'AbortError') return  // 切换音色导致的中断，忽略
    alert('语音合成失败：' + err.message)
  } finally {
    loading.value = false
  }
}

function handleSave() {
  if (!isSaved.value) {
    emit('save', props.story)
    isSaved.value = true
  }
}

function handleBack() {
  stopAndCleanup()
  emit('back')
}

onUnmounted(() => {
  stopAndCleanup()
})
</script>

<style scoped>
.story-view {
  padding: 20px;
  padding-bottom: 200px;
}

.story-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.back-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 8px 0;
}

.save-btn {
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1.5px solid transparent;
  border-radius: 20px;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn.saved {
  background: var(--warm-glow);
  border-color: var(--warm);
  color: var(--warm);
}

.story-content {
  background: var(--bg-secondary);
  border-radius: var(--radius);
  padding: 28px 22px;
}

.story-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--warm);
  margin-bottom: 12px;
  line-height: 1.4;
}

.story-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  opacity: 0.7;
}

.story-text {
  font-size: 18px;
  line-height: 1.9;
  color: var(--text-primary);
}

.story-text p {
  margin-bottom: 16px;
  text-indent: 2em;
}

.story-text p:last-child {
  margin-bottom: 0;
}

/* TTS 控制栏 */
.tts-controls {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  background: var(--bg-primary);
  border-top: 1px solid var(--bg-card);
  padding: 12px 20px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

.voice-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.voice-btn {
  flex: 1;
  padding: 8px 4px;
  background: var(--bg-card);
  border: 1.5px solid transparent;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.voice-btn.active {
  background: var(--accent-glow);
  border-color: var(--accent);
  color: var(--accent-light);
}

.tts-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  background: linear-gradient(135deg, var(--accent), #6c5ce7);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.tts-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.tts-icon { font-size: 18px; }

.loading-dots .dots {
  animation: blink 1.2s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.time {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
}

.progress-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--bg-card);
  border-radius: 2px;
  outline: none;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
}
</style>
