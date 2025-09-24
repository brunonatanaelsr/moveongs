import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/shared/errors';
import { createSubmission } from '../src/modules/forms/service';

const {
  createFormSubmissionMock,
  getTemplateByTypeAndVersionMock,
  getLatestActiveTemplateMock,
} = vi.hoisted(() => ({
  createFormSubmissionMock: vi.fn(),
  getTemplateByTypeAndVersionMock: vi.fn(),
  getLatestActiveTemplateMock: vi.fn(),
}));

vi.mock('../src/modules/forms/repository', () => ({
  createFormSubmission: createFormSubmissionMock,
  createFormTemplate: vi.fn(),
  getFormSubmissionById: vi.fn(),
  getLatestActiveTemplate: getLatestActiveTemplateMock,
  getTemplateById: vi.fn(),
  getTemplateByTypeAndVersion: getTemplateByTypeAndVersionMock,
  listFormTemplates: vi.fn(),
  listSubmissionsByBeneficiary: vi.fn(),
  updateFormSubmission: vi.fn(),
  updateFormTemplate: vi.fn(),
}));

vi.mock('../src/modules/beneficiaries/repository', () => ({
  getBeneficiaryById: vi.fn(),
}));

describe('form submission service', () => {
  const baseTemplate = {
    id: 'template-1',
    formType: 'anamnese_social',
    schemaVersion: 'v1',
    schema: {
      type: 'object',
      required: ['nome'],
      properties: {
        nome: { type: 'string' },
        idade: { type: 'number' },
      },
    },
    status: 'active',
    publishedAt: '2024-01-01T00:00:00.000Z',
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    getTemplateByTypeAndVersionMock.mockResolvedValue(baseTemplate);
    getLatestActiveTemplateMock.mockResolvedValue(baseTemplate);
  });

  it('valida payload conforme schema e rejeita dados inválidos', async () => {
    await expect(createSubmission({
      beneficiaryId: 'benef-1',
      formType: 'anamnese_social',
      schemaVersion: 'v1',
      payload: {},
    })).rejects.toBeInstanceOf(AppError);

    expect(createFormSubmissionMock).not.toHaveBeenCalled();
  });

  it('envia evidências de assinatura para o repositório ao criar submissão', async () => {
    const submissionRecord = {
      id: 'subm-1',
      beneficiaryId: 'benef-1',
      beneficiaryName: 'Maria',
      formType: 'anamnese_social',
      schemaVersion: 'v1',
      payload: { nome: 'Maria' },
      signedBy: ['Maria'],
      signedAt: ['2024-08-01T10:00:00.000Z'],
      attachments: [],
      signatureEvidence: [],
      createdAt: '2024-08-01T10:00:00.000Z',
      updatedAt: '2024-08-01T10:00:00.000Z',
      template: baseTemplate,
    };

    createFormSubmissionMock.mockResolvedValue(submissionRecord);

    const signatureEvidence = [
      {
        signer: 'Maria',
        capturedAt: '2024-08-01T10:00:00.000Z',
        method: 'assinatura_biometrica',
        ipAddress: '10.0.0.42',
        userAgent: 'MoveForms/1.0 (Android 13)',
        payloadHash: 'f'.repeat(64),
      },
    ];

    await createSubmission({
      beneficiaryId: 'benef-1',
      formType: 'anamnese_social',
      schemaVersion: 'v1',
      payload: { nome: 'Maria' },
      signedBy: ['Maria'],
      signedAt: ['2024-08-01T10:00:00.000Z'],
      signatureEvidence,
    });

    expect(createFormSubmissionMock).toHaveBeenCalledWith(expect.objectContaining({
      signatureEvidence,
    }));
  });
});
