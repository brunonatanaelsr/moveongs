import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { AppError } from '../../shared/errors';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validatorCache = new Map<string, ValidateFunction>();

function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const cacheKey = JSON.stringify(schema);
  const cached = validatorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const validator = ajv.compile(schema);
  validatorCache.set(cacheKey, validator);
  return validator;
}

function formatErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors || errors.length === 0) {
    return undefined;
  }

  return errors.map((error) => ({
    path: error.instancePath || error.schemaPath,
    message: error.message ?? 'Valor inválido',
    keyword: error.keyword,
    params: error.params,
  }));
}

export function validateFormPayloadOrThrow(schema: Record<string, unknown>, payload: unknown) {
  const validator = getValidator(schema);
  const valid = validator(payload);
  if (!valid) {
    throw new AppError('Form payload does not match schema', 400, {
      validation: formatErrors(validator.errors),
    });
  }
}

export function clearSchemaValidatorCache() {
  validatorCache.clear();
}
