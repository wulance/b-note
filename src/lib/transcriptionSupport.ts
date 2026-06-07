import type { AIConfig } from './summarizer';

export function getTranscriptionWarning(config: AIConfig): string | null {
  if ((config.transcriptionWorkerUrl || '').trim()) {
    return null;
  }
  const baseUrl = (config.transcriptionBaseUrl || config.baseUrl).trim().toLowerCase();
  const model = (config.transcriptionModel || '').trim();
  if (!baseUrl) return '未配置 Base URL，无法在无 CC 字幕时自动转写。';
  if (!model) return '未配置 Whisper Model，无法在无 CC 字幕时自动转写。';
  if (baseUrl.includes('api.deepseek.com')) {
    return 'DeepSeek 开放平台通常只提供聊天模型，不支持 /audio/transcriptions；无 CC 字幕的视频建议切换 OpenAI 或兼容 Whisper 的网关。';
  }
  if (baseUrl.includes('anthropic.com')) {
    return 'Anthropic 官方接口不是 OpenAI Whisper 协议，无法直接用于音频转写。';
  }
  if (baseUrl.includes('localhost:11434') || baseUrl.includes('127.0.0.1:11434')) {
    return 'Ollama 默认不提供 OpenAI Whisper 转写接口；无 CC 字幕的视频需要配置独立转写服务。';
  }
  return null;
}
