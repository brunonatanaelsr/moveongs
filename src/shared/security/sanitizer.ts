const DANGEROUS_PATTERN = /<\s*(script|iframe|object|embed)[^>]*>/gi;

function sanitizeString(value: string): string {
  return value.replace(DANGEROUS_PATTERN, '').replace(/javascript:/gi, '');
}

export function sanitizeInput<T>(input: T): T {
  if (input == null) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeString(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((value) => sanitizeInput(value)) as T;
  }

  if (typeof input === 'object') {
    if (input instanceof Date || Buffer.isBuffer(input)) {
      return input;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[key] = sanitizeInput(value);
    }
    return result as T;
  }

  return input;
}
