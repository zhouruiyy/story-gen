<template>
  <div class="app-container">
    <transition name="fade" mode="out-in">
      <StoryView
        v-if="currentView === 'story'"
        :story="currentStory"
        @back="currentView = 'home'"
        @save="saveStory"
      />
      <FavoritesView
        v-else-if="currentView === 'favorites'"
        :stories="favorites"
        @back="currentView = 'home'"
        @select="viewFavorite"
        @remove="removeFavorite"
      />
      <HomeView
        v-else
        @generate="handleGenerate"
        @open-favorites="currentView = 'favorites'"
        :favorites-count="favorites.length"
      />
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import HomeView from './views/HomeView.vue'
import StoryView from './views/StoryView.vue'
import FavoritesView from './views/FavoritesView.vue'

const currentView = ref('home')
const currentStory = ref(null)
const favorites = ref([])

onMounted(() => {
  const saved = localStorage.getItem('story-gen-favorites')
  if (saved) {
    try { favorites.value = JSON.parse(saved) } catch {}
  }
})

function saveFavorites() {
  localStorage.setItem('story-gen-favorites', JSON.stringify(favorites.value))
}

function handleGenerate(story) {
  currentStory.value = story
  currentView.value = 'story'
}

function saveStory(story) {
  const exists = favorites.value.some(f => f.id === story.id)
  if (!exists) {
    favorites.value.unshift({ ...story, savedAt: Date.now() })
    saveFavorites()
  }
}

function removeFavorite(id) {
  favorites.value = favorites.value.filter(f => f.id !== id)
  saveFavorites()
}

function viewFavorite(story) {
  currentStory.value = story
  currentView.value = 'story'
}
</script>

<style scoped>
.app-container {
  position: relative;
  z-index: 1;
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
