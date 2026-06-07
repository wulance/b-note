const RESERVED_KEYS = new Set([
  'source',
  'title',
  'url',
  'summary_mode',
  'template',
  'provider',
  'model',
  'generated_at',
  'tokens',
  'prompt_tokens',
  'completion_tokens',
  'estimated_cost',
  'estimated_cost_currency',
  'keyframes',
  'tags',
]);

export const FRONTMATTER_FIELD_KEYS = [
  'source',
  'title',
  'url',
  'summary_mode',
  'template',
  'provider',
  'model',
  'generated_at',
  'tokens',
  'prompt_tokens',
  'completion_tokens',
  'estimated_cost',
  'estimated_cost_currency',
  'keyframes',
  'tags',
] as const;

export type FrontmatterFieldKey = (typeof FRONTMATTER_FIELD_KEYS)[number];
export type FrontmatterFieldMap = Partial<Record<FrontmatterFieldKey, string | null>>;

export function parseTags(input: string | string[] | null | undefined): string[] {
  const values = Array.isArray(input) ? input : String(input || '').split(/[,，\s]+/);
  return [...new Set(values.map(normalizeTag).filter(Boolean))];
}

export function parseExtraFrontmatter(input: string | Record<string, unknown> | null | undefined): Record<string, string> {
  if (!input) return {};
  if (typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input)
        .map(([key, value]) => normalizeFrontmatterPair(key, String(value ?? '')))
        .filter(Boolean) as Array<[string, string]>
    );
  }
  return Object.fromEntries(
    input
      .split('\n')
      .map((line) => {
        const match = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(line.trim());
        if (!match) return null;
        return normalizeFrontmatterPair(match[1], match[2]);
      })
      .filter(Boolean) as Array<[string, string]>
  );
}

export function parseFrontmatterFieldMap(input: string | Record<string, unknown> | null | undefined): FrontmatterFieldMap {
  if (!input) return {};
  const pairs = typeof input === 'object'
    ? Object.entries(input).map(([key, value]) => [key, String(value ?? '')] as const)
    : input
        .split('\n')
        .map((line) => {
          const match = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(line.trim());
          return match ? ([match[1], match[2]] as const) : null;
        })
        .filter(Boolean) as Array<readonly [string, string]>;

  const result: FrontmatterFieldMap = {};
  for (const [sourceKey, targetValue] of pairs) {
    if (!isFrontmatterFieldKey(sourceKey)) continue;
    const normalizedTarget = String(targetValue || '').trim();
    if (normalizedTarget === '-') {
      result[sourceKey] = null;
    } else if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(normalizedTarget)) {
      result[sourceKey] = normalizedTarget;
    }
  }
  return result;
}

function isFrontmatterFieldKey(value: string): value is FrontmatterFieldKey {
  return (FRONTMATTER_FIELD_KEYS as readonly string[]).includes(value);
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 40);
}

function normalizeFrontmatterPair(key: string, value: string): [string, string] | null {
  const normalizedKey = key.trim();
  const normalizedValue = value.trim();
  if (!normalizedKey || !normalizedValue || RESERVED_KEYS.has(normalizedKey)) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(normalizedKey)) return null;
  return [normalizedKey, normalizedValue.slice(0, 500)];
}
