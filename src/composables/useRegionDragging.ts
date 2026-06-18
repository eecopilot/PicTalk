import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { TextRegion } from '../types';
import { clamp } from '../utils/helpers';

type DragState = {
  region: TextRegion;
  startX: number;
  startY: number;
  startRegionX: number;
  startRegionY: number;
  widthPercent: number;
  heightPercent: number;
  mode: 'icon' | 'box' | 'resize';
  moved: boolean;
};

type RegionDraggingDeps = {
  mode: Ref<'edit' | 'read'>;
  imageFrameRef: ComputedRef<HTMLElement | null>;
  selectedLocalId: Ref<string | null>;
  isIconRegion: (region: TextRegion) => boolean;
  iconXPercent: (region: TextRegion) => number;
  iconYPercent: (region: TextRegion) => number;
};

export function useRegionDragging(deps: RegionDraggingDeps) {
  const { mode, imageFrameRef, selectedLocalId, isIconRegion, iconXPercent, iconYPercent } = deps;

  const dragging = ref<DragState | null>(null);
  const suppressNextRegionClick = ref(false);

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

  onMounted(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDrag);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDrag);
  });

  return { startDrag, suppressNextRegionClick };
}
