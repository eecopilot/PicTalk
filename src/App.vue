<template>
  <main class="app-shell" :class="{ 'fullscreen-mode': isFullscreen }">
    <AppHeader
      :tips="tips"
      :current-book="currentBook"
      :uploading="uploading"
      @open-history="openHistory"
      @upload="uploadImage"
    />

    <HistoryDrawer
      v-model:visible="historyVisible"
      v-model:tab="historyTab"
      :books="books"
      :save-records="saveRecords"
      @create-book="openCreateBookDialog"
      @load-book="loadBook"
      @delete-book="deleteBook"
      @load-record="loadHistoryRecord"
      @delete-record="deleteSaveRecord"
      @clear-history="clearSaveRecords"
    />

    <ImportDialog
      v-model:visible="importDialogVisible"
      v-model:json-text="importJsonText"
      :importing="importingRegions"
      @copy-prompt="copyOcrPrompt"
      @import="importRegions"
    />

    <CreateBookDialog
      v-model:visible="createBookDialogVisible"
      v-model:book-name="newBookName"
      v-model:upload-files="bookUploadFiles"
      :creating="creatingBook"
      @create="createBook"
    />

    <NavigationControls
      :is-fullscreen="isFullscreen"
      :has-image="!!currentImage"
      :has-book="!!currentBook"
      :mode="mode"
      :current-page-index="currentPageIndex"
      :page-count="bookPages.length"
      @exit-fullscreen="exitFullscreen"
      @enter-fullscreen="enterFullscreen"
      @previous-page="previousPage"
      @next-page="nextPage"
    />

    <StageArea
      ref="stageAreaRef"
      :current-image="currentImage"
      :regions="regions"
      :mode="mode"
      :selected-local-id="selectedLocalId"
      :editing-local-id="editingLocalId"
      :playing-local-id="playingLocalId"
      :frame-size="frameSize"
      :region-styles="regionStyles"
      :icon-flags="iconFlags"
      @stage-click="handleStageClick"
      @image-load="updateFrameSize"
      @region-click="handleRegionClick"
      @region-long-press="handleRegionLongPress"
      @region-pointerdown="startDrag"
      @region-select="localId => selectedLocalId = localId"
      @collapse-region="collapseRegion"
      @delete-region="deleteRegion"
    />

    <ToolBar
      :mode="mode"
      v-model:creating="creating"
      v-model:creating-audio-source="creatingAudioSource"
      :has-image="!!currentImage"
      :has-book="!!currentBook"
      :page-count="bookPages.length"
      :model-mode="modelMode"
      :ocr-refreshing="ocrRefreshing"
      :importing-regions="importingRegions"
      :saving="saving"
      :page-reading-status="pageReadingStatus"
      @update:mode="setMode"
      @reload="reloadImage"
      @refresh-ocr="refreshOcr"
      @open-import="openImportDialog"
      @export-json="exportRegionsJson"
      @delete-page="deleteCurrentPage"
      @save="saveRegions"
      @toggle-page-reading="togglePageReading"
    />

    <audio ref="audioRef" class="reader-audio" preload="none" playsinline />
  </main>
</template>

<script setup lang="ts">
import { ElMessage } from './element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AudioSource, ReaderImage, TextRegion, Book, BookPage } from './types';
import AppHeader from './components/AppHeader.vue';
import NavigationControls from './components/NavigationControls.vue';
import StageArea from './components/StageArea.vue';
import HistoryDrawer from './components/HistoryDrawer.vue';
import ImportDialog from './components/ImportDialog.vue';
import CreateBookDialog from './components/CreateBookDialog.vue';
import ToolBar from './components/ToolBar.vue';
import { useRegionDragging } from './composables/useRegionDragging';
import { useRegionStyles } from './composables/useRegionStyles';
import { useSingleReading } from './composables/useSingleReading';
import { usePageReading } from './composables/usePageReading';
import { useHistoryManager } from './composables/useHistoryManager';
import { useRegionEditor } from './composables/useRegionEditor';
import { useBookManager } from './composables/useBookManager';
import { useImageUpload } from './composables/useImageUpload';
import { copyTextToClipboard } from './utils/helpers';

const mode = ref<'edit' | 'read'>('edit');
const isFullscreen = ref(false);
const currentImage = ref<ReaderImage | null>(null);
const regions = ref<TextRegion[]>([]);
const currentBook = ref<Book | null>(null);
const bookPages = ref<BookPage[]>([]);
const currentPageIndex = ref(0);
const selectedLocalId = ref<string | null>(null);
const editingLocalId = ref<string | null>(null);
const creating = ref(false);
const creatingAudioSource = ref<AudioSource>('tts');
const stageAreaRef = ref<InstanceType<typeof StageArea> | null>(null);
const imageFrameRef = computed(() => stageAreaRef.value?.imageFrameRef || null);
const frameSize = ref({ width: 640, height: 420 });

const {
  regionStyles,
  iconFlags,
  isIconRegion,
  iconXPercent,
  iconYPercent,
  iconXPercentFromBox,
  iconYPercentFromBox,
  iconPixelWidthPercent,
  iconPixelHeightPercent,
  compactEditorSize
} = useRegionStyles({ regions, editingLocalId, frameSize });

const { startDrag, suppressNextRegionClick } = useRegionDragging({
  mode,
  imageFrameRef,
  selectedLocalId,
  isIconRegion,
  iconXPercent,
  iconYPercent
});

const { audioRef, playbackToken, playingLocalId, playRegion } = useSingleReading({
  mode,
  selectedLocalId
});

const { pageReadingStatus, togglePageReading, stopPageReading } = usePageReading({
  regions,
  mode,
  currentImage,
  audioRef,
  playbackToken,
  playingLocalId,
  selectedLocalId
});

