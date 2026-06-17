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
      @region-pointerdown="startDrag"
      @region-select="localId => selectedLocalId = localId"
      @collapse-region="collapseRegion"
      @delete-region="deleteRegion"
    />

    <ToolBar
      v-model:mode="mode"
      v-model:creating="creating"
      :has-image="!!currentImage"
      :has-book="!!currentBook"
      :page-count="bookPages.length"
      :model-mode="modelMode"
      :ocr-refreshing="ocrRefreshing"
      :importing-regions="importingRegions"
      :saving="saving"
      @reload="reloadImage"
      @refresh-ocr="refreshOcr"
      @open-import="openImportDialog"
      @export-json="exportRegionsJson"
      @delete-page="deleteCurrentPage"
      @save="saveRegions"
    />

    <audio ref="audioRef" class="reader-audio" preload="none" playsinline />
  </main>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, Close, FullScreen, Plus } from '@element-plus/icons-vue';
import { ElLoading, ElMessage, ElMessageBox } from './element-plus';
import type { LoadingInstance } from 'element-plus/es/components/loading/src/loading';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ReaderImage, TextRegion, SaveRecord, Book, BookPage } from './types';
import AppHeader from './components/AppHeader.vue';
import NavigationControls from './components/NavigationControls.vue';
import StageArea from './components/StageArea.vue';
import RegionMarker from './components/RegionMarker.vue';
import HistoryDrawer from './components/HistoryDrawer.vue';
import ImportDialog from './components/ImportDialog.vue';
import CreateBookDialog from './components/CreateBookDialog.vue';
import ImageCanvas from './components/ImageCanvas.vue';
import ToolBar from './components/ToolBar.vue';
import {
  clamp,
  roundPercent,
  safeFileStem,
  normalizeRegion,
  readImageDimensions,
  buildManualOcrPrompt,
  copyTextToClipboard,
  parseImportedRegions,
  formatOcrError,
  createLocalId
} from './utils/helpers';

const mode = ref<'edit' | 'read'>('edit');
const modeOptions = [
  { label: '编辑', value: 'edit' },
  { label: '阅读', value: 'read' }
];
const modelMode = ref<'ai' | 'manual'>('manual');
const isFullscreen = ref(false);
const currentImage = ref<ReaderImage | null>(null);
const regions = ref<TextRegion[]>([]);
const saveRecords = ref<SaveRecord[]>([]);
const currentBook = ref<Book | null>(null);
const bookPages = ref<BookPage[]>([]);
const currentPageIndex = ref(0);
const selectedLocalId = ref<string | null>(null);
const historyVisible = ref(false);
const historyTab = ref<'books' | 'records'>('records');
const historyTabOptions = [
  { label: '单图', value: 'records' },
  { label: '书本', value: 'books' }
];
const books = ref<Book[]>([]);
const creating = ref(false);
const saving = ref(false);
const ocrRefreshing = ref(false);
const uploading = ref(false);
const importingRegions = ref(false);
const importDialogVisible = ref(false);
const importJsonText = ref('');
const createBookDialogVisible = ref(false);
const newBookName = ref('');
const bookUploadFiles = ref<any[]>([]);
const creatingBook = ref(false);
const manualImportMode = ref(false);
const stageAreaRef = ref<InstanceType<typeof StageArea> | null>(null);
const imageFrameRef = computed(() => stageAreaRef.value?.imageFrameRef || null);
const imageRef = computed(() => stageAreaRef.value?.imageRef || null);
const audioRef = ref<HTMLAudioElement | null>(null);
const frameSize = ref({ width: 640, height: 420 });
const editingLocalId = ref<string | null>(null);
const playingLocalId = ref<string | null>(null);
const playbackToken = ref(0);
const speakerIconSize = 32;
const uploadLoading = ref<LoadingInstance | null>(null);
const dragging = ref<{
  region: TextRegion;
  startX: number;
  startY: number;
  startRegionX: number;
  startRegionY: number;
  widthPercent: number;
  heightPercent: number;
  mode: 'icon' | 'box' | 'resize';
  moved: boolean;
} | null>(null);
const suppressNextRegionClick = ref(false);

