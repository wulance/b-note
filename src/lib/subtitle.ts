/**
 * Bilibili 字幕提取器
 * 参考 bilibili-copilot 的成熟方案
 */

export interface SubtitleEntry {
  from: number;
  to: number;
  content: string;
}

export interface VideoInfo {
  aid: number;
  title: string;
  bvid: string;
  cid: number;
  duration: number;
  page: number;
  pages?: VideoPageInfo[];
}

export interface VideoPageInfo {
  cid: number;
  page: number;
  duration?: number;
  part?: string;
}

interface BilibiliPage extends VideoPageInfo {}

export function extractBvidFromUrl(url: string): string | null {
  return /\/video\/(BV[a-zA-Z0-9]+)/.exec(url)?.[1] || null;
}

export function extractPageFromUrl(url: string): number {
  try {
    const page = new URL(url).searchParams.get('p');
    const parsed = page ? Number(page) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch {
    return 1;
  }
}

/**
 * 从页面 __INITIAL_STATE__ 提取（含分P对应的 cid）
 */
export function extractVideoInfo(): VideoInfo | null {
  try {
    const s = (window as any).__INITIAL_STATE__;
    if (!s?.videoData) return null;
    const vd = s.videoData;
    const page = extractPageFromUrl(window.location.href);
    const pages = Array.isArray(vd.pages) ? (vd.pages as BilibiliPage[]) : [];
    const pageInfo = pages.find((item) => item.page === page);
    return {
      aid: vd.aid,
      title: vd.title,
      bvid: vd.bvid,
      cid: pageInfo?.cid ?? vd.cid,
      duration: pageInfo?.duration ?? vd.duration,
      page,
      pages: normalizePages(pages),
    };
  } catch {
    return null;
  }
}

/**
 * 通过 B站 API 获取视频信息（含当前分P的 cid）
 */
export async function fetchVideoInfo(bvid: string, page = 1): Promise<VideoInfo> {
  const resp = await fetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    { credentials: 'include' }
  );
  const json = await resp.json();
  if (json.code !== 0 || !json.data) throw new Error('无法获取视频信息');
  const d = json.data;
  const pages = Array.isArray(d.pages) ? (d.pages as BilibiliPage[]) : [];
  const pageInfo = pages.find((item) => item.page === page);
  return {
    aid: d.aid,
    bvid: d.bvid,
    cid: pageInfo?.cid ?? d.cid,
    title: pageInfo?.part ? `${d.title} - P${page} ${pageInfo.part}` : d.title,
    duration: pageInfo?.duration ?? d.duration,
    page,
    pages: normalizePages(pages),
  };
}

function normalizePages(pages: BilibiliPage[]): VideoPageInfo[] | undefined {
  if (pages.length <= 1) return undefined;
  return pages
    .map((item) => ({
      cid: item.cid,
      page: item.page,
      duration: item.duration,
      part: item.part,
    }))
    .filter((item) => Number.isFinite(item.cid) && Number.isFinite(item.page));
}

/**
 * 获取字幕列表（使用 wbi 接口，带 credentials）
 */
export async function fetchSubtitleList(
  aid: number,
  cid: number
): Promise<SubtitleEntry[] | null> {
  try {
    const url = `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`;
    const resp = await fetch(url, { credentials: 'include' });
    const data = await resp.json();

    if (data.code !== 0 || !data.data?.subtitle?.subtitles?.length) {
      return null;
    }

    const subtitles: any[] = data.data.subtitle.subtitles;

    // 优先选中文，其次 AI 中文
    const selected =
      subtitles.find((s: any) => s.lan === 'zh-CN') ||
      subtitles.find((s: any) => s.lan?.startsWith('zh')) ||
      subtitles.find((s: any) => s.lan?.startsWith('ai-zh')) ||
      subtitles[0];

    if (!selected?.subtitle_url) return null;

    const subUrl = selected.subtitle_url.startsWith('http')
      ? selected.subtitle_url
      : `https:${selected.subtitle_url}`;

    const subResp = await fetch(subUrl);
    const subData = await subResp.json();

    return subData.body || [];
  } catch (e) {
    console.error('[b-note] 字幕获取失败:', e);
    return null;
  }
}

export function subtitlesToText(entries: SubtitleEntry[]): string {
  return entries
    .map((s) => `[${formatTime(s.from)} - ${formatTime(s.to)}] ${s.content}`)
    .join('\n');
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
