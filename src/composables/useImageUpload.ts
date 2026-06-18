import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { ElLoading, ElMessage, ElMessageBox } from '../element-plus';
import type { Book, BookPage, ReaderImage, SaveRecord, TextRegion } from '../types';
import {
  buildManualOcrPrompt,
  copyTextToClipboard,
  formatOcrError,
  normalizeRegion,
  parseImportedRegions,
  readImageDimensions,
  resolveUploadFile,
  responseErrorMessage,
  roundPercent,
  safeFileStem
} from '../utils/helpers';

type ImageUploadDeps = {
  mode: Ref<'edit' | 'read'>;
  currentImage: Ref<ReaderImage | null>;
  regions: Ref<TextRegion[]>;
  selectedLocalId: Ref<string | null>;
  editingLocalId: Ref<string | null>;
  creating: Ref<boolean>;
  creatingAudioSource: Ref<'tts' | 'google'>;
  currentBook: Ref<Book | null>;
  bookPages: Ref<BookPage[]>;
  currentPageIndex: Ref<number>;
  historyVisible: Ref<boolean>;
  stopPageReading: () => void;
  updateFrameSize: () => void;
  loadCurrentPage: () => void;
};

export function useImageUpload(deps: ImageUploadDeps) {
  const {
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
  } = deps;

  const modelMode = ref<'ai' | 'manual'>('manual');
  const manualImportMode = ref(false);
  const uploading = ref(false);
  const ocrRefreshing = ref(false);
  const importingRegions = ref(false);
  const importDialogVisible = ref(false);
  const importJsonText = ref('');

  async function uploadImage(options: unknown) {
    stopPageReading();
    const file = resolveUploadFile(options);
    if (!file) {
      ElMessage.error('上传失败：没有读取到图片文件');
      return;
    }

    uploading.value = true;
    const loading = ElLoading.service({
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
        creatingAudioSource.value = 'tts';
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
      loading.close();
    }
  }

  async function reloadImage() {
    if (!currentImage.value) return;
    stopPageReading();
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
    creatingAudioSource.value = 'tts';
    // 保持当前 modelMode，不强制修改
    await nextTick();
    updateFrameSize();
  }

  async function refreshOcr() {
    if (!currentImage.value) return;
    stopPageReading();
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
        audioSource: region.audioSource,
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

  async function loadHistoryRecord(record: SaveRecord) {
    stopPageReading();
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
    creatingAudioSource.value = 'tts';
    // 保持默认的 manual 模式，不强制设置为 ai
    mode.value = 'read';
    historyVisible.value = false;
    await nextTick();
    updateFrameSize();
  }

  return {
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
  };
}
