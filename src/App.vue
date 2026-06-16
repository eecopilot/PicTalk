<template>
  <main class="app-shell">
    <header class="top-bar">
      <div>
        <h1>
          <img class="brand-logo" src="/logo.svg?v=2" alt="图片点读机" />
        </h1>
        <el-carousel
          class="tips-carousel"
          height="24px"
          direction="vertical"
          indicator-position="none"
          :interval="3600"
          arrow="never"
        >
          <el-carousel-item v-for="tip in tips" :key="tip">
            <p>{{ tip }}</p>
          </el-carousel-item>
        </el-carousel>
      </div>
      <div class="top-actions">
        <el-upload
          :show-file-list="false"
          :http-request="uploadImage"
          accept="image/*"
          class="upload-control"
        >
          <el-button type="primary" :loading="uploading">上传图片</el-button>
        </el-upload>
        <el-tooltip content="历史记录" placement="bottom">
          <el-button class="history-button" :icon="Expand" @click="openHistory" />
        </el-tooltip>
      </div>
    </header>

    <el-drawer v-model="historyVisible" title="保存历史" direction="rtl" size="320px">
      <div class="history-drawer">
        <div v-if="saveRecords.length === 0" class="history-empty">暂无保存记录</div>
        <div v-else class="history-list">
          <article
            v-for="record in saveRecords"
            :key="record.id"
            class="history-item"
            role="button"
            tabindex="0"
            @click.prevent.stop="loadHistoryRecord(record)"
            @keydown.enter.prevent.stop="loadHistoryRecord(record)"
          >
            <div class="history-item-content">
              <strong>{{ record.imageName }}</strong>
              <span>{{ record.regionCount }} 个点读标注</span>
              <time>{{ formatDate(record.createdAt) }}</time>
            </div>
            <el-button
              class="history-delete"
              :icon="Delete"
              circle
              size="small"
              title="删除历史"
              @click.prevent.stop="deleteSaveRecord(record)"
            />
          </article>
        </div>
        <div v-if="saveRecords.length > 0" class="history-footer">
          <el-button class="clear-history-button" type="danger" plain @click="clearSaveRecords">
            清空历史
          </el-button>
        </div>
      </div>
    </el-drawer>

    <section class="stage" @click="handleStageClick">
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
          @load="updateFrameSize"
        />

        <div
          v-for="region in regions"
          :key="region.localId"
          role="button"
          tabindex="0"
          class="region-marker"
          :class="{
            selected: region.localId === selectedLocalId,
            reading: mode === 'read',
            editable: mode === 'edit',
            icon: isIconRegion(region),
            persisted: isPersistedRegion(region),
            editing: isEditingRegion(region)
          }"
          :style="regionStyle(region)"
          @click.stop="handleRegionClick(region)"
          @pointerdown.stop="startDrag($event, region)"
        >
          <el-input
            v-if="isEditingRegion(region)"
            v-model="region.text"
            class="region-input"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            placeholder="输入文字"
            @click.stop
            @pointerdown.stop
            @focusin="selectedLocalId = region.localId"
          />
          <button
            v-if="isEditingRegion(region)"
            class="inline-save"
            title="收起为喇叭"
            @click.stop="collapseRegion(region)"
            @pointerdown.stop
          >
            <el-icon><Check /></el-icon>
          </button>
          <button
            v-if="isEditingRegion(region)"
            class="inline-delete"
            title="删除该标注"
            @click.stop="deleteRegion(region)"
            @pointerdown.stop
          >
            <el-icon><Delete /></el-icon>
          </button>
          <span v-else class="speaker-hotspot" :title="region.text || '点击播放'">
            <el-icon><Microphone /></el-icon>
          </span>
        </div>
      </div>
    </section>

    <footer class="bottom-toolbar">
      <el-segmented v-model="mode" :options="modeOptions" />
      <el-button :type="creating ? 'primary' : 'default'" :disabled="!currentImage || mode !== 'edit'" @click="creating = !creating">
        生成文字
      </el-button>
      <el-button :disabled="!selectedRegion || mode !== 'edit'" @click="deleteSelected">删除</el-button>
      <el-button :disabled="!currentImage" @click="reloadImage">重置视图</el-button>
      <el-button :disabled="!currentImage || mode !== 'edit'" :loading="ocrRefreshing" @click="refreshOcr">
        重新识别
      </el-button>
      <el-button type="success" :disabled="!currentImage || mode !== 'edit'" :loading="saving" @click="saveRegions">
        保存全部
      </el-button>
    </footer>

    <audio ref="audioRef" class="reader-audio" preload="none" playsinline />
  </main>
