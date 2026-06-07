import { useState } from 'react';
import { ensureKeyFrameMarkers, extractKeyFrameTargets } from '@/src/lib/markdown';
import type { KeyFrame } from '@/src/lib/keyFrames';
import type { VideoInfo } from '@/src/lib/subtitle';
import { formatTime } from '@/src/lib/subtitle';
import { sendRuntimeMessage } from '@/src/lib/extensionApi';
import type { CaptureFrameResponse, RuntimeErrorResponse } from '@/src/lib/messages';

interface UseKeyFramesInput {
  videoInfo: VideoInfo | null;
  result: string | null;
  onResultChange: (content: string) => void;
  onPersist: (frames: KeyFrame[], contentOverride?: string) => Promise<void>;
  addLog: (message: string) => void;
  setNotice: (message: string | null) => void;
}

export function useKeyFrames({
  videoInfo,
  result,
  onResultChange,
  onPersist,
  addLog,
  setNotice,
}: UseKeyFramesInput) {
  const [keyFrames, setKeyFrames] = useState<KeyFrame[]>([]);
  const [frameStatus, setFrameStatus] = useState<'idle' | 'capturing'>('idle');

  const requestKeyFrame = async (seconds?: number, title?: string, anchorSeconds = seconds): Promise<KeyFrame | null> => {
    const response = await sendRuntimeMessage<CaptureFrameResponse | RuntimeErrorResponse>({
      type: 'CAPTURE_FRAME',
      seconds,
      bvid: videoInfo?.bvid,
      page: videoInfo?.page,
    });
    if ('error' in response) {
      throw new Error(String(response.error));
    }
    const capturedSeconds = Number(response.seconds || seconds || 0);
    const fallbackHint = response.fallback ? '（可见区域）' : '';
    return {
      title: title || `${formatTime(capturedSeconds)} 当前画面${fallbackHint}`,
      dataUrl: response.dataUrl,
      seconds: capturedSeconds,
      anchorSeconds,
      capturedAt: new Date().toISOString(),
    };
  };

  const captureFrame = async () => {
    setNotice(null);
    addLog('开始抓取当前视频画面');
    setFrameStatus('capturing');
    try {
      const frame = await requestKeyFrame();
      if (!frame) return;
      const nextFrames = [frame, ...keyFrames];
      setKeyFrames(nextFrames);
      await onPersist(nextFrames);
      setNotice(`已抓取关键画面：${frame.title}`);
      addLog(`关键画面已保存：${frame.title}`);
    } catch (e: any) {
      setNotice(`截图失败：${e?.message || '未知错误'}`);
      addLog(`截图失败：${e?.message || '未知错误'}`);
    } finally {
      setFrameStatus('idle');
    }
  };

  const recaptureKeyFrame = async (index: number, seconds: number) => {
    const current = keyFrames[index];
    if (!current) return;
    const targetSeconds = Math.max(0, seconds);
    setNotice(null);
    setFrameStatus('capturing');
    addLog(`重新抓取关键画面：${formatTime(targetSeconds)}`);
    try {
      const frame = await requestKeyFrame(targetSeconds, `${formatTime(targetSeconds)} ${stripFrameTitleTime(current.title)}`, current.anchorSeconds ?? targetSeconds);
      if (!frame) return;
      const nextFrames = keyFrames.map((item, itemIndex) => (itemIndex === index ? frame : item));
      setKeyFrames(nextFrames);
      await onPersist(nextFrames);
      setNotice(`已更新关键画面：${frame.title}`);
      addLog(`关键画面已更新：${frame.title}`);
    } catch (e: any) {
      setNotice(`重抓失败：${e?.message || '未知错误'}`);
      addLog(`关键画面重抓失败：${e?.message || '未知错误'}`);
    } finally {
      setFrameStatus('idle');
    }
  };

  const deleteKeyFrame = async (index: number) => {
    const nextFrames = keyFrames.filter((_, itemIndex) => itemIndex !== index);
    setKeyFrames(nextFrames);
    await onPersist(nextFrames);
    setNotice('已删除关键画面');
  };

  const captureAutoFrames = async () => {
    if (!result) {
      setNotice('请先生成笔记，再自动抓取关键画面');
      return;
    }
    const contentWithMarkers = ensureKeyFrameMarkers(result);
    if (contentWithMarkers !== result) {
      onResultChange(contentWithMarkers);
    }
    const targets = extractKeyFrameTargets(contentWithMarkers);
    if (!targets.length) {
      setNotice('当前笔记里没有可用时间戳，无法自动抓帧');
      return;
    }

    setNotice(null);
    setFrameStatus('capturing');
    addLog(`开始自动抓取关键画面：${targets.length} 张`);
    const captured: KeyFrame[] = [];
    try {
      for (const target of targets) {
        try {
          const frame = await requestKeyFrame(target.seconds, target.title, target.seconds);
          if (frame) captured.push(frame);
        } catch (e: any) {
          addLog(`跳过 ${target.label}：${e?.message || '截图失败'}`);
        }
      }

      if (captured.length) {
        const existing = new Set(keyFrames.map((frame) => Math.round(frame.seconds)));
        const fresh = captured.filter((frame) => !existing.has(Math.round(frame.seconds)));
        const nextFrames = [...fresh, ...keyFrames];
        setKeyFrames(nextFrames);
        await onPersist(nextFrames, contentWithMarkers);
        setNotice(`已自动抓取 ${captured.length} 张关键画面`);
        addLog(`自动关键画面完成：${captured.length} 张`);
      } else {
        setNotice('自动抓帧失败，请确认视频仍在当前 B 站页面');
        addLog('自动关键画面失败：没有成功截图');
      }
    } finally {
      setFrameStatus('idle');
    }
  };

  return {
    keyFrames,
    setKeyFrames,
    frameStatus,
    setFrameStatus,
    requestKeyFrame,
    captureFrame,
    captureAutoFrames,
    recaptureKeyFrame,
    deleteKeyFrame,
  };
}

function stripFrameTitleTime(title: string): string {
  return title
    .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, '')
    .replace(/[（(]可见区域[)）]/g, '')
    .trim() || '关键画面';
}
