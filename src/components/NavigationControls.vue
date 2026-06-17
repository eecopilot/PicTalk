<template>
  <div class="navigation-controls">
    <button v-if="isFullscreen" class="exit-fullscreen" @click="$emit('exit-fullscreen')">
      <el-icon><Close /></el-icon>
    </button>

    <button
      v-if="!isFullscreen && hasImage && mode === 'read'"
      class="enter-fullscreen"
      @click="$emit('enter-fullscreen')"
    >
      <el-icon><FullScreen /></el-icon>
    </button>

    <button
      v-if="hasBook && pageCount > 1 && currentPageIndex > 0"
      class="prev-page"
      @click="$emit('previous-page')"
    >
      <el-icon><ArrowLeft /></el-icon>
    </button>

    <button
      v-if="hasBook && pageCount > 1 && currentPageIndex < pageCount - 1"
      class="next-page"
      @click="$emit('next-page')"
    >
      <el-icon><ArrowRight /></el-icon>
    </button>

    <div v-if="hasBook && pageCount > 1" class="page-indicator">
      {{ currentPageIndex + 1 }} / {{ pageCount }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, Close, FullScreen } from '@element-plus/icons-vue';

defineProps<{
  isFullscreen: boolean;
  hasImage: boolean;
  hasBook: boolean;
  mode: 'edit' | 'read';
  currentPageIndex: number;
  pageCount: number;
}>();

defineEmits<{
  'exit-fullscreen': [];
  'enter-fullscreen': [];
  'previous-page': [];
  'next-page': [];
}>();
</script>
