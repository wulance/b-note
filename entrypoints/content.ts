import { extractVideoInfo } from '@/src/lib/subtitle';
import type { ContentMessage, RuntimeMessage } from '@/src/lib/messages';

let frameCaptureQueue = Promise.resolve();

export default defineContentScript({
  matches: ['*://*.bilibili.com/video/*'],
  async main() {
    console.log('[b-note] Content script loaded');

    // 页面加载后自动检测视频信息，发给 background 缓存
    detectAndReport();

    // B站是 SPA，URL 变化时重新检测
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        detectAndReport();
      }
    }, 2000);

    browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
      const contentMessage = message as ContentMessage;
      if (contentMessage.type === 'CAPTURE_VIDEO_FRAME') {
        captureVideoFrame(Number.isFinite(contentMessage.seconds) ? Number(contentMessage.seconds) : undefined)
          .then(sendResponse)
          .catch((error: any) => sendResponse({ error: error?.message || '截图失败' }));
        return true;
      }
      if (contentMessage.type === 'PREPARE_VISIBLE_FRAME') {
        prepareVisibleFrame(Number.isFinite(contentMessage.seconds) ? Number(contentMessage.seconds) : undefined)
          .then(sendResponse)
          .catch((error: any) => sendResponse({ error: error?.message || '可见区域截图准备失败' }));
        return true;
      }
      if (contentMessage.type !== 'SEEK_TO_TIME') return;
      try {
        seekToTime(Number(contentMessage.seconds));
        sendResponse({ ok: true });
      } catch (error: any) {
        sendResponse({ error: error?.message || '跳转失败' });
      }
    });
  },
});

async function detectAndReport() {
  const video = extractVideoInfo();
  if (video) {
    const message: RuntimeMessage = {
      type: 'VIDEO_DETECTED',
      video: {
        aid: video.aid,
        bvid: video.bvid,
        cid: video.cid,
        title: video.title,
        duration: video.duration,
        page: video.page,
        pages: video.pages,
      },
    };
    browser.runtime.sendMessage(message);
    console.log('[b-note] Video detected:', video.title, 'cid:', video.cid, 'aid:', video.aid);
  }
}

async function prepareVisibleFrame(seconds?: number) {
  const player = findBestVideoPlayer();
  if (!player) {
    throw new Error('没有找到当前页面的视频播放器');
  }
  if (seconds != null) {
    player.pause();
    await seekAndWait(player, seconds);
  }
  await waitForVideoReady(player);
  await waitForDrawableFrame(player, seconds ?? player.currentTime);
  player.scrollIntoView({ block: 'center', inline: 'center' });
  await waitForAnimationFrames(2);
  const rect = player.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) {
    throw new Error('视频区域不可见，请切回播放器附近再截图');
  }
  return {
    ok: true,
    seconds: player.currentTime,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

async function captureVideoFrame(seconds?: number) {
  const request = frameCaptureQueue.then(
    () => captureVideoFrameNow(seconds),
    () => captureVideoFrameNow(seconds),
  );
  frameCaptureQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function captureVideoFrameNow(seconds?: number) {
  const player = findBestVideoPlayer();
  if (!player) {
    throw new Error('没有找到当前页面的视频播放器');
  }
  const originalTime = player.currentTime;
  const wasPaused = player.paused;

  try {
    if (seconds != null) {
      if (!wasPaused) player.pause();
      await seekAndWait(player, seconds);
    }
    await waitForVideoReady(player);
    await waitForDrawableFrame(player, seconds ?? player.currentTime);
    if (!player.videoWidth || !player.videoHeight) {
      throw new Error('视频画面尚未就绪，请播放几秒后重试');
    }
    const canvas = document.createElement('canvas');
    const maxWidth = 960;
    const ratio = Math.min(1, maxWidth / player.videoWidth);
    canvas.width = Math.round(player.videoWidth * ratio);
    canvas.height = Math.round(player.videoHeight * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持截图画布');
    context.drawImage(player, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return {
      ok: true,
      dataUrl,
      seconds: player.currentTime,
      width: canvas.width,
      height: canvas.height,
    };
  } catch (error: any) {
    throw new Error(error?.name === 'SecurityError' ? '视频源限制了原始帧截图，正在尝试可见区域截图' : error?.message || '截图失败');
  } finally {
    if (seconds != null) {
      await seekAndWait(player, originalTime).catch(() => {
        player.currentTime = originalTime;
      });
      if (!wasPaused) {
        void player.play().catch(() => undefined);
      }
    }
  }
}

function findBestVideoPlayer() {
  const players = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
  if (!players.length) return null;
  return players
    .map((player) => {
      const rect = player.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      const readyScore = player.videoWidth && player.videoHeight ? 10_000_000 : player.readyState * 1_000_000;
      return { player, score: readyScore + area };
    })
    .sort((a, b) => b.score - a.score)[0]?.player || null;
}

function waitForVideoReady(player: HTMLVideoElement): Promise<void> {
  if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && player.videoWidth && player.videoHeight) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      player.removeEventListener('loadeddata', onReady);
      player.removeEventListener('canplay', onReady);
      window.clearTimeout(timer);
    };
    const onReady = () => {
      cleanup();
      requestAnimationFrame(() => resolve());
    };
    const timer = window.setTimeout(() => {
      cleanup();
      if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
      } else {
        reject(new Error('视频画面尚未就绪，请播放几秒后重试'));
      }
    }, 3000);

    player.addEventListener('loadeddata', onReady, { once: true });
    player.addEventListener('canplay', onReady, { once: true });
  });
}

