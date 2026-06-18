<template>
  <div
    role="button"
    tabindex="0"
    class="region-marker"
    :class="{
      selected: isSelected || isPlaying,
      reading: mode === 'read',
      editable: mode === 'edit',
      icon: isIcon,
      playing: isPlaying,
      persisted: isPersisted,
      editing: isEditing
    }"
    :style="markerStyle"
    @click.stop="handleClick"
    @pointerdown.stop="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
  >
    <el-input
      v-if="isEditing"
      v-model="region.text"
      class="region-input"
      type="textarea"
      resize="none"
      placeholder="输入文字"
      @click.stop
      @pointerdown.stop
      @focusin="$emit('select', region.localId)"
    />
    <button
      v-if="isEditing"
      class="marker-action inline-save"
      title="收起为喇叭"
      @click.stop="$emit('collapse', region)"
      @pointerdown.stop
    >
      <el-icon><Check /></el-icon>
    </button>
    <button
      v-if="isEditing"
      class="marker-action inline-delete"
      title="删除该标注"
      @click.stop="$emit('delete', region)"
      @pointerdown.stop
    >
      <el-icon><Delete /></el-icon>
    </button>
    <button
      v-if="isEditing"
      class="marker-action drag-handle"
      title="拖动标注"
      @click.stop
      @pointerdown.stop="handlePointerDown($event, 'box')"
    >
      <el-icon><Rank /></el-icon>
    </button>
    <button
      v-if="isEditing"
      class="marker-action resize-handle"
      title="调整大小"
      @click.stop
      @pointerdown.stop="handlePointerDown($event, 'resize')"
    >
      <el-icon><BottomRight /></el-icon>
    </button>
    <span
      v-else
      class="speaker-hotspot"
      :class="{ google: region.audioSource === 'google' }"
      :title="region.audioSource === 'google' ? 'Google 发音' : (region.text || '点击播放')"
    >
      <el-icon>
        <Headset v-if="region.audioSource === 'google'" />
        <Microphone v-else />
      </el-icon>
    </span>
  </div>
</template>

<script setup lang="ts">
import { BottomRight, Check, Delete, Headset, Microphone, Rank } from '@element-plus/icons-vue';
import type { TextRegion } from '../types';
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps<{
  region: TextRegion;
  mode: 'edit' | 'read';
  selectedLocalId: string | null;
  editingLocalId: string | null;
  playingLocalId: string | null;
  markerStyle: Record<string, string>;
  isIcon: boolean;
}>();

const emit = defineEmits<{
  click: [region: TextRegion];
  'long-press': [region: TextRegion];
  pointerdown: [event: PointerEvent, region: TextRegion, dragMode?: 'box' | 'resize'];
  select: [localId: string];
  collapse: [region: TextRegion];
  delete: [region: TextRegion];
}>();

const isSelected = computed(() => props.region.localId === props.selectedLocalId);
const isPlaying = computed(() => props.region.localId === props.playingLocalId);
const isPersisted = computed(() => Boolean(props.region.id));
const isEditing = computed(() =>
  props.mode === 'edit' &&
  (!props.region.confirmed || props.editingLocalId === props.region.localId) &&
  !props.isIcon
);
const longPressTimer = ref<number | null>(null);
const longPressTriggered = ref(false);
const pointerStart = ref<{ x: number; y: number } | null>(null);

onBeforeUnmount(() => {
  clearLongPressTimer();
});

function handleClick() {
  if (longPressTriggered.value) {
    longPressTriggered.value = false;
    return;
  }
  emit('click', props.region);
}

function handlePointerDown(event: PointerEvent, dragMode: 'box' | 'resize' = 'box') {
  if (props.mode === 'read' && dragMode === 'box') {
    clearLongPressTimer();
    pointerStart.value = { x: event.clientX, y: event.clientY };
    longPressTriggered.value = false;
    longPressTimer.value = window.setTimeout(() => {
      longPressTriggered.value = true;
      emit('long-press', props.region);
    }, 520);
  }

  emit('pointerdown', event, props.region, dragMode);
}

function handlePointerMove(event: PointerEvent) {
  if (!pointerStart.value || !longPressTimer.value) return;
  if (Math.hypot(event.clientX - pointerStart.value.x, event.clientY - pointerStart.value.y) > 8) {
    clearLongPressTimer();
  }
}

function handlePointerUp() {
  clearLongPressTimer();
}

function handlePointerCancel() {
  clearLongPressTimer();
}

function clearLongPressTimer() {
  if (longPressTimer.value !== null) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  pointerStart.value = null;
}
</script>
