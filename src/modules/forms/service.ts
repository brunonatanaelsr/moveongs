import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { AppError, NotFoundError } from '../../shared/errors';
import type {
  CreateSubmissionInput,
  CreateSubmissionParams,
  CreateTemplateParams,
  FormSubmissionRecord,
  FormSubmissionSummary,
  FormTemplateRecord,
  FormTemplateRevisionRecord,
  ListSubmissionsFilters,
  ListTemplatesFilters,
  UpdateSubmissionParams,
  UpdateTemplateParams,
} from './types';
import {
  createFormSubmission as createFormSubmissionRepository,
  createFormTemplate as createFormTemplateRepository,
  getFormSubmissionById,
  getLatestActiveTemplate,
  getTemplateById,
  getTemplateByTypeAndVersion,
  listTemplateRevisions as listTemplateRevisionsRepository,
  listFormTemplates as listFormTemplatesRepository,
  listSubmissionsByBeneficiary,
  updateFormSubmission as updateFormSubmissionRepository,
  updateFormTemplate as updateFormTemplateRepository,
} from './repository';
import { getBeneficiaryById } from '../beneficiaries/repository';
import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';
import { assertFormPayloadValid, normalizeValidationError } from './validation';

const execFileAsync = promisify(execFile);

export async function listFormTemplates(filters: ListTemplatesFilters): Promise<FormTemplateRecord[]> {
  return listFormTemplatesRepository(filters);
}

export async function createFormTemplate(input: CreateTemplateParams): Promise<FormTemplateRecord> {
  return createFormTemplateRepository({ ...input, createdBy: input.createdBy ?? null });
}

export async function updateFormTemplate(id: string, input: UpdateTemplateParams): Promise<FormTemplateRecord> {
  return updateFormTemplateRepository(id, { ...input, updatedBy: input.updatedBy ?? null });
}

export async function listTemplateRevisions(templateId: string): Promise<FormTemplateRevisionRecord[]> {
  return listTemplateRevisionsRepository(templateId);
}

export async function getFormTemplateOrFail(id: string): Promise<FormTemplateRecord> {
  const template = await getTemplateById(id);
  if (!template) {
    throw new NotFoundError('Form template not found');
  }
  return template;
}

export async function listSubmissions(filters: ListSubmissionsFilters): Promise<FormSubmissionSummary[]> {
  const scopes = filters.allowedProjectIds && filters.allowedProjectIds.length > 0 ? filters.allowedProjectIds : null;
  return listSubmissionsByBeneficiary({ ...filters, allowedProjectIds: scopes });
}

export async function createSubmission(
  input: CreateSubmissionInput,
  allowedProjectIds?: string[] | null,
): Promise<FormSubmissionRecord> {
  const scopes = allowedProjectIds && allowedProjectIds.length > 0 ? allowedProjectIds : null;
  if (scopes) {
    const beneficiary = await getBeneficiaryById(input.beneficiaryId, scopes);
    if (!beneficiary) {
      throw new NotFoundError('Beneficiary not found');
    }
  }

  ensureSignatureConsistency(input.signedBy, input.signedAt);

  const template = input.schemaVersion
    ? await getTemplateByTypeAndVersion(input.formType, input.schemaVersion)
    : await getLatestActiveTemplate(input.formType);

  if (!template) {
    throw new AppError('Form template not found', 404);
  }

  if (template.status !== 'active') {
    throw new AppError('Form template is not active', 400);
  }

  const schemaObject = ensureTemplateSchemaObject(template);
  const payload = input.payload ?? {};

  try {
    assertFormPayloadValid(template.formType, template.schemaVersion, schemaObject, payload);
  } catch (error) {
    const { message, issues } = normalizeValidationError(error);
    throw new AppError(message, 400, issues);
  }

  const params: CreateSubmissionParams = {
    beneficiaryId: input.beneficiaryId,
    formType: template.formType,
    schemaVersion: template.schemaVersion,
    payload,
    signedBy: input.signedBy,
    signedAt: input.signedAt,
    attachments: input.attachments,
    createdBy: input.createdBy ?? null,
  };

  return createFormSubmissionRepository(params);
}

export async function getSubmissionOrFail(
  id: string,
  allowedProjectIds?: string[] | null,
): Promise<FormSubmissionRecord> {
  const submission = await getFormSubmissionById(id, allowedProjectIds);
  if (!submission) {
    throw new NotFoundError('Form submission not found');
  }
  return submission;
}