function getActivePlayer() {
  const player = findBestVideoPlayer();
  if (!player) {
    throw new Error('没有找到当前页面的视频播放器');
  }
  return player;
}

function seekAndWait(player: HTMLVideoElement, seconds: number): Promise<void> {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('时间戳无效');
  }
  const target = Math.min(seconds, Number.isFinite(player.duration) ? Math.max(0, player.duration - 0.1) : seconds);
  if (Math.abs(player.currentTime - target) < 0.25) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      player.removeEventListener('seeked', onSeeked);
      player.removeEventListener('loadeddata', onSeeked);
      window.clearTimeout(timer);
    };
    const onSeeked = () => {
      cleanup();
      requestAnimationFrame(() => resolve());
    };
    const timer = window.setTimeout(() => {
      cleanup();
      if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
      } else {
        reject(new Error('视频跳转超时，请稍后重试'));
      }
    }, 8000);

    player.addEventListener('seeked', onSeeked, { once: true });
    player.addEventListener('loadeddata', onSeeked, { once: true });
    player.pause();
    player.currentTime = target;
  });
}

function waitForDrawableFrame(player: HTMLVideoElement, target: number): Promise<void> {
  const video = player as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };

  if (!video.requestVideoFrameCallback) {
    return waitForAnimationFrames(2);
  }

  return new Promise((resolve) => {
    let settled = false;
    let handle: number | undefined;
    const deadline = Date.now() + 900;
    const timer = window.setTimeout(settle, 900);

    function settle() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (handle !== undefined) {
        video.cancelVideoFrameCallback?.(handle);
      }
      resolve();
    }

    function requestFrame() {
      handle = video.requestVideoFrameCallback?.((_now, metadata) => {
        if (Math.abs(metadata.mediaTime - target) < 0.25 || Date.now() >= deadline) {
          settle();
          return;
        }
        requestFrame();
      });
    }

    requestFrame();
  });
}

function waitForAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

function seekToTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('时间戳无效');
  }
  const player = getActivePlayer();
  player.currentTime = seconds;
  void player.play().catch(() => undefined);
  (player.closest('.bpx-player-container') || player).scrollIntoView({
    block: 'center',
    behavior: 'smooth',
  });
}
