import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  strictSchema: false,
  removeAdditional: false,
});
addFormats(ajv);

const validatorCache = new Map<string, ValidateFunction>();

export type ValidationIssue = {
  path: string;
  message: string;
};

export function assertFormPayloadValid(
  formType: string,
  schemaVersion: string,
  schema: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  const cacheKey = `${formType}:${schemaVersion}:${canonicalize(schema)}`;
  let validator = validatorCache.get(cacheKey);

  if (!validator) {
    validator = ajv.compile(schema as AnySchema);
    validatorCache.set(cacheKey, validator);
  }

  const valid = validator(payload);
  if (!valid) {
    const details = formatAjvErrors(validator.errors ?? []);
    throw new ErrorWithDetails('Form payload validation failed', details);
  }
}

class ErrorWithDetails extends Error {
  public readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.issues = issues;
  }
}

export function formatAjvErrors(errors: ErrorObject[]): ValidationIssue[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  return errors.map((error) => ({
    path: buildErrorPath(error),
    message: error.message ?? 'Invalid value',
  }));
}

function buildErrorPath(error: ErrorObject): string {
  const segments = error.instancePath
    ? error.instancePath
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    : [];

  if (error.keyword === 'required' && 'missingProperty' in error.params) {
    const property = String((error.params as Record<string, unknown>).missingProperty ?? '');
    if (property) {
      segments.push(property);
    }
  }

  return segments.join('.') || '(root)';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeValidationError(error: unknown): { message: string; issues: ValidationIssue[] } {
  if (error instanceof ErrorWithDetails) {
    return { message: error.message, issues: error.issues };
  }

  return { message: 'Form payload validation failed', issues: [] };
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalize(val)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}
