<template>
  <section class="stage" @click="$emit('stage-click', $event)">
    <div v-if="!image" class="empty-state">
      <h2>上传一张图片开始点读标注</h2>
      <p>图片会居中显示，底部工具栏用于切换编辑和阅读。</p>
    </div>

    <div
      v-else
      ref="frameRef"
      class="image-frame"
      :style="{ width: frameSize.width + 'px', height: frameSize.height + 'px' }"
    >
      <img
        ref="imageRef"
        :src="image.url"
        :alt="image.originalName"
        @load="$emit('image-load')"
      />

      <slot name="regions" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ReaderImage } from '../types';
import { ref } from 'vue';

defineProps<{
  image: ReaderImage | null;
  frameSize: { width: number; height: number };
}>();

defineEmits<{
  'stage-click': [event: MouseEvent];
  'image-load': [];
}>();

const frameRef = ref<HTMLDivElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);

defineExpose({
  frameRef,
  imageRef
});
</script>
