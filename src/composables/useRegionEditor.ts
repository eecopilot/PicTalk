import { ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { ElMessage } from '../element-plus';
import type { AudioSource, Book, BookPage, ReaderImage, TextRegion } from '../types';
import { clamp, createLocalId, normalizeRegion } from '../utils/helpers';

type RegionEditorDeps = {
  mode: Ref<'edit' | 'read'>;
  regions: Ref<TextRegion[]>;
  selectedLocalId: Ref<string | null>;
  editingLocalId: Ref<string | null>;
  creating: Ref<boolean>;
  creatingAudioSource: Ref<AudioSource>;
  currentImage: Ref<ReaderImage | null>;
  currentBook: Ref<Book | null>;
  bookPages: Ref<BookPage[]>;
  currentPageIndex: Ref<number>;
  imageFrameRef: ComputedRef<HTMLElement | null>;
  isIconRegion: (region: TextRegion) => boolean;
  iconXPercent: (region: TextRegion) => number;
  iconYPercent: (region: TextRegion) => number;
  iconXPercentFromBox: (region: TextRegion) => number;
  iconYPercentFromBox: (region: TextRegion) => number;
  iconPixelWidthPercent: () => number;
  iconPixelHeightPercent: () => number;
  compactEditorSize: (text: string) => { widthPercent: number; heightPercent: number };
  loadSaveRecords: () => Promise<void>;
};

export function useRegionEditor(deps: RegionEditorDeps) {
  const {
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
  } = deps;

  const saving = ref(false);

  function handleStageClick(event: MouseEvent) {
    if (!currentImage.value || !creating.value || mode.value !== 'edit' || !imageFrameRef.value) return;
    const rect = imageFrameRef.value.getBoundingClientRect();
    const xPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 95);
    const yPercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 95);
    const region: TextRegion = {
      localId: createLocalId(),
      text: '',
      audioSource: creatingAudioSource.value,
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

  async function saveRegions() {
    if (!currentImage.value) return;
    saving.value = true;
    try {
      const saved: TextRegion[] = [];
      for (const region of regions.value) {
        const payload = {
          text: region.text.trim(),
          audioSource: region.audioSource,
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

  return {
    saving,
    handleStageClick,
    collapseRegion,
    expandRegion,
    saveRegions,
    deleteRegion
  };
}
