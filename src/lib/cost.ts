import type { TokenUsage } from './summarizer';

export interface PricingConfig {
  currency: 'CNY' | 'USD';
  promptPerMillion: number | null;
  completionPerMillion: number | null;
}

export const DEFAULT_PRICING: PricingConfig = {
  currency: 'CNY',
  promptPerMillion: null,
  completionPerMillion: null,
};

export function normalizePricing(value: unknown): PricingConfig {
  const pricing = value as Partial<PricingConfig> | undefined;
  return {
    currency: pricing?.currency === 'USD' ? 'USD' : 'CNY',
    promptPerMillion: normalizePrice(pricing?.promptPerMillion),
    completionPerMillion: normalizePrice(pricing?.completionPerMillion),
  };
}

export function estimateUsageCost(usage: TokenUsage | null | undefined, pricing: PricingConfig): number | null {
  if (!usage) return null;
  const inputRate = normalizePrice(pricing.promptPerMillion);
  const outputRate = normalizePrice(pricing.completionPerMillion);
  if (inputRate == null && outputRate == null) return null;

  const promptTokens = usage.promptTokens ?? usage.totalTokens;
  const completionTokens = usage.completionTokens ?? 0;
  let cost = 0;
  if (inputRate != null && promptTokens != null) {
    cost += (promptTokens / 1_000_000) * inputRate;
  }
  if (outputRate != null && completionTokens != null) {
    cost += (completionTokens / 1_000_000) * outputRate;
  }
  return Number.isFinite(cost) ? cost : null;
}

export function formatEstimatedCost(cost: number | null | undefined, currency: PricingConfig['currency']): string {
  if (cost == null) return '费用未配置';
  const symbol = currency === 'USD' ? '$' : '¥';
  if (cost > 0 && cost < 0.0001) return `< ${symbol}0.0001`;
  return `${symbol}${cost.toFixed(cost >= 1 ? 2 : 4)}`;
}

function normalizePrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
