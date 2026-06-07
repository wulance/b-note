export interface KeyFrame {
  title: string;
  dataUrl: string;
  capturedAt: string;
  seconds: number;
  anchorSeconds?: number;
}

export function normalizeKeyFrames(value: unknown): KeyFrame[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((frame) => {
      if (!frame || typeof frame !== 'object') return null;
      const item = frame as Partial<KeyFrame>;
      if (typeof item.title !== 'string' || typeof item.dataUrl !== 'string') return null;
      if (!item.title.trim() || !item.dataUrl.trim()) return null;
      const seconds = Number(item.seconds);
      const anchorSeconds = Number(item.anchorSeconds);
      return {
        title: item.title.trim(),
        dataUrl: item.dataUrl.trim(),
        capturedAt: typeof item.capturedAt === 'string' ? item.capturedAt : new Date().toISOString(),
        seconds: Number.isFinite(seconds) ? seconds : 0,
        anchorSeconds: Number.isFinite(anchorSeconds) ? anchorSeconds : undefined,
      };
    })
    .filter(Boolean) as KeyFrame[];
}
