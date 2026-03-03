<template>
  <div class="home">
    <header class="header">
      <div class="moon">🌙</div>
      <h1 class="title">故事星球</h1>
      <p class="subtitle">今晚想听什么故事呀？</p>
    </header>

    <!-- 宝宝名字 -->
    <section class="section">
      <label class="label">宝宝的名字</label>
      <input
        v-model="name"
        class="input"
        placeholder="输入名字，成为故事主角"
        maxlength="10"
      >
    </section>

    <!-- 关键词 -->
    <section class="section">
      <label class="label">故事关键词</label>
      <div class="keyword-presets">
        <button
          v-for="kw in presetKeywords"
          :key="kw"
          class="keyword-btn"
          :class="{ active: selectedKeywords.includes(kw) }"
          @click="toggleKeyword(kw)"
        >{{ kw }}</button>
      </div>
      <input
        v-model="customKeyword"
        class="input"
        placeholder="也可以自己输入关键词，回车添加"
        maxlength="20"
        @keydown.enter.prevent="addCustomKeyword"
      >
      <div v-if="selectedKeywords.length" class="selected-keywords">
        <span v-for="kw in selectedKeywords" :key="kw" class="selected-tag">
          {{ kw }}
          <button class="tag-remove" @click="removeKeyword(kw)">×</button>
        </span>
      </div>
    </section>

    <!-- 故事类型 -->
    <section class="section">
      <label class="label">故事类型</label>
      <div class="type-grid">
        <button
          v-for="t in storyTypes"
          :key="t.value"
          class="type-btn"
          :class="{ active: type === t.value }"
          @click="type = t.value"
        >
          <span class="type-icon">{{ t.icon }}</span>
          <span class="type-name">{{ t.label }}</span>
        </button>
      </div>
    </section>

    <!-- 故事时长 -->
    <section class="section">
      <label class="label">故事时长</label>
      <div class="length-row">
        <button
          v-for="l in storyLengths"
          :key="l.value"
          class="length-btn"
          :class="{ active: length === l.value }"
          @click="length = l.value"
        >{{ l.label }}</button>
      </div>
    </section>

    <!-- 生成按钮 -->
    <button
      class="generate-btn"
      :disabled="selectedKeywords.length === 0 || generating"
      @click="generate"
    >
      <span v-if="generating" class="loading-dots">故事正在飞来<span class="dots">...</span></span>
      <span v-else>✨ 开始讲故事</span>
    </button>

    <!-- 收藏入口 -->
    <button v-if="favoritesCount > 0" class="favorites-entry" @click="$emit('open-favorites')">
      📚 我的故事书 ({{ favoritesCount }})
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['generate', 'open-favorites'])
const props = defineProps({ favoritesCount: Number })

const name = ref('')
const selectedKeywords = ref([])
const customKeyword = ref('')
const type = ref('warm')
const length = ref('medium')
const generating = ref(false)

const presetKeywords = [
  '恐龙', '月亮', '小兔子', '太空', '森林',
  '大海', '小猫咪', '彩虹', '城堡', '小熊',
  '星星', '花园', '下雨天', '小鸟', '糖果屋'
]

const storyTypes = [
  { value: 'adventure', icon: '🚀', label: '冒险' },
  { value: 'friendship', icon: '🤝', label: '友谊' },
  { value: 'science', icon: '🔬', label: '科普' },
  { value: 'warm', icon: '💛', label: '温馨' }
]

const storyLengths = [
  { value: 'short', label: '短篇 ~3分钟' },
  { value: 'medium', label: '中篇 ~5分钟' }
]

function toggleKeyword(kw) {
  const idx = selectedKeywords.value.indexOf(kw)
  if (idx >= 0) {
    selectedKeywords.value.splice(idx, 1)
  } else if (selectedKeywords.value.length < 5) {
    selectedKeywords.value.push(kw)
  }
}

function addCustomKeyword() {
  const kw = customKeyword.value.trim()
  if (kw && !selectedKeywords.value.includes(kw) && selectedKeywords.value.length < 5) {
    selectedKeywords.value.push(kw)
    customKeyword.value = ''
  }
}

function removeKeyword(kw) {
  selectedKeywords.value = selectedKeywords.value.filter(k => k !== kw)
}

async function generate() {
  generating.value = true
  let fullText = ''

  try {
    const res = await fetch('/api/generate-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        keywords: selectedKeywords.value,
        type: type.value,
        length: length.value
      })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || '请求失败')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const json = JSON.parse(data)
          if (json.content) fullText += json.content
          if (json.error) throw new Error(json.error)
        } catch (e) {
          if (e.message === '生成中断') throw e
        }
      }
    }

    // 解析标题和正文
    const story = parseStory(fullText)
    emit('generate', story)
  } catch (err) {
    alert('生成失败：' + err.message)
  } finally {
    generating.value = false
  }
}

function parseStory(text) {
  let title = '今晚的故事'
  let content = text

  // 尝试提取标题
  const titleMatch = text.match(/^标题[：:]\s*(.+)/m)
  if (titleMatch) {
    title = titleMatch[1].trim()
    content = text.slice(text.indexOf(titleMatch[0]) + titleMatch[0].length).trim()
  }

  // 去掉可能的"正文："前缀
  content = content.replace(/^正文[：:]\s*/m, '').trim()

  return {
    id: Date.now().toString(),
    title,
    content,
    name: name.value.trim(),
    keywords: [...selectedKeywords.value],
    type: type.value,
    createdAt: Date.now()
  }
}
</script>

<style scoped>
.home {
  padding: 40px 20px 60px;
}

.header {
  text-align: center;
  margin-bottom: 36px;
}

.moon {
  font-size: 48px;
  margin-bottom: 8px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.title {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--warm), var(--accent-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 15px;
  margin-top: 6px;
}

.section {
  margin-bottom: 24px;
}

.label {
  display: block;
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  font-weight: 500;
}

.input {
  width: 100%;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1.5px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--accent);
}

.input::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}

.keyword-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.keyword-btn {
  padding: 8px 14px;
  background: var(--bg-card);
  border: 1.5px solid transparent;
  border-radius: 20px;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.keyword-btn.active {
  background: var(--accent-glow);
  border-color: var(--accent);
  color: var(--accent-light);
}

.selected-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.selected-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--accent-glow);
  border-radius: 12px;
  font-size: 13px;
  color: var(--accent-light);
}

.tag-remove {
  background: none;
  border: none;
  color: var(--accent-light);
  font-size: 16px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  background: var(--bg-card);
  border: 1.5px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.type-btn.active {
  background: var(--accent-glow);
  border-color: var(--accent);
  color: var(--accent-light);
}

.type-icon { font-size: 24px; }
.type-name { font-size: 13px; }

.length-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.length-btn {
  padding: 14px;
  background: var(--bg-card);
  border: 1.5px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.length-btn.active {
  background: var(--accent-glow);
  border-color: var(--accent);
  color: var(--accent-light);
}

.generate-btn {
  width: 100%;
  padding: 18px;
  background: linear-gradient(135deg, var(--accent), #6c5ce7);
  border: none;
  border-radius: var(--radius);
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 12px;
  transition: opacity 0.2s, transform 0.1s;
}

.generate-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-dots .dots {
  animation: blink 1.2s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.favorites-entry {
  display: block;
  width: 100%;
  padding: 14px;
  margin-top: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-card);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  text-align: center;
  transition: color 0.2s;
}

.favorites-entry:hover {
  color: var(--warm);
}
</style>
