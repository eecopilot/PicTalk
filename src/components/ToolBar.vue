<template>
  <footer class="bottom-toolbar">
    <div class="toolbar-section">
      <el-segmented v-model="localMode" :options="modeOptions" @change="handleModeChange" />
      <el-button
        :type="pageReadingStatus === 'idle' ? 'default' : 'primary'"
        :disabled="!hasImage || localMode !== 'read'"
        @click="$emit('toggle-page-reading')"
      >
        {{ pageReadingLabel }}
      </el-button>
    </div>

    <div class="toolbar-section" style="display: inline-flex;">
      <el-tooltip content="请先切换到编辑模式" :disabled="localMode === 'edit'" placement="top">
        <el-button
          :type="creating && creatingAudioSource === 'tts' ? 'primary' : 'default'"
          :disabled="!hasImage || localMode !== 'edit'"
          @click="toggleCreating('tts')"
        >
          生成文字
        </el-button>
      </el-tooltip>
      <el-tooltip content="请先切换到编辑模式" :disabled="localMode === 'edit'" placement="top">
        <el-button
          :type="creating && creatingAudioSource === 'google' ? 'primary' : 'default'"
          :disabled="!hasImage || localMode !== 'edit'"
          @click="toggleCreating('google')"
        >
          google发音
        </el-button>
      </el-tooltip>
      <el-button :disabled="!hasImage" @click="$emit('reload')">重置视图</el-button>
    </div>

    <div class="toolbar-section model-toolbar">
      <el-button-group v-if="modelMode === 'ai'">
        <el-button
          :disabled="!hasImage || localMode !== 'edit'"
          :loading="ocrRefreshing"
          @click="$emit('refresh-ocr')"
        >
          重新识别
        </el-button>
      </el-button-group>
      <div v-else style="display: inline-flex;">
        <el-tooltip content="请先切换到编辑模式" :disabled="localMode === 'edit'" placement="top">
          <el-button
            :disabled="!hasImage || localMode !== 'edit'"
            :loading="importingRegions"
            @click="$emit('open-import')"
          >
            导入 JSON
          </el-button>
        </el-tooltip>
        <el-button :disabled="!hasImage" @click="$emit('export-json')">
          导出 JSON
        </el-button>
      </div>
    </div>

    <div style="display: flex; gap: 8px;">
      <el-button
        v-if="hasBook && pageCount > 0"
        type="danger"
        :disabled="localMode !== 'edit'"
        @click="$emit('delete-page')"
      >
        删除当前页
      </el-button>
      <el-button
        type="success"
        :disabled="!hasImage || localMode !== 'edit'"
        :loading="saving"
        @click="$emit('save')"
      >
        保存全部
      </el-button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AudioSource } from '../types';

const props = defineProps<{
  mode: 'edit' | 'read';
  creating: boolean;
  creatingAudioSource: AudioSource;
  hasImage: boolean;
  hasBook: boolean;
  pageCount: number;
  modelMode: 'ai' | 'manual';
  ocrRefreshing: boolean;
  importingRegions: boolean;
  saving: boolean;
  pageReadingStatus: 'idle' | 'playing' | 'paused';
}>();

const emit = defineEmits<{
  'update:mode': [mode: 'edit' | 'read'];
  'update:creating': [creating: boolean];
  'update:creatingAudioSource': [audioSource: AudioSource];
  reload: [];
  'refresh-ocr': [];
  'open-import': [];
  'export-json': [];
  'delete-page': [];
  save: [];
  'toggle-page-reading': [];
}>();

const modeOptions = [
  { label: '编辑', value: 'edit' },
  { label: '阅读', value: 'read' }
];

const localMode = computed({
  get: () => props.mode,
  set: (value) => emit('update:mode', value)
});

const pageReadingLabel = computed(() => {
  if (props.pageReadingStatus === 'playing') return '暂停朗读';
  if (props.pageReadingStatus === 'paused') return '恢复朗读';
  return '朗读全页';
});

function handleModeChange(value: 'edit' | 'read') {
  emit('update:mode', value);
}

function toggleCreating(audioSource: AudioSource) {
  emit('update:creatingAudioSource', audioSource);
  emit('update:creating', !(props.creating && props.creatingAudioSource === audioSource));
}
</script>
