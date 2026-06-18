import { computed } from 'vue';
import type { Ref } from 'vue';
import type { TextRegion } from '../types';
import { clamp } from '../utils/helpers';

type RegionStylesDeps = {
  regions: Ref<TextRegion[]>;
  editingLocalId: Ref<string | null>;
  frameSize: Ref<{ width: number; height: number }>;
};

const SPEAKER_ICON_SIZE = 32;

export function useRegionStyles(deps: RegionStylesDeps) {
  const { regions, editingLocalId, frameSize } = deps;

  function isIconRegion(region: TextRegion) {
    return Boolean(region.confirmed || region.localIconReady) && editingLocalId.value !== region.localId;
  }

  function iconPixelWidthPercent() {
    return (SPEAKER_ICON_SIZE / frameSize.value.width) * 100;
  }

  function iconPixelHeightPercent() {
    return (SPEAKER_ICON_SIZE / frameSize.value.height) * 100;
  }

  function iconXPercentFromBox(region: TextRegion) {
    const iconWidthPercent = iconPixelWidthPercent();
    return clamp(region.xPercent + region.widthPercent / 2 - iconWidthPercent / 2, 0, 100 - iconWidthPercent);
  }

  function iconYPercentFromBox(region: TextRegion) {
    const iconHeightPercent = iconPixelHeightPercent();
    return clamp(region.yPercent + region.heightPercent / 2 - iconHeightPercent / 2, 0, 100 - iconHeightPercent);
  }

  function iconXPercent(region: TextRegion) {
    if (typeof region.iconXPercent === 'number') return region.iconXPercent;
    return iconXPercentFromBox(region);
  }

  function iconYPercent(region: TextRegion) {
    if (typeof region.iconYPercent === 'number') return region.iconYPercent;
    return iconYPercentFromBox(region);
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

  function compactEditorSize(text: string) {
    const compactLength = Array.from(text.replace(/\s+/g, '')).length;
    const widthPx = clamp(48 + compactLength * 15, 120, 320);
    const heightPx = compactLength > 20 ? 84 : 54;
    return {
      widthPercent: clamp((widthPx / frameSize.value.width) * 100, 12, 42),
      heightPercent: clamp((heightPx / frameSize.value.height) * 100, 6, 18)
    };
  }

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

  return {
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
  };
}
