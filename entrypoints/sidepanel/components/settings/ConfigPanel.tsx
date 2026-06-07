import { useState } from 'react';
import type { AIConfig, TokenUsage } from '@/src/lib/summarizer';
import { PROVIDERS, type ProviderPreset } from '@/src/lib/providers';
import type {
  ObsidianConfig,
  TelegramConfig,
  WebhookConfig,
} from '@/src/lib/settings';
import type { PricingConfig } from '@/src/lib/cost';
import { formatUsage } from '@/src/lib/note';
import { getTranscriptionWarning } from '@/src/lib/transcriptionSupport';
import { NOTE_TEMPLATE_PRESETS } from '@/src/lib/noteTemplate';
import type { ConfigSection } from '../../types';

export function ConfigPanel({
  config,
  onChange,
  providerId,
  onSelectProvider,
  provider,
  modelOptions,
  obsidian,
  onObsidianChange,
  telegram,
  onTelegramChange,
  webhook,
  onWebhookChange,
  pricing,
  onPricingChange,
  autoCaptureKeyFrames,
  onAutoCaptureKeyFramesChange,
  onTestApi,
  apiTestStatus,
  lastApiTestUsage,
  onFetchModels,
  modelFetchStatus,
}: {
  config: AIConfig;
  onChange: (c: AIConfig) => void;
  providerId: string;
  onSelectProvider: (id: string) => void;
  provider: ProviderPreset;
  modelOptions: string[];
  obsidian: ObsidianConfig;
  onObsidianChange: (c: ObsidianConfig) => void;
  telegram: TelegramConfig;
  onTelegramChange: (c: TelegramConfig) => void;
  webhook: WebhookConfig;
  onWebhookChange: (c: WebhookConfig) => void;
  pricing: PricingConfig;
  onPricingChange: (c: PricingConfig) => void;
  autoCaptureKeyFrames: boolean;
  onAutoCaptureKeyFramesChange: (enabled: boolean) => void;
  onTestApi: () => void;
  apiTestStatus: 'idle' | 'testing';
  lastApiTestUsage: TokenUsage | null;
  onFetchModels: () => void;
  modelFetchStatus: 'idle' | 'loading';
}) {
  const [section, setSection] = useState<ConfigSection>('ai');
  const transcriptionWarning = getTranscriptionWarning(config);
  const sections: Array<{ id: ConfigSection; label: string }> = [
    { id: 'ai', label: 'AI' },
    { id: 'transcription', label: '转写' },
    { id: 'preferences', label: '偏好' },
    { id: 'export', label: '导出' },
    { id: 'publish', label: '发布' },
    { id: 'pricing', label: '费用' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-800">设置</div>
            <div className="text-[11px] text-slate-400">{provider.name}</div>
          </div>
          <button
            type="button"
            onClick={onTestApi}
            disabled={apiTestStatus === 'testing'}
            className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {apiTestStatus === 'testing' ? '测试中...' : '测试 API'}
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1 rounded-lg bg-slate-100 p-1">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              aria-pressed={section === item.id}
              className={`rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition ${
                section === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          {section === 'ai' && (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-400">提供商</label>
                <div className="grid grid-cols-4 gap-1">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onSelectProvider(p.id)}
                      className={`rounded px-1 py-1.5 text-xs transition ${
                        p.id === providerId
                          ? 'bg-blue-100 font-medium text-blue-700 ring-1 ring-blue-300'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                  每个提供商会单独保存 Base URL、API Key 和模型；切换回来会恢复上次填写的配置。
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-400">Base URL</label>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="https://api.deepseek.com"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">{provider.authLabel}</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder={provider.id === 'ollama' ? '本地部署无需填写' : 'sk-...'}
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-slate-400">Model</label>
                  <button
                    type="button"
                    onClick={onFetchModels}
                    disabled={modelFetchStatus === 'loading'}
                    className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
                  >
                    {modelFetchStatus === 'loading' ? '获取中...' : '获取模型'}
                  </button>
                </div>
                {modelOptions.length > 0 ? (
                  <select
                    value={config.model}
                    onChange={(e) => onChange({ ...config, model: e.target.value })}
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {!modelOptions.includes(config.model) && config.model && (
                      <option value={config.model}>{config.model}</option>
                    )}
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => onChange({ ...config, model: e.target.value })}
                    className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="输入模型名"
                  />
                )}
              </div>

              <div className="rounded-md border border-blue-100 bg-blue-50/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-700">API 连通性</div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      {lastApiTestUsage ? `上次测试：${formatUsage(lastApiTestUsage)}` : '发送极短请求，确认模型和 token 返回'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onTestApi}
                    disabled={apiTestStatus === 'testing'}
                    title="会发送一次极短请求，消耗少量 token"
                    className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {apiTestStatus === 'testing' ? '测试中...' : '测试 API'}
                  </button>
                </div>
              </div>
            </>
          )}

          {section === 'transcription' && (
            <>
              <div>
                <label className="text-xs text-slate-400">Whisper Model</label>
                <input
                  type="text"
                  value={config.transcriptionModel || 'whisper-1'}
                  onChange={(e) => onChange({ ...config, transcriptionModel: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="whisper-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">转写 Base URL</label>
                <input
                  type="text"
                  value={config.transcriptionBaseUrl || ''}
                  onChange={(e) => onChange({ ...config, transcriptionBaseUrl: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="留空沿用聊天 Base URL"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">转写 API Key</label>
                <input
                  type="password"
                  value={config.transcriptionApiKey || ''}
                  onChange={(e) => onChange({ ...config, transcriptionApiKey: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="留空沿用聊天 API Key"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">长视频转写 Worker URL</label>
                <input
                  type="text"
                  value={config.transcriptionWorkerUrl || ''}
                  onChange={(e) => onChange({ ...config, transcriptionWorkerUrl: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="http://127.0.0.1:8787/transcribe"
                />
              </div>
              {transcriptionWarning && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700">
                  {transcriptionWarning}
                </div>
              )}
            </>
          )}

          {section === 'pricing' && (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-slate-700">费用估算</div>
                  <div className="text-[11px] text-slate-500">按每百万 tokens 单价计算，可留空</div>
                </div>
                <select
                  value={pricing.currency}
                  onChange={(e) => onPricingChange({ ...pricing, currency: e.target.value === 'USD' ? 'USD' : 'CNY' })}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500">
                  输入单价 / 1M
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={pricing.promptPerMillion ?? ''}
                    onChange={(e) =>
                      onPricingChange({
                        ...pricing,
                        promptPerMillion: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="如 2"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  输出单价 / 1M
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={pricing.completionPerMillion ?? ''}
                    onChange={(e) =>
                      onPricingChange({
                        ...pricing,
                        completionPerMillion: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="如 8"
                  />
                </label>
              </div>
            </div>
          )}

          {section === 'preferences' && (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">一键生成自动截图</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    开启后会按笔记时间戳后台抓取关键画面。关闭后生成更快，也不会自动拖动视频进度。
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoCaptureKeyFrames}
                  onClick={() => onAutoCaptureKeyFramesChange(!autoCaptureKeyFrames)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    autoCaptureKeyFrames ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                      autoCaptureKeyFrames ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                当前：{autoCaptureKeyFrames ? '会自动截图并后台补齐关键画面' : '只生成文字笔记，截图需手动点击'}
              </div>
            </div>
          )}

          {section === 'export' && (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Obsidian 同步方式</label>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {[
                    ['uri', 'URI 唤起'],
                    ['rest', 'Local REST API'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onObsidianChange({ ...obsidian, syncMode: value as ObsidianConfig['syncMode'] })}
                      className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                        obsidian.syncMode === value
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  URI 适合快速唤起；Local REST API 适合长笔记和稳定写入，会写入当前打开的 Obsidian 库。
                </div>
              </div>

              {obsidian.syncMode === 'rest' && (
                <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2">
                  <label className="block text-xs text-slate-500">
                    REST API 地址
                    <input
                      type="url"
                      value={obsidian.restUrl}
                      onChange={(e) => onObsidianChange({ ...obsidian, restUrl: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-blue-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="http://127.0.0.1:27123"
                    />
                  </label>
                  <label className="block text-xs text-slate-500">
                    REST API Key
                    <input
                      type="password"
                      value={obsidian.restApiKey}
                      onChange={(e) => onObsidianChange({ ...obsidian, restApiKey: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-blue-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="Obsidian 插件中生成的 API Key"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    覆盖同名笔记
                    <input
                      type="checkbox"
                      checked={obsidian.restOverwrite}
                      onChange={(e) => onObsidianChange({ ...obsidian, restOverwrite: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                    />
                  </label>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {obsidian.syncMode === 'rest' ? 'REST 根目录（当前库内）' : 'Obsidian Vault'}
                </label>
                <input
                  type="text"
                  value={obsidian.vault}
                  onChange={(e) => onObsidianChange({ ...obsidian, vault: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder={obsidian.syncMode === 'rest' ? '例如：b-note；留空则写到当前库根目录' : '留空则使用 Obsidian 当前默认库'}
                />
                {obsidian.syncMode === 'rest' && (
                  <div className="mt-1 text-[10px] leading-relaxed text-slate-400">
                    REST API 不能切换库，这里会作为文件夹前缀。示例：b-note + B站视频笔记。
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400">Obsidian 文件夹</label>
                <input
                  type="text"
                  value={obsidian.folder}
                  onChange={(e) => onObsidianChange({ ...obsidian, folder: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="例如：B站视频笔记/AI"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Obsidian 标签</label>
                <input
                  type="text"
                  value={obsidian.tags}
                  onChange={(e) => onObsidianChange({ ...obsidian, tags: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="例如：AI, 视频笔记, 学习"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">额外 Frontmatter</label>
                <textarea
                  value={obsidian.frontmatter}
                  onChange={(e) => onObsidianChange({ ...obsidian, frontmatter: e.target.value })}
                  rows={3}
                  className="mt-0.5 w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder={'project: AI学习\nstatus: inbox'}
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Frontmatter 字段映射</label>
                <textarea
                  value={obsidian.fieldMapping}
                  onChange={(e) => onObsidianChange({ ...obsidian, fieldMapping: e.target.value })}
                  rows={3}
                  className="mt-0.5 w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder={'url: source_url\nsummary_mode: note_mode\nkeyframes: -'}
                />
                <div className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  左侧字段可映射为自定义 key，值填 - 可隐藏该字段。
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-xs text-slate-400">Obsidian 模板</label>
                  <div className="flex gap-1 overflow-x-auto">
                    {NOTE_TEMPLATE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onObsidianChange({ ...obsidian, noteTemplate: preset.content })}
                        className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition hover:bg-slate-200"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={obsidian.noteTemplate}
                  onChange={(e) => onObsidianChange({ ...obsidian, noteTemplate: e.target.value })}
                  rows={5}
                  className="mt-0.5 w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder={'# {{title}}\n\n{{content}}\n\n---\n来源：{{url}}'}
                />
                <div className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  可用变量：{'{{content}}'}、{'{{title}}'}、{'{{url}}'}、{'{{generatedAt}}'}、{'{{mode}}'}、{'{{template}}'}、{'{{model}}'}。留空则直接导出原始笔记。
                </div>
              </div>
            </>
          )}

          {section === 'publish' && (
            <>
              <div>
                <div className="mb-2 text-xs font-medium text-slate-700">Telegram 发布</div>
                <div className="space-y-2">
                  <label className="block text-xs text-slate-400">
                    Bot Token
                    <input
                      type="password"
                      value={telegram.botToken}
                      onChange={(e) => onTelegramChange({ ...telegram, botToken: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="123456:ABC..."
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Chat ID
                    <input
                      type="text"
                      value={telegram.chatId}
                      onChange={(e) => onTelegramChange({ ...telegram, chatId: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="例如：-1001234567890"
                    />
                  </label>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="mb-2 text-xs font-medium text-slate-700">Webhook 发布</div>
                <div className="space-y-2">
                  <label className="block text-xs text-slate-400">
                    Webhook URL
                    <input
                      type="url"
                      value={webhook.url}
                      onChange={(e) => onWebhookChange({ ...webhook, url: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="https://example.com/b-note"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Secret Header
                    <input
                      type="password"
                      value={webhook.secret}
                      onChange={(e) => onWebhookChange({ ...webhook, secret: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="可选，会发送为 X-B-Note-Secret"
                    />
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