export async function updateSubmission(
  id: string,
  params: UpdateSubmissionParams,
  allowedProjectIds?: string[] | null,
): Promise<FormSubmissionRecord> {
  ensureSignatureConsistency(params.signedBy, params.signedAt);

  const submission = await getSubmissionOrFail(id, allowedProjectIds);

  const template = submission.template
    ? submission.template
    : await getTemplateByTypeAndVersion(submission.formType, submission.schemaVersion);

  if (!template) {
    throw new AppError('Form template not found for submission', 404);
  }

  if (template.status !== 'active') {
    throw new AppError('Form template is not active', 400);
  }

  const schemaObject = ensureTemplateSchemaObject(template);

  if (params.payload !== undefined) {
    const payload = params.payload ?? {};
    try {
      assertFormPayloadValid(template.formType, template.schemaVersion, schemaObject, payload);
    } catch (error) {
      const { message, issues } = normalizeValidationError(error);
      throw new AppError(message, 400, issues);
    }
  }

  return updateFormSubmissionRepository(id, params);
}

export async function generateSubmissionPdf(
  id: string,
  allowedProjectIds?: string[] | null,
): Promise<{ filename: string; buffer: Buffer }> {
  const submission = await getSubmissionOrFail(id, allowedProjectIds);

  let template = submission.template ?? null;
  if (!template) {
    template = await getTemplateByTypeAndVersion(submission.formType, submission.schemaVersion);
  }

  if (!template) {
    throw new AppError('Form template not found for submission', 404);
  }

  if (template.status !== 'active') {
    throw new AppError('Form template is not active', 400);
  }

  const schemaObject = ensureTemplateSchemaObject(template);
  const pdfData = await buildSubmissionPdfData(submission, template, schemaObject);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imm-form-'));
  try {
    const dataPath = path.join(tempDir, 'data.json');
    const outputPath = path.join(tempDir, 'submission.pdf');
    const renderer = path.resolve('tools/pdf-renderer/render_pdf.js');
    const templatePath = path.resolve('tools/pdf-renderer/templates/form_submission.hbs');

    await fs.writeFile(dataPath, JSON.stringify(pdfData, null, 2));
    await execFileAsync('node', [renderer, templatePath, dataPath, outputPath], { env: process.env });

    const buffer = await fs.readFile(outputPath);
    const filename = buildSubmissionPdfFilename(submission, template);
    return { buffer, filename };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

type JsonSchema = {
  title?: string;
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
};

type PdfSection = {
  key: string;
  title: string;
  entries: string[];
};

type SubmissionVerificationData = {
  hash: string;
  url: string | null;
  qrCodeDataUrl: string | null;
};

type SubmissionPdfData = {
  templateTitle: string;
  formType: string;
  schemaVersion: string;
  submissionId: string;
  beneficiary: {
    id: string;
    name: string;
  };
  createdAt: string | null;
  updatedAt: string | null;
  generatedAt: string | null;
  sections: PdfSection[];
  signatures: Array<{ name: string; signedAt: string | null }>;
  attachments: Array<{ fileName: string | null; mimeType: string | null }>;
  verification: SubmissionVerificationData;
};

async function buildSubmissionPdfData(
  submission: FormSubmissionRecord,
  template: FormTemplateRecord,
  schema: Record<string, unknown>,
): Promise<SubmissionPdfData> {
  const schemaNode = schema as JsonSchema;
  const sections = buildSectionsFromSchema(schemaNode, submission.payload ?? {});
  const verification = await buildSubmissionVerification(submission, template);

  return {
    templateTitle: typeof schemaNode.title === 'string' ? schemaNode.title : humanizeKey(template.formType),
    formType: template.formType,
    schemaVersion: template.schemaVersion,
    submissionId: submission.id,
    beneficiary: {
      id: submission.beneficiaryId,
      name: submission.beneficiaryName ?? 'Não informado',
    },
    createdAt: formatDateTime(submission.createdAt),
    updatedAt: formatDateTime(submission.updatedAt),
    generatedAt: formatDateTime(new Date()),
    sections,
    signatures: buildSignatures(submission.signedBy ?? [], submission.signedAt ?? []),
    attachments: (submission.attachments ?? []).map((attachment) => ({
      fileName: attachment.fileName ?? attachment.url ?? null,
      mimeType: attachment.mimeType ?? null,
    })),
    verification,
  };
}

function buildSectionsFromSchema(schema: JsonSchema, payload: Record<string, unknown>): PdfSection[] {
  const properties = schema.properties;
  if (!properties) {
    return [];
  }

  return Object.entries(properties).map(([key, value]) => {
    const node = value ?? {};
    const sectionTitle = typeof node.title === 'string' ? node.title : humanizeKey(key);
    const sectionPayload = payload[key];
    const entries = formatSchemaValue(node as JsonSchema, sectionPayload);

    return {
      key,
      title: sectionTitle,
      entries,
    };
  });
}

function buildSignatures(names: string[], signedAt: string[]): Array<{ name: string; signedAt: string | null }> {
  return names
    .map((name, index) => ({
      name,
      signedAt: formatDateTime(signedAt[index] ?? null),
    }))
    .filter((signature) => Boolean(signature.name));
}

function formatSchemaValue(schema: JsonSchema, value: unknown): string[] {
  const schemaType = resolveSchemaType(schema);

  if (schemaType === 'array') {
    if (!Array.isArray(value) || value.length === 0) {
      return ['Nenhum item informado'];
    }

    const rawItems = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    const itemSchema: JsonSchema = rawItems ?? {};

    return value.map((item, index) => {
      const formatted = formatSchemaValue(itemSchema, item);
      if (formatted.length === 0) {
        return `${index + 1}. Não informado`;
      }
      if (formatted.length === 1) {
        return `${index + 1}. ${formatted[0]}`;
      }
      return `${index + 1}. ${formatted.join('; ')}`;
    });
  }

  if (schemaType === 'object') {
    return formatObjectEntries(schema, value);
  }

  return [formatPrimitive(value)];
}

function resolveSchemaType(schema: JsonSchema): 'object' | 'array' | 'primitive' {
  if (schema.type === 'object') {
    return 'object';
  }
  if (schema.type === 'array') {
    return 'array';
  }
  if (schema.properties) {
    return 'object';
  }
  if (schema.items) {
    return 'array';
  }
  return 'primitive';
}

function formatObjectEntries(schema: JsonSchema, value: unknown): string[] {
  if (!isPlainObject(value)) {
    return ['Não informado'];
  }

  const properties = schema.properties;
  if (!properties || Object.keys(properties).length === 0) {
    return [JSON.stringify(value)];
  }

  const entries: string[] = [];

  for (const [key, raw] of Object.entries(properties)) {
    const node = raw ?? {};
    const label = typeof node.title === 'string' ? node.title : humanizeKey(key);
    const nestedValue = (value as Record<string, unknown>)[key];
    const formatted = formatSchemaValue(node as JsonSchema, nestedValue);

    if (formatted.length === 0) {
      continue;
    }

    if (formatted.length === 1) {
      entries.push(`${label}: ${formatted[0]}`);
    } else {
      entries.push(`${label}: ${formatted.join('; ')}`);
    }
  }

  if (entries.length === 0) {
    return ['Não informado'];
  }

  return entries;
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Não informado';
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 'Não informado';
    }
    return String(value);
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? 'Não informado' : value;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function buildSubmissionPdfFilename(submission: FormSubmissionRecord, template: FormTemplateRecord): string {
  const safeType = sanitizeForFilename(template.formType || submission.formType);
  const datePart = formatDateForFilename(submission.createdAt);
  const idPart = submission.id.split('-')[0] ?? submission.id;
  const parts = ['form', safeType, datePart, idPart].filter(Boolean) as string[];
  return `${parts.join('-')}.pdf`;
}

function ensureTemplateSchemaObject(template: FormTemplateRecord): Record<string, unknown> {
  if (!isPlainObject(template.schema)) {
    throw new AppError('Form template schema is invalid', 400);
  }

  return template.schema as Record<string, unknown>;
}

function sanitizeForFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim() || 'formulario';
}

function formatDateForFilename(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : null;
  }

  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ensureSignatureConsistency(
  signedBy: string[] | null | undefined,
  signedAt: string[] | null | undefined,
): void {
  const providedSignedBy = signedBy !== undefined;
  const providedSignedAt = signedAt !== undefined;

  if (providedSignedBy !== providedSignedAt) {
    throw new AppError('signedBy and signedAt must be provided together', 400);
  }
}

async function buildSubmissionVerification(
  submission: FormSubmissionRecord,
  template: FormTemplateRecord,
): Promise<SubmissionVerificationData> {
  const env = getEnv();
  const payloadForHash = submission.payload ?? {};
  const content = {
    submissionId: submission.id,
    beneficiaryId: submission.beneficiaryId,
    formType: template.formType,
    schemaVersion: template.schemaVersion,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    payload: payloadForHash,
    signedBy: submission.signedBy ?? [],
    signedAt: submission.signedAt ?? [],
    attachments: submission.attachments ?? [],
  };

  const secret = env.FORM_VERIFICATION_HASH_SECRET ?? '';
  const hash = createHash('sha256').update(secret).update(canonicalize(content)).digest('hex');

  const verificationUrl = buildVerificationUrl(env.FORM_VERIFICATION_BASE_URL, submission.id, hash);

  let qrCodeDataUrl: string | null = null;
  if (verificationUrl) {
    try {
      qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 4,
      });
    } catch (error) {
      logger.warn({ err: error, submissionId: submission.id }, 'failed to generate verification qr code');
    }
  }

  return {
    hash,
    url: verificationUrl,
    qrCodeDataUrl,
  };
}

function buildVerificationUrl(baseUrl: string | undefined, submissionId: string, hash: string): string | null {
  if (!baseUrl) {
    return null;
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  try {
    const url = new URL(submissionId, normalizedBase);
    url.searchParams.set('hash', hash);
    return url.toString();
  } catch {
    return `${normalizedBase}${submissionId}?hash=${encodeURIComponent(hash)}`;
  }
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (value instanceof Date) {
    return canonicalize(value.toISOString());
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalize(val)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
