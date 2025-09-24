type Maskable = Record<string, unknown> | unknown[];

const SENSITIVE_KEYS = new Set([
  'cpf',
  'rg',
  'nis',
  'email',
  'phone',
  'phone1',
  'phone2',
  'address',
  'neighborhood',
  'city',
  'state',
  'reference',
  'document',
  'doc',
  'passport',
]);

function maskEmail(value: string): string {
  const [user, domain] = value.split('@');
  if (!domain) {
    return maskDefault(value);
  }
  const visible = user.slice(0, 2);
  return `${visible.padEnd(user.length, '*')}@${domain}`;
}

function maskDefault(value: string): string {
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  const visible = value.slice(-4);
  return `${'*'.repeat(value.length - 4)}${visible}`;
}

function maskValue(key: string, value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  if (key.toLowerCase().includes('email')) {
    return maskEmail(value);
  }

  return maskDefault(value.replace(/\s+/g, ''));
}

export function maskSensitiveData(payload: unknown): unknown {
  if (payload == null) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => maskSensitiveData(item));
  }

  if (typeof payload !== 'object') {
    return payload;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      result[key] = maskSensitiveData(value as Maskable);
      continue;
    }

    if (SENSITIVE_KEYS.has(key) || /token/i.test(key) || /secret/i.test(key)) {
      result[key] = maskValue(key, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