</template>

<script setup lang="ts">
import { Check, Delete, Expand, Microphone } from '@element-plus/icons-vue';
import { ElLoading, ElMessage, ElMessageBox } from 'element-plus';
import type { LoadingInstance } from 'element-plus/es/components/loading/src/loading';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

type ReaderImage = {
  id: number;
  url: string;
  originalName: string;
  width: number;
  height: number;
};

type TextRegion = {
  id?: number;
  localId: string;
  text: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  iconXPercent?: number | null;
  iconYPercent?: number | null;
  confirmed?: boolean;
  localIconReady?: boolean;
};

type SaveRecord = {
  id: number;
  imageId: number;
  imageName: string;
  regionCount: number;
  createdAt: string;
};

const mode = ref<'edit' | 'read'>('edit');
const modeOptions = [
  { label: '编辑', value: 'edit' },
  { label: '阅读', value: 'read' }
];
const currentImage = ref<ReaderImage | null>(null);
const regions = ref<TextRegion[]>([]);
const saveRecords = ref<SaveRecord[]>([]);
const selectedLocalId = ref<string | null>(null);
const historyVisible = ref(false);
const creating = ref(false);
const saving = ref(false);
const ocrRefreshing = ref(false);
const uploading = ref(false);
const imageFrameRef = ref<HTMLDivElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const audioRef = ref<HTMLAudioElement | null>(null);
const frameSize = ref({ width: 640, height: 420 });
const editingLocalId = ref<string | null>(null);
const uploadLoading = ref<LoadingInstance | null>(null);
const dragging = ref<{
  region: TextRegion;
  startX: number;
  startY: number;
  startRegionX: number;
  startRegionY: number;
  widthPercent: number;
  heightPercent: number;
  mode: 'icon' | 'box';
  moved: boolean;
} | null>(null);
const suppressNextRegionClick = ref(false);

const selectedRegion = computed(() => regions.value.find((item) => item.localId === selectedLocalId.value));
const tips = computed(() => {
  if (!currentImage.value) {
    return ['上传图片后自动识别文字。', '点击右上角历史按钮可打开保存记录。'];
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
  loadSaveRecords();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateFrameSize);
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', stopDrag);
});

async function uploadImage(options: { file: File }) {
  uploading.value = true;
  uploadLoading.value = ElLoading.service({
    lock: true,
    text: '正在上传图片并识别文字...',
    background: 'rgba(243, 245, 248, 0.82)'
  });
  try {
    const body = new FormData();
    const dimensions = await readImageDimensions(options.file);
    body.append('image', options.file);
    body.append('width', String(dimensions.width));
    body.append('height', String(dimensions.height));
    const response = await fetch('/api/images', { method: 'POST', body });
    if (!response.ok) {
      ElMessage.error('上传失败');
      return;
    }
    const data = await response.json();
    currentImage.value = data.image;
    regions.value = data.regions.map(normalizeRegion);
    selectedLocalId.value = null;
    editingLocalId.value = null;
    mode.value = 'edit';
    if (data.cached) {
      ElMessage.success('已从缓存加载这张图片和标注。');
    } else if (data.ocrEnabled && regions.value.length === 0) {
      ElMessage.warning('已上传图片，但暂未识别到文字');
    } else if (data.ocrEnabled && regions.value.length > 0) {
      ElMessage.success('识别完成，请检查喇叭位置，确认无误后点击“保存全部”。');
    }
    await nextTick();
    updateFrameSize();
  } catch {
    ElMessage.error('上传或识别失败');
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
  await nextTick();
  updateFrameSize();
}

async function loadSaveRecords() {
  const response = await fetch('/api/save-records');
  if (!response.ok) return;
  const data = await response.json();
  saveRecords.value = data.records;
}

async function openHistory() {
  await loadSaveRecords();
  historyVisible.value = true;
}

async function loadHistoryRecord(record: SaveRecord) {
  const response = await fetch(`/api/images/${record.imageId}`);
  if (!response.ok) {
    ElMessage.error('加载历史记录失败');
    return;
  }
  const data = await response.json();
  currentImage.value = data.image;
  regions.value = data.regions.map(normalizeRegion);
  selectedLocalId.value = null;
  editingLocalId.value = null;
  creating.value = false;
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
  saveRecords.value = [];
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
      throw new Error(data?.error ?? 'ocr failed');
    }
    const data = await response.json();
    regions.value = data.regions.map(normalizeRegion);
    selectedLocalId.value = null;
    editingLocalId.value = null;
    creating.value = false;
    await nextTick();
    updateFrameSize();
    if (regions.value.length === 0) {
      ElMessage.warning('重新识别完成，但暂未识别到文字');
    } else {
      ElMessage.success('已重新识别，请检查喇叭位置。');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message === 'ocr returned no regions' ? '重新识别失败，已保留现有标注' : '重新识别失败');
  } finally {
    ocrRefreshing.value = false;
  }
}

