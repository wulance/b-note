import type { AIConfig, SummaryMode, SummaryTemplate } from './summarizer';
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from './cost';
import { getStorageLocal } from './extensionApi';

export interface ObsidianConfig {
  vault: string;
  folder: string;
  tags: string;
  frontmatter: string;
  fieldMapping: string;
  noteTemplate: string;
  syncMode: 'uri' | 'rest';
  restUrl: string;
  restApiKey: string;
  restOverwrite: boolean;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
}

export interface AppSettings {
  providerId: string;
  aiConfig: AIConfig;
  providerConfigs: Record<string, AIConfig>;
  obsidian: ObsidianConfig;
  telegram: TelegramConfig;
  webhook: WebhookConfig;
  summaryMode: SummaryMode;
  summaryTemplate: SummaryTemplate;
  pricing: PricingConfig;
  autoCaptureKeyFrames: boolean;
}

const SETTINGS_KEY = 'b-note-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  providerId: 'deepseek',
  aiConfig: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    transcriptionModel: 'whisper-1',
    transcriptionBaseUrl: '',
    transcriptionApiKey: '',
    transcriptionWorkerUrl: '',
  },
  providerConfigs: {},
  obsidian: {
    vault: '',
    folder: 'B站视频笔记',
    tags: 'B站视频笔记',
    frontmatter: '',
    fieldMapping: '',
    noteTemplate: '',
    syncMode: 'uri',
    restUrl: 'http://127.0.0.1:27123',
    restApiKey: '',
    restOverwrite: true,
  },
  telegram: {
    botToken: '',
    chatId: '',
  },
  webhook: {
    url: '',
    secret: '',
  },
  summaryMode: 'standard',
  summaryTemplate: 'study',
  pricing: DEFAULT_PRICING,
  autoCaptureKeyFrames: true,
};

export async function loadSettings(): Promise<AppSettings> {
  const stored = await getStorageLocal().get(SETTINGS_KEY);
  if (stored[SETTINGS_KEY]) return normalizeSettings(stored[SETTINGS_KEY]);

  const migrated = loadLegacySettings();
  if (migrated) {
    await saveSettings(migrated);
    return migrated;
  }

  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await getStorageLocal().set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

export function normalizeSettings(value: unknown): AppSettings {
  const settings = value as Partial<AppSettings> | undefined;
  const providerId = settings?.providerId || DEFAULT_SETTINGS.providerId;
  const providerConfigs = normalizeProviderConfigs(settings?.providerConfigs);
  const activeConfig = normalizeAiConfig(settings?.aiConfig);
  if (!providerConfigs[providerId]) {
    providerConfigs[providerId] = activeConfig;
  }
  return {
    providerId,
    aiConfig: providerConfigs[providerId],
    providerConfigs,
    obsidian: {
      ...DEFAULT_SETTINGS.obsidian,
      ...(settings?.obsidian || {}),
      syncMode: isObsidianSyncMode(settings?.obsidian?.syncMode)
        ? settings.obsidian.syncMode
        : DEFAULT_SETTINGS.obsidian.syncMode,
      restOverwrite: typeof settings?.obsidian?.restOverwrite === 'boolean'
        ? settings.obsidian.restOverwrite
        : DEFAULT_SETTINGS.obsidian.restOverwrite,
    },
    telegram: {
      ...DEFAULT_SETTINGS.telegram,
      ...(settings?.telegram || {}),
    },
    webhook: {
      ...DEFAULT_SETTINGS.webhook,
      ...(settings?.webhook || {}),
    },
    summaryMode: isSummaryMode(settings?.summaryMode) ? settings.summaryMode : DEFAULT_SETTINGS.summaryMode,
    summaryTemplate: isSummaryTemplate(settings?.summaryTemplate)
      ? settings.summaryTemplate
      : DEFAULT_SETTINGS.summaryTemplate,
    pricing: normalizePricing(settings?.pricing),
    autoCaptureKeyFrames: typeof settings?.autoCaptureKeyFrames === 'boolean'
      ? settings.autoCaptureKeyFrames
      : DEFAULT_SETTINGS.autoCaptureKeyFrames,
  };
}

function normalizeAiConfig(value: unknown): AIConfig {
  return {
    ...DEFAULT_SETTINGS.aiConfig,
    ...((value as Partial<AIConfig> | undefined) || {}),
  };
}

function normalizeProviderConfigs(value: unknown): Record<string, AIConfig> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key.length > 0)
      .map(([key, config]) => [key, normalizeAiConfig(config)])
  );
}

function isSummaryMode(value: unknown): value is SummaryMode {
  return value === 'quick' || value === 'standard' || value === 'detailed';
}

function isSummaryTemplate(value: unknown): value is SummaryTemplate {
  return value === 'study' || value === 'tutorial' || value === 'ideas' || value === 'timeline';
}

function isObsidianSyncMode(value: unknown): value is ObsidianConfig['syncMode'] {
  return value === 'uri' || value === 'rest';
}

function loadLegacySettings(): AppSettings | null {
  try {
    if (typeof localStorage === 'undefined') return null;

    const providerId = localStorage.getItem('b-note-provider');
    const configText = localStorage.getItem('b-note-config');
    if (!providerId && !configText) return null;

    const aiConfig = configText ? JSON.parse(configText) : undefined;
    return normalizeSettings({
      providerId: providerId || undefined,
      aiConfig,
    });
  } catch {
    return null;
  }
}
