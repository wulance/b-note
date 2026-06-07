export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  authLabel: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-v4-pro',
    authLabel: 'DeepSeek API Key',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o4-mini'],
    defaultModel: 'gpt-4o',
    authLabel: 'OpenAI API Key',
  },
  {
    id: 'gemini',
    name: 'Gemini 免费层',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    defaultModel: 'gemini-2.5-flash',
    authLabel: 'Gemini API Key',
  },
  {
    id: 'openrouter-free',
    name: 'OpenRouter 免费模型',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openrouter/free', 'openai/gpt-oss-120b:free', 'openai/gpt-oss-20b:free'],
    defaultModel: 'openrouter/free',
    authLabel: 'OpenRouter API Key',
  },
  {
    id: 'groq',
    name: 'Groq 免费层',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    defaultModel: 'llama-3.3-70b-versatile',
    authLabel: 'Groq API Key',
  },
  {
    id: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI 免费额度',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1',
    models: ['@cf/meta/llama-3.1-8b-instruct', '@cf/openai/gpt-oss-120b'],
    defaultModel: '@cf/meta/llama-3.1-8b-instruct',
    authLabel: 'Cloudflare API Token',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
    defaultModel: 'claude-sonnet-4-20250514',
    authLabel: 'Anthropic API Key',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['Pro/deepseek-ai/DeepSeek-V3', 'Pro/deepseek-ai/DeepSeek-R1', 'Qwen/Qwen3-235B-A22B'],
    defaultModel: 'Pro/deepseek-ai/DeepSeek-V3',
    authLabel: 'SiliconFlow API Key',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-air'],
    defaultModel: 'glm-4-flash',
    authLabel: '智谱 API Key',
  },
  {
    id: 'moonshot',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
    defaultModel: 'kimi-latest',
    authLabel: 'Moonshot API Key',
  },
  {
    id: 'ollama',
    name: 'Ollama 本地',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'qwen3', 'deepseek-r1', 'mistral'],
    defaultModel: 'qwen3',
    authLabel: '留空即可（本地部署）',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    models: [],
    defaultModel: '',
    authLabel: 'API Key',
  },
];