const selectedRegion = computed(() => regions.value.find((item) => item.localId === selectedLocalId.value));

const regionStyles = computed(() => {
  const styles: Record<string, Record<string, string>> = {};
  regions.value.forEach(region => {
    styles[region.localId] = regionStyle(region);
  });
  return styles;
});

const iconFlags = computed(() => {
  const flags: Record<string, boolean> = {};
  regions.value.forEach(region => {
    flags[region.localId] = isIconRegion(region);
  });
  return flags;
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

onMounted(() => {
  window.addEventListener('resize', updateFrameSize);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('keydown', handleKeydown);
  loadSaveRecords();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateFrameSize);
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', stopDrag);
  window.removeEventListener('keydown', handleKeydown);
});

async function uploadImage(options: unknown) {
  const file = resolveUploadFile(options);
  if (!file) {
    ElMessage.error('上传失败：没有读取到图片文件');
    return;
  }

  uploading.value = true;
  uploadLoading.value = ElLoading.service({
    lock: true,
    text: '正在上传图片并识别文字...',
    background: 'rgba(243, 245, 248, 0.82)'
  });
  try {
    const body = new FormData();
    const dimensions = await readImageDimensions(file);
    body.append('image', file);
    body.append('width', String(dimensions.width));
    body.append('height', String(dimensions.height));
    const response = await fetch('/api/images', { method: 'POST', body });
    if (!response.ok) {
      ElMessage.error(await responseErrorMessage(response, '上传失败'));
      return;
    }
    const data = await response.json();

    // 如果在书本模式下，添加到书本
    if (currentBook.value) {
      const pageResponse = await fetch(`/api/books/${currentBook.value.id}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: data.image.id })
      });
      if (!pageResponse.ok) {
        ElMessage.error(await responseErrorMessage(pageResponse, '添加页面失败'));
        return;
      }

      // 重新加载书本数据
      const bookResponse = await fetch(`/api/books/${currentBook.value.id}`);
      if (bookResponse.ok) {
        const bookData = await bookResponse.json();
        bookPages.value = bookData.pages;
        currentPageIndex.value = bookPages.value.length - 1; // 跳到新添加的页面
        loadCurrentPage();
        ElMessage.success('新页面添加成功');
      }
    } else {
      // 单图模式
      currentImage.value = data.image;
      regions.value = data.regions.map(normalizeRegion);
      selectedLocalId.value = null;
      editingLocalId.value = null;
      manualImportMode.value = Boolean(data.ocrError || (data.ocrEnabled && regions.value.length === 0));
      modelMode.value = manualImportMode.value ? 'manual' : 'ai';
      mode.value = 'edit';
      if (data.cached && regions.value.length > 0) {
        ElMessage.success('已从缓存加载这张图片和标注。');
      } else if (data.cached) {
        ElMessage.info('这张图片已存在，当前没有标注。');
      } else if (data.ocrEnabled && regions.value.length === 0) {
        ElMessage.warning(data.ocrError ? 'OCR 暂不可用，可切到”非AI”导入 JSON' : '已上传图片，但暂未识别到文字');
      } else if (data.ocrEnabled && regions.value.length > 0) {
        ElMessage.success('识别完成，请检查喇叭位置，确认无误后点击”保存全部”。');
      }
    }
    await nextTick();
    updateFrameSize();
  } catch (error) {
    ElMessage.error(error instanceof Error ? `上传或识别失败：${error.message}` : '上传或识别失败');
  } finally {
    uploading.value = false;
    uploadLoading.value?.close();
    uploadLoading.value = null;
  }
}

async function reloadImage() {
  if (!currentImage.value) return;
  const response = await fetch(`/api/images/${currentImage.value.id}`);
  if (!response.ok) {
    ElMessage.error('加载图片失败');
    return;
  }
  const data = await response.json();
  currentImage.value = data.image;
  regions.value = data.regions.map(normalizeRegion);
  selectedLocalId.value = null;
  editingLocalId.value = null;
  manualImportMode.value = false;
  // 保持当前 modelMode，不强制修改
  await nextTick();
  updateFrameSize();
}

async function loadSaveRecords() {
  const response = await fetch('/api/save-records');
  if (!response.ok) return;
  const data = await response.json();
  saveRecords.value = data.records;
}

async function loadBooks() {
  const response = await fetch('/api/books');
  if (!response.ok) return;
  const data = await response.json();
  books.value = data.books;
}

async function openHistory() {
  await loadSaveRecords();
  await loadBooks();
  historyVisible.value = true;
}

async function loadBook(book: Book) {
  const response = await fetch(`/api/books/${book.id}`);
  if (!response.ok) {
    ElMessage.error('加载书本失败');
    return;
  }
  const data = await response.json();
  currentBook.value = data.book;
  bookPages.value = data.pages;
  currentPageIndex.value = 0;

  historyVisible.value = false;

  if (bookPages.value.length === 0) {
    // 空书本直接进入编辑模式
    currentImage.value = null;
    regions.value = [];
    selectedLocalId.value = null;
    editingLocalId.value = null;
    mode.value = 'edit';
    ElMessage.info('请上传图片添加新页');
  } else {
    // 有页面直接进入编辑模式，显示第1页
    loadCurrentPage();
    mode.value = 'edit';
  }
}

async function deleteBook(book: Book) {
  const response = await fetch(`/api/books/${book.id}`, { method: 'DELETE' });
  if (!response.ok) {
    ElMessage.error('删除书本失败');
    return;
  }
  books.value = books.value.filter((item) => item.id !== book.id);
}

async function deleteCurrentPage() {
  if (!currentBook.value || !currentImage.value) return;

  const currentPage = bookPages.value[currentPageIndex.value];
  if (!currentPage) return;

  try {
    await ElMessageBox.confirm(
      `确定删除第 ${currentPageIndex.value + 1} 页吗？`,
      '删除页面',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
  } catch {
    return;
  }

  const response = await fetch(`/api/books/${currentBook.value.id}/pages/${currentPage.id}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    ElMessage.error('删除页面失败');
    return;
  }

  // 从列表中移除
  bookPages.value.splice(currentPageIndex.value, 1);

  // 处理删除后的跳转
  if (bookPages.value.length === 0) {
    // 书本变空
    currentImage.value = null;
    regions.value = [];
    selectedLocalId.value = null;
    editingLocalId.value = null;
    ElMessage.success('页面已删除，书本现在为空');
  } else if (currentPageIndex.value >= bookPages.value.length) {
    // 删除的是最后一页，跳到前一页
    currentPageIndex.value = bookPages.value.length - 1;
    loadCurrentPage();
    ElMessage.success('页面已删除');
  } else {
    // 删除中间页，当前索引不变（显示下一页）
    loadCurrentPage();
    ElMessage.success('页面已删除');
  }
}

async function loadHistoryRecord(record: SaveRecord) {
  const response = await fetch(`/api/images/${record.imageId}`);
  if (!response.ok) {
    ElMessage.error('加载历史记录失败');
    return;
  }
  const data = await response.json();
  currentBook.value = null;
  bookPages.value = [];
  currentPageIndex.value = 0;
  currentImage.value = data.image;
  regions.value = data.regions.map(normalizeRegion);
  selectedLocalId.value = null;
  editingLocalId.value = null;
  creating.value = false;
  manualImportMode.value = false;
  // 保持默认的 manual 模式，不强制设置为 ai
  mode.value = 'read';
  historyVisible.value = false;
  await nextTick();
  updateFrameSize();
}

async function deleteSaveRecord(record: SaveRecord) {
  const response = await fetch(`/api/save-records/${record.id}`, { method: 'DELETE' });
  if (!response.ok) {
    ElMessage.error('删除历史失败');
    return;
  }
  saveRecords.value = saveRecords.value.filter((item) => item.id !== record.id);
}

async function clearSaveRecords() {
  const response = await fetch('/api/save-records', { method: 'DELETE' });
  if (!response.ok) {
    ElMessage.error('清空历史失败');
    return;
  }
  const data = await response.json().catch(() => null);
  saveRecords.value = [];
  regions.value = [];
  selectedLocalId.value = null;
  editingLocalId.value = null;
  creating.value = false;
  ElMessage.success(`已清空历史和 ${data?.regionsDeleted ?? 0} 个标注`);
}

async function refreshOcr() {
  if (!currentImage.value) return;
  if (regions.value.length > 0) {
    try {
      await ElMessageBox.confirm('重新识别会覆盖当前图片的全部文字标注，确定继续吗？', '重新识别', {
        confirmButtonText: '重新识别',
        cancelButtonText: '取消',
        type: 'warning'
      });
    } catch {
      return;
    }
  }
  ocrRefreshing.value = true;
  try {
    const response = await fetch(`/api/images/${currentImage.value.id}/ocr`, { method: 'POST' });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (data?.regions) regions.value = data.regions.map(normalizeRegion);
      manualImportMode.value = true;
      modelMode.value = 'manual';
      throw new Error(formatOcrError(data, regions.value.length));
    }
    const data = await response.json();
    regions.value = data.regions.map(normalizeRegion);
    selectedLocalId.value = null;
    editingLocalId.value = null;
    creating.value = false;
    manualImportMode.value = false;
    modelMode.value = 'ai';
    await nextTick();
    updateFrameSize();
    if (regions.value.length === 0) {
      ElMessage.warning('重新识别完成，但暂未识别到文字');
    } else {
      ElMessage.success('已重新识别，请检查喇叭位置。');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重新识别失败');
  } finally {
    ocrRefreshing.value = false;
  }
}

function openImportDialog() {
  importJsonText.value = '';
  importDialogVisible.value = true;
}

async function copyOcrPrompt() {
  if (!currentImage.value) return;
  const prompt = buildManualOcrPrompt(currentImage.value);
  try {
    await copyTextToClipboard(prompt);
    ElMessage.success('提示词已复制');
  } catch {
    showManualPromptFallback(prompt);
  }
}

async function showManualPromptFallback(prompt: string) {
  importJsonText.value = prompt;
  await nextTick();
  const textarea = document.querySelector('.import-dialog textarea') as HTMLTextAreaElement | null;
  textarea?.focus({ preventScroll: true });
  textarea?.select();
  ElMessage.warning('已将提示词放入输入框并全选，请手动复制');
}

async function importRegions() {
  if (!currentImage.value) return;
  const parsed = parseImportedRegions(importJsonText.value);
  if (!parsed) {
    ElMessage.error('没有找到有效的 regions JSON');
    return;
  }
  if (regions.value.length > 0) {
    try {
      await ElMessageBox.confirm('导入会覆盖当前图片的全部文字标注，确定继续吗？', '导入 JSON', {
        confirmButtonText: '导入',
        cancelButtonText: '取消',
        type: 'warning'
      });
    } catch {
      return;
    }
  }

  importingRegions.value = true;
  try {
    const response = await fetch(`/api/images/${currentImage.value.id}/import-regions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regions: parsed.regions })
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, '导入失败'));
    }
    const data = await response.json();
    regions.value = data.regions.map(normalizeRegion);
    selectedLocalId.value = null;
    editingLocalId.value = null;
    creating.value = false;
    manualImportMode.value = false;
    modelMode.value = 'manual';
    mode.value = 'edit';
    importDialogVisible.value = false;
    await nextTick();
    updateFrameSize();
    ElMessage.success(`已导入 ${regions.value.length} 个标注，请检查后保存`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败，请检查 JSON 格式');
  } finally {
    importingRegions.value = false;
  }
}

function exportRegionsJson() {
  if (!currentImage.value) return;
  const payload = {
    image: {
      id: currentImage.value.id,
      originalName: currentImage.value.originalName,
      width: currentImage.value.width,
      height: currentImage.value.height
    },
    regions: regions.value.map((region) => ({
      text: region.text.trim(),
      xPercent: roundPercent(region.xPercent),
      yPercent: roundPercent(region.yPercent),
      widthPercent: roundPercent(region.widthPercent),
      heightPercent: roundPercent(region.heightPercent),
      iconXPercent: typeof region.iconXPercent === 'number' ? roundPercent(region.iconXPercent) : null,
      iconYPercent: typeof region.iconYPercent === 'number' ? roundPercent(region.iconYPercent) : null
    }))
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileStem(currentImage.value.originalName)}-regions.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  ElMessage.success(`已导出 ${payload.regions.length} 个标注`);
}

function handleStageClick(event: MouseEvent) {
  if (!currentImage.value || !creating.value || mode.value !== 'edit' || !imageFrameRef.value) return;
  const rect = imageFrameRef.value.getBoundingClientRect();
  const xPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 95);
  const yPercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 95);
  const region: TextRegion = {
    localId: createLocalId(),
    text: '',
    xPercent,
    yPercent,
    widthPercent: 18,
    heightPercent: 8
  };
  regions.value.push(region);
  selectedLocalId.value = region.localId;
  editingLocalId.value = region.localId;
  creating.value = false;
}

function handleRegionClick(region: TextRegion) {
  if (suppressNextRegionClick.value) {
    suppressNextRegionClick.value = false;
    return;
  }
  selectedLocalId.value = region.localId;
  if (region.id && mode.value === 'read') {
    playRegion(region);
    return;
  }
  if (mode.value === 'edit') expandRegion(region);
}

function collapseRegion(region: TextRegion) {
  if (!region.text.trim()) {
    ElMessage.warning('请输入文字后再保存');
    return;
  }
  region.text = region.text.trim();
  region.iconXPercent = iconXPercentFromBox(region);
  region.iconYPercent = iconYPercentFromBox(region);
  region.localIconReady = true;
  selectedLocalId.value = region.localId;
  editingLocalId.value = null;
}

function expandRegion(region: TextRegion) {
  if (isIconRegion(region)) {
    const iconWidthPercent = iconPixelWidthPercent();
    const iconHeightPercent = iconPixelHeightPercent();
    const compactSize = compactEditorSize(region.text);
    region.widthPercent = compactSize.widthPercent;
    region.heightPercent = compactSize.heightPercent;
    const nextX = iconXPercent(region) + iconWidthPercent / 2 - compactSize.widthPercent / 2;
    const nextY = iconYPercent(region) + iconHeightPercent / 2 - compactSize.heightPercent / 2;
    region.xPercent = clamp(nextX, 0, Math.max(0, 100 - region.widthPercent));
    region.yPercent = clamp(nextY, 0, Math.max(0, 100 - region.heightPercent));
  }
  region.localIconReady = false;
  editingLocalId.value = region.localId;
}

function compactEditorSize(text: string) {
  const compactLength = Array.from(text.replace(/\s+/g, '')).length;
  const widthPx = clamp(48 + compactLength * 15, 120, 320);
  const heightPx = compactLength > 20 ? 84 : 54;
  return {
    widthPercent: clamp((widthPx / frameSize.value.width) * 100, 12, 42),
    heightPercent: clamp((heightPx / frameSize.value.height) * 100, 6, 18)
  };
}

async function saveRegions() {
  if (!currentImage.value) return;
  saving.value = true;
  try {
    const saved: TextRegion[] = [];
    for (const region of regions.value) {
      const payload = {
        text: region.text.trim(),
        xPercent: region.xPercent,
        yPercent: region.yPercent,
        widthPercent: region.widthPercent,
        heightPercent: region.heightPercent,
        iconXPercent: region.iconXPercent ?? null,
        iconYPercent: region.iconYPercent ?? null
      };
      const url = region.id
        ? `/api/text-regions/${region.id}`
        : `/api/images/${currentImage.value.id}/text-regions`;
      const method = region.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('save failed');
      const data = await response.json();
      saved.push(normalizeRegion({ ...data.region, confirmed: true }));
    }
    regions.value = saved;

    // 如果在书本模式，更新 bookPages 中的当前页数据
    if (currentBook.value && bookPages.value[currentPageIndex.value]) {
      bookPages.value[currentPageIndex.value].regions = saved;
    }

    await createSaveRecord();
    await loadSaveRecords();
    selectedLocalId.value = null;
    editingLocalId.value = null;
    mode.value = 'read';
    ElMessage.success('已保存');
  } catch {
    ElMessage.error('保存失败，请检查文字内容和坐标');
  } finally {
    saving.value = false;
  }
}

async function createSaveRecord() {
  if (!currentImage.value) return;
  const response = await fetch(`/api/images/${currentImage.value.id}/save-records`, { method: 'POST' });
  if (!response.ok) throw new Error('save record failed');
}

async function deleteSelected() {
  const region = selectedRegion.value;
  if (!region) return;
  await deleteRegion(region);
}

async function deleteRegion(region: TextRegion) {
  if (region.id) {
    const response = await fetch(`/api/text-regions/${region.id}`, { method: 'DELETE' });
    if (!response.ok) {
      ElMessage.error('删除失败');
      return;
    }
  }
  regions.value = regions.value.filter((item) => item.localId !== region.localId);
  selectedLocalId.value = null;
  editingLocalId.value = null;

  // 如果在书本模式，更新 bookPages 中的当前页数据
  if (currentBook.value && bookPages.value[currentPageIndex.value]) {
    bookPages.value[currentPageIndex.value].regions = [...regions.value];
  }
}

function playRegion(region: TextRegion) {
  if (!region.id && !region.text.trim()) {
    ElMessage.warning('请先保存该文字区域');
    return;
  }
  const player = audioRef.value;
  if (!player) {
    ElMessage.error('播放器还没有准备好，请再点一次');
    return;
  }

  const token = playbackToken.value + 1;
  playbackToken.value = token;
  player.onended = null;
  player.onerror = null;
  player.onabort = null;
  playingLocalId.value = region.localId;
  player.pause();
  player.currentTime = 0;
  player.src = ttsUrl(region.text);
  player.onended = () => clearPlayingSelection(region.localId, token);
  player.onerror = () => clearPlayingSelection(region.localId, token);
  player.play().catch((error: unknown) => {
    clearPlayingSelection(region.localId, token);
    const message = error instanceof Error ? error.name || error.message : '未知错误';
    ElMessage.error(`播放失败：${message}。请确认 iPad 未静音，并检查该音频地址能否访问。`);
  });
}

function clearPlayingSelection(localId: string, token: number) {
  if (playbackToken.value === token && playingLocalId.value === localId) {
    playingLocalId.value = null;
  }
  if (playbackToken.value === token && selectedLocalId.value === localId && mode.value === 'read') {
    selectedLocalId.value = null;
  }
}

function ttsUrl(text: string) {
  const url = new URL('/api/tts', window.location.origin);
  url.searchParams.set('t', text);
  return url.toString();
}

function startDrag(event: PointerEvent, region: TextRegion, requestedMode: 'box' | 'resize' = 'box') {
  if (mode.value !== 'edit') return;
  const target = event.currentTarget as HTMLElement | null;
  const frame = imageFrameRef.value;
  if (!target || !frame) return;
  target.setPointerCapture?.(event.pointerId);
  const targetRect = target.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const dragMode = isIconRegion(region) ? 'icon' : requestedMode;
  const widthPercent = dragMode === 'resize' ? region.widthPercent : (targetRect.width / frameRect.width) * 100;
  const heightPercent = dragMode === 'resize' ? region.heightPercent : (targetRect.height / frameRect.height) * 100;
  const currentX = dragMode === 'icon' ? iconXPercent(region) : region.xPercent;
  const currentY = dragMode === 'icon' ? iconYPercent(region) : region.yPercent;
  selectedLocalId.value = region.localId;
  dragging.value = {
    region,
    startX: event.clientX,
    startY: event.clientY,
    startRegionX: currentX,
    startRegionY: currentY,
    widthPercent,
    heightPercent,
    mode: dragMode,
    moved: false
  };
}

function isIconRegion(region: TextRegion) {
  return Boolean(region.confirmed || region.localIconReady) && editingLocalId.value !== region.localId;
}

function isEditingRegion(region: TextRegion) {
  return mode.value === 'edit' && (!region.confirmed || editingLocalId.value === region.localId) && !isIconRegion(region);
}

function isPersistedRegion(region: TextRegion) {
  return Boolean(region.id);
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging.value || !imageFrameRef.value) return;
  const rect = imageFrameRef.value.getBoundingClientRect();
  const deltaX = ((event.clientX - dragging.value.startX) / rect.width) * 100;
  const deltaY = ((event.clientY - dragging.value.startY) / rect.height) * 100;
  if (Math.hypot(event.clientX - dragging.value.startX, event.clientY - dragging.value.startY) > 4) {
    dragging.value.moved = true;
  }
  const nextX = clamp(dragging.value.startRegionX + deltaX, 0, Math.max(0, 100 - dragging.value.widthPercent));
  const nextY = clamp(dragging.value.startRegionY + deltaY, 0, Math.max(0, 100 - dragging.value.heightPercent));
  if (dragging.value.mode === 'resize') {
    dragging.value.region.widthPercent = clamp(dragging.value.widthPercent + deltaX, 6, Math.max(6, 100 - dragging.value.region.xPercent));
    dragging.value.region.heightPercent = clamp(dragging.value.heightPercent + deltaY, 4, Math.max(4, 100 - dragging.value.region.yPercent));
  } else if (dragging.value.mode === 'icon') {
    dragging.value.region.iconXPercent = nextX;
    dragging.value.region.iconYPercent = nextY;
  } else {
    dragging.value.region.xPercent = nextX;
    dragging.value.region.yPercent = nextY;
  }
}

function stopDrag() {
  if (dragging.value?.moved) {
    suppressNextRegionClick.value = true;
    setTimeout(() => {
      suppressNextRegionClick.value = false;
    }, 0);
  }
  dragging.value = null;
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

function regionStyle(region: TextRegion): Record<string, string> {
  if (isIconRegion(region)) {
    return {
      left: `${clamp(iconXPercent(region), 0, 100 - iconPixelWidthPercent())}%`,
      top: `${clamp(iconYPercent(region), 0, 100 - iconPixelHeightPercent())}%`
    };
  }
  return {
    left: `${region.xPercent}%`,
    top: `${region.yPercent}%`,
    width: `${region.widthPercent}%`,
    height: `${region.heightPercent}%`
  };
}

function iconXPercent(region: TextRegion) {
  if (typeof region.iconXPercent === 'number') return region.iconXPercent;
  return iconXPercentFromBox(region);
}

function iconYPercent(region: TextRegion) {
  if (typeof region.iconYPercent === 'number') return region.iconYPercent;
  return iconYPercentFromBox(region);
}

function iconXPercentFromBox(region: TextRegion) {
  const iconWidthPercent = iconPixelWidthPercent();
  return clamp(region.xPercent + region.widthPercent / 2 - iconWidthPercent / 2, 0, 100 - iconWidthPercent);
}

function iconYPercentFromBox(region: TextRegion) {
  const iconHeightPercent = iconPixelHeightPercent();
  return clamp(region.yPercent + region.heightPercent / 2 - iconHeightPercent / 2, 0, 100 - iconHeightPercent);
}

function iconPixelWidthPercent() {
  return (speakerIconSize / frameSize.value.width) * 100;
}

function iconPixelHeightPercent() {
  return (speakerIconSize / frameSize.value.height) * 100;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function openCreateBookDialog() {
  newBookName.value = '';
  bookUploadFiles.value = [];
  createBookDialogVisible.value = true;
}

async function createBook() {
  const name = newBookName.value.trim();
  if (!name) {
    ElMessage.warning('请输入书本名称');
    return;
  }

  creatingBook.value = true;

  // 如果有上传图片，显示加载提示
  if (bookUploadFiles.value.length > 0) {
    uploadLoading.value = ElLoading.service({
      lock: true,
      text: `正在创建书本，上传 ${bookUploadFiles.value.length} 张图片...`,
      background: 'rgba(243, 245, 248, 0.82)'
    });
  }

  try {
    // 创建书本
    const bookResponse = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!bookResponse.ok) throw new Error('创建书本失败');
    const bookData = await bookResponse.json();
    const book = bookData.book;

    // 如果有图片，上传所有图片并添加到书本
    if (bookUploadFiles.value.length > 0) {
      for (let i = 0; i < bookUploadFiles.value.length; i++) {
        const file = resolveUploadFile(bookUploadFiles.value[i]);
        if (!file) throw new Error(`第 ${i + 1} 张图片文件读取失败`);
        const dimensions = await readImageDimensions(file);
        const formData = new FormData();
        formData.append('image', file);
        formData.append('width', String(dimensions.width));
        formData.append('height', String(dimensions.height));

        const imageResponse = await fetch('/api/images', { method: 'POST', body: formData });
        if (!imageResponse.ok) throw new Error(`上传第 ${i + 1} 张图片失败`);
        const imageData = await imageResponse.json();

        const pageResponse = await fetch(`/api/books/${book.id}/pages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId: imageData.image.id })
        });
        if (!pageResponse.ok) throw new Error(`添加第 ${i + 1} 页失败`);
      }
      ElMessage.success(`书本「${name}」创建成功，共 ${bookUploadFiles.value.length} 页`);
    } else {
      ElMessage.success(`空书本「${name}」创建成功`);
    }

    createBookDialogVisible.value = false;

    // 重新加载书本列表
    await loadBooks();

    // 重新获取完整书本数据（包含所有页面）
    const fullBookResponse = await fetch(`/api/books/${book.id}`);
    if (fullBookResponse.ok) {
      const fullBookData = await fullBookResponse.json();
      currentBook.value = fullBookData.book;
      bookPages.value = fullBookData.pages;
      currentPageIndex.value = 0;

      if (bookPages.value.length === 0) {
        // 空书本直接进入编辑模式
        currentImage.value = null;
        regions.value = [];
        selectedLocalId.value = null;
        editingLocalId.value = null;
        mode.value = 'edit';
      } else {
        // 有页面直接进入编辑模式，显示第1页
        loadCurrentPage();
        mode.value = 'edit';
      }
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建书本失败');
  } finally {
    creatingBook.value = false;
    uploadLoading.value?.close();
    uploadLoading.value = null;
  }
}

