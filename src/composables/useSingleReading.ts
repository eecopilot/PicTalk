import { ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from '../element-plus';
import type { TextRegion } from '../types';
import { regionAudioUrl } from '../utils/audioUrls';

type SingleReadingDeps = {
  mode: Ref<'edit' | 'read'>;
  selectedLocalId: Ref<string | null>;
};

export function useSingleReading(deps: SingleReadingDeps) {
  const { mode, selectedLocalId } = deps;

  const audioRef = ref<HTMLAudioElement | null>(null);
  const playbackToken = ref(0);
  const playingLocalId = ref<string | null>(null);

  function clearPlayingSelection(localId: string, token: number) {
    if (playbackToken.value === token && playingLocalId.value === localId) {
      playingLocalId.value = null;
    }
    if (playbackToken.value === token && selectedLocalId.value === localId && mode.value === 'read') {
      selectedLocalId.value = null;
    }
  }

  function playRegion(region: TextRegion, googleVariant: 1 | 2 = 1) {
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
    const audioUrl = regionAudioUrl(region, googleVariant);
    if (!audioUrl) {
      clearPlayingSelection(region.localId, token);
      ElMessage.warning('Google 发音需要英文单词');
      return;
    }
    player.src = audioUrl;
    player.onended = () => clearPlayingSelection(region.localId, token);
    player.onerror = () => clearPlayingSelection(region.localId, token);
    player.play().catch((error: unknown) => {
      clearPlayingSelection(region.localId, token);
      const message = error instanceof Error ? error.name || error.message : '未知错误';
      ElMessage.error(`播放失败：${message}。请确认 iPad 未静音，并检查该音频地址能否访问。`);
    });
  }

  return { audioRef, playbackToken, playingLocalId, playRegion };
}