const {
  saveRecords,
  books,
  historyVisible,
  historyTab,
  loadSaveRecords,
  loadBooks,
  openHistory,
  deleteSaveRecord,
  clearSaveRecords
} = useHistoryManager({
  regions,
  selectedLocalId,
  editingLocalId,
  creating,
  stopPageReading
});

const {
  saving,
  handleStageClick,
  collapseRegion,
  expandRegion,
  saveRegions,
  deleteRegion
} = useRegionEditor({
  mode,
  regions,
  selectedLocalId,
  editingLocalId,
  creating,
  creatingAudioSource,
  currentImage,
  currentBook,
  bookPages,
  currentPageIndex,
  imageFrameRef,
  isIconRegion,
  iconXPercent,
  iconYPercent,
  iconXPercentFromBox,
  iconYPercentFromBox,
  iconPixelWidthPercent,
  iconPixelHeightPercent,
  compactEditorSize,
  loadSaveRecords
});

const {
  newBookName,
  bookUploadFiles,
  creatingBook,
  createBookDialogVisible,
  openCreateBookDialog,
  createBook,
  loadBook,
  deleteBook,
  deleteCurrentPage,
  loadCurrentPage,
  previousPage,
  nextPage
} = useBookManager({
  mode,
  currentImage,
  regions,
  selectedLocalId,
  editingLocalId,
  currentBook,
  bookPages,
  currentPageIndex,
  historyVisible,
  books,
  stopPageReading,
  updateFrameSize,
  loadBooks
});

const {
  modelMode,
  manualImportMode,
  uploading,
  ocrRefreshing,
  importingRegions,
  importDialogVisible,
  importJsonText,
  uploadImage,
  reloadImage,
  refreshOcr,
  openImportDialog,
  copyOcrPrompt,
  importRegions,
  exportRegionsJson,
  loadHistoryRecord
} = useImageUpload({
  mode,
  currentImage,
  regions,
  selectedLocalId,
  editingLocalId,
  creating,
  creatingAudioSource,
  currentBook,
  bookPages,
  currentPageIndex,
  historyVisible,
  stopPageReading,
  updateFrameSize,
  loadCurrentPage
});

const tips = computed(() => {
  if (!currentImage.value) {
    return ['上传图片后自动识别文字。', '点击右上角历史按钮可打开保存记录。'];
  }
  if (manualImportMode.value) {
    return ['OCR API 暂不可用，已切到“非AI”导入 JSON。', '导入 JSON 会覆盖当前图片的全部标注。'];
  }
  if (mode.value === 'edit') {
    return ['OCR 会自动生成喇叭标注。', '拖动喇叭调整位置，再点“保存全部”。', '漏识别时可点击“生成文字”手动补充。'];
  }
  return ['阅读模式：点击喇叭播放声音。', '想调整位置时，切回编辑模式拖动喇叭。', '历史记录可以回填图片和标注坐标。'];
});

function setMode(nextMode: 'edit' | 'read') {
  if (nextMode === 'edit') stopPageReading();
  mode.value = nextMode;
}

onMounted(() => {
  window.addEventListener('resize', updateFrameSize);
  window.addEventListener('keydown', handleKeydown);
  loadSaveRecords();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateFrameSize);
  window.removeEventListener('keydown', handleKeydown);
});

function handleRegionClick(region: TextRegion) {
  if (suppressNextRegionClick.value) {
    suppressNextRegionClick.value = false;
    return;
  }
  selectedLocalId.value = region.localId;
  if (region.id && mode.value === 'read') {
    stopPageReading();
    playRegion(region, 1);
    return;
  }
  if (mode.value === 'edit') expandRegion(region);
}

function handleRegionLongPress(region: TextRegion) {
  selectedLocalId.value = region.localId;
  if (mode.value !== 'read') return;

  if (region.audioSource === 'google') {
    stopPageReading();
    playRegion(region, 2);
    return;
  }

  copyEnglishTextFromRegion(region);
}

async function copyEnglishTextFromRegion(region: TextRegion) {
  const englishText = extractEnglishText(region.text);
  if (!englishText) {
    ElMessage.warning('没有找到可复制的英文内容');
    return;
  }

  try {
    await copyTextToClipboard(englishText);
    ElMessage.success(`已复制英文：${englishText}`);
  } catch {
    ElMessage.error('复制失败，请手动选择英文内容');
  }
}

function extractEnglishText(text: string) {
  return Array.from(text.matchAll(/[A-Za-z]+(?:['-][A-Za-z]+)*/g))
    .map((match) => match[0])
    .join(' ')
    .trim();
}

function updateFrameSize() {
  if (!currentImage.value) return;
  const maxWidth = isFullscreen.value
    ? window.innerWidth - 32
    : Math.min(window.innerWidth - 32, 1080);
  const maxHeight = isFullscreen.value
    ? window.innerHeight - 32
    : Math.max(260, window.innerHeight - 176);
  const imageRatio = currentImage.value.width / currentImage.value.height;
  let width = maxWidth;
  let height = width / imageRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * imageRatio;
  }
  frameSize.value = { width, height };
}

function enterFullscreen() {
  isFullscreen.value = true;
  nextTick(() => updateFrameSize());
}

function exitFullscreen() {
  isFullscreen.value = false;
  nextTick(() => updateFrameSize());
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isFullscreen.value) {
    exitFullscreen();
    return;
  }

  if (currentBook.value && bookPages.value.length > 1 && !editingLocalId.value) {
    if (event.key === 'ArrowLeft' && currentPageIndex.value > 0) {
      event.preventDefault();
      previousPage();
    } else if (event.key === 'ArrowRight' && currentPageIndex.value < bookPages.value.length - 1) {
      event.preventDefault();
      nextPage();
    }
  }
}
</script>
