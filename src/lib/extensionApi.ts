import type { RuntimeMessage, RuntimeResponse } from './messages';

interface StorageLocalApi {
  get(key?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export function getStorageLocal(): StorageLocalApi {
  const root = globalThis as any;
  const storage = root.browser?.storage?.local || root.chrome?.storage?.local;
  if (!storage) {
    throw new Error('扩展存储 API 不可用');
  }
  return storage;
}

export async function sendRuntimeMessage<T = RuntimeResponse>(message: RuntimeMessage): Promise<T> {
  const root = globalThis as any;
  const runtime = root.browser?.runtime || root.chrome?.runtime;
  if (!runtime?.sendMessage) {
    throw new Error('扩展消息 API 不可用');
  }
  return runtime.sendMessage(message);
}
