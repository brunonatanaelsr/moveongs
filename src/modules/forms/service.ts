import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError, NotFoundError } from '../../shared/errors';
import type {
  CreateSubmissionInput,
  CreateSubmissionParams,
  CreateTemplateParams,
  FormSubmissionRecord,
  FormSubmissionSummary,
  FormTemplateRecord,
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
  listFormTemplates as listFormTemplatesRepository,
  listSubmissionsByBeneficiary,
  updateFormSubmission as updateFormSubmissionRepository,
  updateFormTemplate as updateFormTemplateRepository,
} from './repository';
import { getBeneficiaryById } from '../beneficiaries/repository';

const execFileAsync = promisify(execFile);

export async function listFormTemplates(filters: ListTemplatesFilters): Promise<FormTemplateRecord[]> {
  return listFormTemplatesRepository(filters);
}

export async function createFormTemplate(input: CreateTemplateParams): Promise<FormTemplateRecord> {
  return createFormTemplateRepository(input);
}

export async function updateFormTemplate(id: string, input: UpdateTemplateParams): Promise<FormTemplateRecord> {
  return updateFormTemplateRepository(id, input);
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

  const template = input.schemaVersion
    ? await getTemplateByTypeAndVersion(input.formType, input.schemaVersion)
    : await getLatestActiveTemplate(input.formType);

  if (!template) {
    throw new AppError('Form template not found', 404);
  }

  if (template.status !== 'active') {
    throw new AppError('Form template is not active', 400);
  }

  const params: CreateSubmissionParams = {
    beneficiaryId: input.beneficiaryId,
    formType: template.formType,
    schemaVersion: template.schemaVersion,
    payload: input.payload,
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
  await getSubmissionOrFail(id, allowedProjectIds);
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

  if (!isPlainObject(template.schema)) {
    throw new AppError('Form template schema is invalid', 400);
  }

  const schemaObject = template.schema as Record<string, unknown>;
  const pdfData = buildSubmissionPdfData(submission, template, schemaObject);

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
};

function buildSubmissionPdfData(
  submission: FormSubmissionRecord,
  template: FormTemplateRecord,
  schema: Record<string, unknown>,
): SubmissionPdfData {
  const schemaNode = schema as JsonSchema;
  const sections = buildSectionsFromSchema(schemaNode, submission.payload ?? {});

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
