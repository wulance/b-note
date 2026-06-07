import type { SubtitleEntry, VideoInfo } from './subtitle';
import { getStorageLocal } from './extensionApi';

export interface SubtitleCacheEntry {
  videoInfo: VideoInfo;
  subtitles: SubtitleEntry[];
  text: string;
  source: 'cc' | 'whisper';
  cachedAt: string;
}

const SUBTITLE_CACHE_KEY = 'b-note-subtitle-cache-v1';
const SUBTITLE_CACHE_LIMIT = 40;

export function createSubtitleCacheKey(video: Pick<VideoInfo, 'bvid' | 'cid' | 'page'>): string {
  return [video.bvid, video.cid, video.page || 1].join(':');
}

export async function loadSubtitleFromCache(
  video: Pick<VideoInfo, 'bvid' | 'cid' | 'page'>
): Promise<SubtitleCacheEntry | null> {
  const cache = await loadSubtitleCache();
  return cache[createSubtitleCacheKey(video)] || null;
}

export async function saveSubtitleToCache(entry: SubtitleCacheEntry): Promise<void> {
  const cache = await loadSubtitleCache();
  const key = createSubtitleCacheKey(entry.videoInfo);
  const next = { ...cache, [key]: entry };
  const ordered = Object.entries(next).sort(
    ([, left], [, right]) => new Date(right.cachedAt).getTime() - new Date(left.cachedAt).getTime()
  );
  await getStorageLocal().set({
    [SUBTITLE_CACHE_KEY]: Object.fromEntries(ordered.slice(0, SUBTITLE_CACHE_LIMIT)),
  });
}

async function loadSubtitleCache(): Promise<Record<string, SubtitleCacheEntry>> {
  const stored = await getStorageLocal().get(SUBTITLE_CACHE_KEY);
  const cache = stored[SUBTITLE_CACHE_KEY];
  return cache && typeof cache === 'object' && !Array.isArray(cache)
    ? (cache as Record<string, SubtitleCacheEntry>)
    : {};
}