function handleStageClick(event: MouseEvent) {
  if (!currentImage.value || !creating.value || mode.value !== 'edit' || !imageFrameRef.value) return;
  const rect = imageFrameRef.value.getBoundingClientRect();
  const xPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 95);
  const yPercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 95);
  const region: TextRegion = {
    localId: crypto.randomUUID(),
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
    const nextX = iconXPercent(region) + iconWidthPercent / 2 - region.widthPercent / 2;
    const nextY = iconYPercent(region) + iconHeightPercent / 2 - region.heightPercent / 2;
    region.xPercent = clamp(nextX, 0, Math.max(0, 100 - region.widthPercent));
    region.yPercent = clamp(nextY, 0, Math.max(0, 100 - region.heightPercent));
  }
  region.localIconReady = false;
  editingLocalId.value = region.localId;
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

  player.pause();
  player.currentTime = 0;
  player.src = ttsUrl(region.text);
  player.onended = () => clearPlayingSelection(region.localId);
  player.onerror = () => clearPlayingSelection(region.localId);
  player.onabort = () => clearPlayingSelection(region.localId);
  player.play().catch((error: unknown) => {
    clearPlayingSelection(region.localId);
    const message = error instanceof Error ? error.name || error.message : '未知错误';
    ElMessage.error(`播放失败：${message}。请确认 iPad 未静音，并检查该音频地址能否访问。`);
  });
}

function clearPlayingSelection(localId: string) {
  if (selectedLocalId.value === localId && mode.value === 'read') {
    selectedLocalId.value = null;
  }
}

function ttsUrl(text: string) {
  const url = new URL('/api/tts', window.location.origin);
  url.searchParams.set('t', text);
  return url.toString();
}

function startDrag(event: PointerEvent, region: TextRegion) {
  if (mode.value !== 'edit') return;
  const target = event.currentTarget as HTMLElement | null;
  const frame = imageFrameRef.value;
  if (!target || !frame) return;
  target.setPointerCapture?.(event.pointerId);
  const targetRect = target.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const dragMode = isIconRegion(region) ? 'icon' : 'box';
  const widthPercent = (targetRect.width / frameRect.width) * 100;
  const heightPercent = (targetRect.height / frameRect.height) * 100;
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
  if (dragging.value.mode === 'icon') {
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
  const maxWidth = Math.min(window.innerWidth - 32, 1080);
  const maxHeight = Math.max(260, window.innerHeight - 176);
  const imageRatio = currentImage.value.width / currentImage.value.height;
  let width = maxWidth;
  let height = width / imageRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * imageRatio;
  }
  frameSize.value = { width, height };
}

function regionStyle(region: TextRegion) {
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

function normalizeRegion(region: any): TextRegion {
  const confirmed = Boolean(region.confirmed);
  return {
    id: region.id,
    localId: String(region.id ?? crypto.randomUUID()),
    text: region.text ?? '',
    xPercent: Number(region.xPercent),
    yPercent: Number(region.yPercent),
    widthPercent: Number(region.widthPercent ?? 18),
    heightPercent: Number(region.heightPercent ?? 8),
    iconXPercent: region.iconXPercent ?? null,
    iconYPercent: region.iconYPercent ?? null,
    confirmed,
    localIconReady: !region.id && Boolean(region.text)
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
  const aboveY = region.yPercent - iconHeightPercent - 1;
  const belowY = region.yPercent + region.heightPercent + 1;
  return clamp(aboveY >= 0 ? aboveY : belowY, 0, 100 - iconHeightPercent);
}

function iconPixelWidthPercent() {
  return (38 / frameSize.value.width) * 100;
}

function iconPixelHeightPercent() {
  return (38 / frameSize.value.height) * 100;
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>
