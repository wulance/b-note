import type { VideoInfo } from './subtitle';
import type { SummaryMode, SummaryTemplate, TokenUsage } from './summarizer';
import { normalizeKeyFrames, type KeyFrame } from './keyFrames';
import { getStorageLocal } from './extensionApi';

export interface SavedNoteDraft {
  videoInfo: VideoInfo;
  content: string;
  source: 'cc' | 'whisper' | null;
  mode?: SummaryMode;
  template?: SummaryTemplate;
  usage?: TokenUsage | null;
  providerId?: string;
  providerName?: string;
  model?: string;
  keyFrames?: KeyFrame[];
  generatedAt: string;
}

const DRAFT_KEY = 'b-note-latest-draft';
const HISTORY_KEY = 'b-note-history';
const HISTORY_LIMIT = 20;

export async function loadLatestDraft(): Promise<SavedNoteDraft | null> {
  const stored = await getStorageLocal().get(DRAFT_KEY);
  return normalizeDraft(stored[DRAFT_KEY]);
}

export async function saveLatestDraft(draft: SavedNoteDraft): Promise<void> {
  await getStorageLocal().set({ [DRAFT_KEY]: normalizeDraft(draft) });
}

export async function loadNoteHistory(): Promise<SavedNoteDraft[]> {
  const stored = await getStorageLocal().get(HISTORY_KEY);
  const history = stored[HISTORY_KEY] as SavedNoteDraft[] | undefined;
  return Array.isArray(history) ? history.map(normalizeDraft).filter(Boolean) as SavedNoteDraft[] : [];
}

export async function appendNoteHistory(draft: SavedNoteDraft): Promise<SavedNoteDraft[]> {
  const current = await loadNoteHistory();
  const normalizedDraft = normalizeDraft(draft);
  if (!normalizedDraft) return current;
  const next = [
    normalizedDraft,
    ...current.filter((item) => createHistoryKey(item) !== createHistoryKey(normalizedDraft)),
  ].slice(0, HISTORY_LIMIT);
  await getStorageLocal().set({ [HISTORY_KEY]: next });
  return next;
}

function normalizeDraft(value: unknown): SavedNoteDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as SavedNoteDraft;
  if (!draft.videoInfo || typeof draft.content !== 'string' || typeof draft.generatedAt !== 'string') {
    return null;
  }
  return {
    ...draft,
    keyFrames: normalizeKeyFrames(draft.keyFrames),
  };
}

function createHistoryKey(draft: SavedNoteDraft): string {
  return [
    draft.videoInfo.bvid,
    draft.videoInfo.cid,
    draft.mode || 'standard',
    draft.generatedAt,
  ].join(':');
}
