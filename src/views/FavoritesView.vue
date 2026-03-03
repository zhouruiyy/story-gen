<template>
  <div class="favorites">
    <header class="fav-header">
      <button class="back-btn" @click="$emit('back')">← 返回</button>
      <h2 class="fav-title">📚 我的故事书</h2>
      <div style="width:48px"></div>
    </header>

    <div v-if="stories.length === 0" class="empty">
      <div class="empty-icon">🌟</div>
      <p>还没有收藏的故事</p>
      <p class="empty-hint">生成故事后点击收藏，就会出现在这里</p>
    </div>

    <div v-else class="story-list">
      <div
        v-for="story in stories"
        :key="story.id"
        class="story-card"
        @click="$emit('select', story)"
      >
        <div class="card-content">
          <h3 class="card-title">{{ story.title }}</h3>
          <p class="card-preview">{{ story.content?.slice(0, 60) }}...</p>
          <div class="card-meta">
            <span v-if="story.name">👤 {{ story.name }}</span>
            <span>{{ formatDate(story.createdAt) }}</span>
          </div>
        </div>
        <button
          class="remove-btn"
          @click.stop="$emit('remove', story.id)"
          aria-label="删除故事"
        >🗑</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ stories: Array })
defineEmits(['back', 'select', 'remove'])

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<style scoped>
.favorites {
  padding: 20px;
  min-height: 100vh;
}

.fav-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}

.back-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 8px 0;
}

.fav-title {
  font-size: 18px;
  font-weight: 600;
}

.empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-hint {
  font-size: 13px;
  margin-top: 8px;
  opacity: 0.6;
}

.story-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.story-card {
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.story-card:active {
  background: var(--bg-card);
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--warm);
  margin-bottom: 6px;
}

.card-preview {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.6;
}

.remove-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  opacity: 0.5;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.remove-btn:hover {
  opacity: 1;
}
</style>
