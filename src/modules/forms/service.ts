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
  return listSubmissionsByBeneficiary(filters);
}

export async function createSubmission(input: CreateSubmissionInput): Promise<FormSubmissionRecord> {
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

export async function getSubmissionOrFail(id: string): Promise<FormSubmissionRecord> {
  const submission = await getFormSubmissionById(id);
  if (!submission) {
    throw new NotFoundError('Form submission not found');
  }
  return submission;
}

export async function updateSubmission(id: string, params: UpdateSubmissionParams): Promise<FormSubmissionRecord> {
  await getSubmissionOrFail(id);
  return updateFormSubmissionRepository(id, params);
}
