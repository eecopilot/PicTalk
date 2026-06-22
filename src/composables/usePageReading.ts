import { ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from '../element-plus';
import type { TextRegion, ReaderImage } from '../types';
import { directTtsUrl, regionAudioUrl, ttsUrl } from '../utils/audioUrls';

type PageReadingDeps = {
  regions: Ref<TextRegion[]>;
  mode: Ref<'edit' | 'read'>;
  currentImage: Ref<ReaderImage | null>;
  audioRef: Ref<HTMLAudioElement | null>;
  playbackToken: Ref<number>;
  playingLocalId: Ref<string | null>;
  selectedLocalId: Ref<string | null>;
};

export function usePageReading(deps: PageReadingDeps) {
  const { regions, mode, currentImage, audioRef, playbackToken, playingLocalId, selectedLocalId } = deps;

  const pageReadingStatus = ref<'idle' | 'playing' | 'paused'>('idle');
  const pageReadingQueue = ref<TextRegion[]>([]);
  const pageReadingIndex = ref(0);
  const suppressAudioAbort = ref(false);
  const ttsPrefetchPromises = new Map<string, Promise<void>>();
  const ttsPrefetchedUrls = new Set<string>();

  function togglePageReading() {
    if (!currentImage.value || mode.value !== 'read') return;
    if (pageReadingStatus.value === 'playing') {
      pausePageReading();
      return;
    }
    if (pageReadingStatus.value === 'paused') {
      resumePageReading();
      return;
    }
    startPageReading();
  }

  function startPageReading() {
    const queue = buildPageReadingQueue();
    if (queue.length === 0) {
      ElMessage.warning('当前页没有可朗读的普通文字');
      return;
    }
    pageReadingQueue.value = queue;
    pageReadingIndex.value = 0;
    pageReadingStatus.value = 'playing';
    playPageReadingCurrent();
    void prefetchPageReadingQueue(queue.slice(1));
  }

  function pausePageReading() {
    const player = audioRef.value;
    if (!player) return;
    pageReadingStatus.value = 'paused';
    player.pause();
  }

  function resumePageReading() {
    if (pageReadingQueue.value.length === 0) {
      startPageReading();
      return;
    }
    const player = audioRef.value;
    if (!player) return;
    pageReadingStatus.value = 'playing';
    player.play().catch(() => {
      pageReadingStatus.value = 'paused';
      ElMessage.error('恢复朗读失败');
    });
  }

  function stopPageReading() {
    pageReadingQueue.value = [];
    pageReadingIndex.value = 0;
    pageReadingStatus.value = 'idle';
    playingLocalId.value = null;
    const player = audioRef.value;
    if (!player) return;
    suppressAudioAbort.value = true;
    player.onended = null;
    player.onerror = null;
    player.onabort = null;
    player.pause();
    player.currentTime = 0;
    setTimeout(() => {
      suppressAudioAbort.value = false;
    }, 0);
  }

  function buildPageReadingQueue() {
    // 按标注的创建顺序朗读（regions 已按 id 升序返回），
    // 不再按坐标重排——文字框的 y 坐标常常无法可靠地还原视觉行序。
    return regions.value.filter((region) => region.audioSource !== 'google' && region.text.trim());
  }

  function prefetchPageReadingQueue(queue: TextRegion[]) {
    queue.forEach((region) => {
      const url = ttsUrl(region.text);
      void preloadTtsAudio(url);
    });
  }

  async function preloadTtsAudio(url: string) {
    if (ttsPrefetchedUrls.has(url)) return;
    const existing = ttsPrefetchPromises.get(url);
    if (existing) {
      await existing;
      return;
    }

    const promise = fetch(url, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`tts preload failed: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then(() => {
        ttsPrefetchedUrls.add(url);
      })
      .catch(() => {
        // 预加载失败不影响正常播放，仍然会回退到原始 TTS 请求。
      })
      .finally(() => {
        ttsPrefetchPromises.delete(url);
      });

    ttsPrefetchPromises.set(url, promise);
    await promise;
  }

  function playPageReadingCurrent() {
    const region = pageReadingQueue.value[pageReadingIndex.value];
    if (!region) {
      stopPageReading();
      return;
    }

    const player = audioRef.value;
    if (!player) {
      ElMessage.error('播放器还没有准备好，请再点一次');
      stopPageReading();
      return;
    }

    const token = playbackToken.value + 1;
    playbackToken.value = token;
    playingLocalId.value = region.localId;
    selectedLocalId.value = region.localId;
    player.onended = () => {
      if (playbackToken.value !== token || pageReadingStatus.value !== 'playing') return;
      pageReadingIndex.value += 1;
      if (pageReadingIndex.value >= pageReadingQueue.value.length) {
        stopPageReading();
        return;
      }
      playPageReadingCurrent();
    };
    const fallbackAudioUrl = region.audioSource === 'tts' ? directTtsUrl(region.text) : null;
    player.onerror = () => {
      if (playbackToken.value !== token) return;
      if (fallbackAudioUrl && player.src !== fallbackAudioUrl) {
        suppressAudioAbort.value = true;
        player.src = fallbackAudioUrl;
        setTimeout(() => {
          suppressAudioAbort.value = false;
        }, 0);
        player.play().catch((error: unknown) => {
          if (playbackToken.value !== token) return;
          pageReadingStatus.value = 'paused';
          const message = error instanceof Error ? error.name || error.message : '未知错误';
          ElMessage.error(`朗读失败：${message}`);
        });
        return;
      }
      pageReadingStatus.value = 'paused';
      ElMessage.error('朗读中断，请检查音频地址');
    };
    player.onabort = () => {
      if (playbackToken.value !== token || suppressAudioAbort.value) return;
      pageReadingStatus.value = 'paused';
    };
    suppressAudioAbort.value = true;
    player.pause();
    player.currentTime = 0;
    player.src = regionAudioUrl(region, 1) ?? '';
    setTimeout(() => {
      suppressAudioAbort.value = false;
    }, 0);
    player.play().catch((error: unknown) => {
      if (playbackToken.value !== token) return;
      pageReadingStatus.value = 'paused';
      const message = error instanceof Error ? error.name || error.message : '未知错误';
      ElMessage.error(`朗读失败：${message}`);
    });
  }

  return { pageReadingStatus, togglePageReading, stopPageReading };
}
