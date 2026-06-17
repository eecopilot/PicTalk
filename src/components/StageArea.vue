<template>
  <section class="stage" @click="$emit('stage-click', $event)">
    <div v-if="!currentImage" class="empty-state">
      <h2>上传一张图片开始点读标注</h2>
      <p>图片会居中显示，底部工具栏用于切换编辑和阅读。</p>
    </div>

    <div
      v-else
      ref="imageFrameRef"
      class="image-frame"
      :style="{ width: frameSize.width + 'px', height: frameSize.height + 'px' }"
    >
      <img
        ref="imageRef"
        :src="currentImage.url"
        :alt="currentImage.originalName"
        @load="$emit('image-load')"
      />

      <RegionMarker
        v-for="region in regions"
        :key="region.localId"
        :region="region"
        :mode="mode"
        :selected-local-id="selectedLocalId"
        :editing-local-id="editingLocalId"
        :playing-local-id="playingLocalId"
        :marker-style="regionStyles[region.localId] || {}"
        :is-icon="iconFlags[region.localId] || false"
        @click="$emit('region-click', region)"
        @pointerdown="$emit('region-pointerdown', $event, region)"
        @select="$emit('region-select', $event)"
        @collapse="$emit('collapse-region', region)"
        @delete="$emit('delete-region', region)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ReaderImage, TextRegion } from '../types';
import RegionMarker from './RegionMarker.vue';

defineProps<{
  currentImage: ReaderImage | null;
  regions: TextRegion[];
  mode: 'edit' | 'read';
  selectedLocalId: string | null;
  editingLocalId: string | null;
  playingLocalId: string | null;
  frameSize: { width: number; height: number };
  regionStyles: Record<string, Record<string, string>>;
  iconFlags: Record<string, boolean>;
}>();

defineEmits<{
  'stage-click': [event: MouseEvent];
  'image-load': [];
  'region-click': [region: TextRegion];
  'region-pointerdown': [event: PointerEvent, region: TextRegion];
  'region-select': [localId: string];
  'collapse-region': [region: TextRegion];
  'delete-region': [region: TextRegion];
}>();

const imageFrameRef = ref<HTMLDivElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);

defineExpose({
  imageFrameRef,
  imageRef
});
</script>