function resolveUploadFile(source: unknown): File | null {
  if (source instanceof File) return source;
  if (!source || typeof source !== 'object') return null;

  const uploadLike = source as { file?: unknown; raw?: unknown };
  if (uploadLike.file instanceof File) return uploadLike.file;
  if (uploadLike.raw instanceof File) return uploadLike.raw;
  return null;
}

async function responseErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  const detail = data?.error || data?.details;
  return detail ? `${fallback}：${detail}` : fallback;
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

function previousPage() {
  if (currentPageIndex.value > 0) {
    if (hasUnsavedChanges()) {
      ElMessageBox.confirm('当前页面有未保存的修改，切换页面后将丢失，确定继续吗？', '提示', {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        currentPageIndex.value--;
        loadCurrentPage();
      }).catch(() => {});
    } else {
      currentPageIndex.value--;
      loadCurrentPage();
    }
  }
}

function nextPage() {
  if (currentPageIndex.value < bookPages.value.length - 1) {
    if (hasUnsavedChanges()) {
      ElMessageBox.confirm('当前页面有未保存的修改，切换页面后将丢失，确定继续吗？', '提示', {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        currentPageIndex.value++;
        loadCurrentPage();
      }).catch(() => {});
    } else {
      currentPageIndex.value++;
      loadCurrentPage();
    }
  }
}

function hasUnsavedChanges() {
  if (!currentImage.value || !currentBook.value) return false;
  const currentPage = bookPages.value[currentPageIndex.value];
  if (!currentPage) return false;

  // 检查区域数量是否变化
  if (regions.value.length !== currentPage.regions.length) return true;

  // 检查是否有新建的区域（没有 id）
  if (regions.value.some(r => !r.id)) return true;

  // 检查现有区域是否被修改
  for (const region of regions.value) {
    const original = currentPage.regions.find(r => r.id === region.id);
    if (!original) return true;

    if (region.text !== original.text ||
        Math.abs(region.xPercent - original.xPercent) > 0.01 ||
        Math.abs(region.yPercent - original.yPercent) > 0.01 ||
        Math.abs(region.widthPercent - original.widthPercent) > 0.01 ||
        Math.abs(region.heightPercent - original.heightPercent) > 0.01) {
      return true;
    }
  }

  return false;
}

function loadCurrentPage() {
  const page = bookPages.value[currentPageIndex.value];
  if (!page) return;

  currentImage.value = page.image;
  regions.value = page.regions.map(normalizeRegion);
  selectedLocalId.value = null;
  editingLocalId.value = null;
  nextTick(() => updateFrameSize());
}
</script>
