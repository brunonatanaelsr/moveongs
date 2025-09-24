import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { beneficiaryIdParamSchema } from '../beneficiaries/schemas';
import {
  createFormSubmissionBodySchema,
  createFormTemplateBodySchema,
  listBeneficiaryFormsQuerySchema,
  listFormTemplatesQuerySchema,
  submissionIdParamSchema,
  updateFormSubmissionBodySchema,
  updateFormTemplateBodySchema,
} from './schemas';
import {
  createFormTemplate,
  createSubmission,
  getFormTemplateOrFail,
  getSubmissionOrFail,
  listFormTemplates,
  listSubmissions,
  generateSubmissionPdf,
  updateFormTemplate,
  updateSubmission,
} from './service';
import type { UpdateSubmissionParams } from './types';

const TEMPLATE_READ_REQUIREMENTS = { roles: ['admin', 'coordenacao', 'tecnica'], permissions: ['form_submissions:read'] } as const;
const TEMPLATE_WRITE_REQUIREMENTS = { roles: ['admin', 'coordenacao'], permissions: ['form_submissions:create'] } as const;
const SUBMISSION_READ_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro', 'voluntaria', 'leitura_externa'],
  permissions: ['form_submissions:read', 'form_submissions:read:own'],
} as const;
const SUBMISSION_CREATE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao'],
  permissions: ['form_submissions:create'],
} as const;
const SUBMISSION_UPDATE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica'],
  permissions: ['form_submissions:update'],
} as const;

export const formRoutes: FastifyPluginAsync = async (app) => {
  app.get('/form-templates', {
    preHandler: [app.authenticate, app.authorize(TEMPLATE_READ_REQUIREMENTS)],
  }, async (request) => {
    const parsed = listFormTemplatesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError('Invalid query', 400, parsed.error.flatten());
    }

    const templates = await listFormTemplates(parsed.data);
    return { data: templates };
  });

  app.post('/form-templates', {
    preHandler: [app.authenticate, app.authorize(TEMPLATE_WRITE_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsed = createFormTemplateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid body', 400, parsed.error.flatten());
    }

    const template = await createFormTemplate(parsed.data);
    return reply.code(201).send({ template });
  });

  app.get('/form-templates/:id', {
    preHandler: [app.authenticate, app.authorize(TEMPLATE_READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = submissionIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const template = await getFormTemplateOrFail(parsedParams.data.id);
    return { template };
  });

  app.patch('/form-templates/:id', {
    preHandler: [app.authenticate, app.authorize(TEMPLATE_WRITE_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = submissionIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = updateFormTemplateBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const template = await updateFormTemplate(parsedParams.data.id, parsedBody.data);
    return { template };
  });

  app.get('/beneficiaries/:id/forms', {
    preHandler: [app.authenticate, app.authorize(SUBMISSION_READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = beneficiaryIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedQuery = listBeneficiaryFormsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw new AppError('Invalid query', 400, parsedQuery.error.flatten());
    }

    const allowedProjectIds = request.user.projectScopes && request.user.projectScopes.length > 0
      ? request.user.projectScopes
      : null;

    const limit = parsedQuery.data.limit ?? 25;
    const offset = parsedQuery.data.offset ?? 0;

    const submissions = await listSubmissions({
      beneficiaryId: parsedParams.data.id,
      formType: parsedQuery.data.formType,
      limit,
      offset,
      allowedProjectIds,
    });

    return {
      data: submissions,
      meta: {
        limit,
        offset,
        count: submissions.length,
      },
    };
  });

  app.post('/beneficiaries/:id/forms', {
    preHandler: [app.authenticate, app.authorize(SUBMISSION_CREATE_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsedParams = beneficiaryIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = createFormSubmissionBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const submission = await createSubmission({
      beneficiaryId: parsedParams.data.id,
      formType: parsedBody.data.formType,
      schemaVersion: parsedBody.data.schemaVersion,
      payload: parsedBody.data.payload,
      signedBy: parsedBody.data.signedBy,
      signedAt: parsedBody.data.signedAt,
      attachments: parsedBody.data.attachments,
      createdBy: request.user?.sub ?? null,
    }, request.user.projectScopes && request.user.projectScopes.length > 0 ? request.user.projectScopes : null);

    return reply.code(201).send({ submission });
  });

  app.get('/forms/:id', {
    preHandler: [app.authenticate, app.authorize(SUBMISSION_READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = submissionIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const submission = await getSubmissionOrFail(
      parsedParams.data.id,
      request.user.projectScopes && request.user.projectScopes.length > 0
        ? request.user.projectScopes
        : null,
    );
    return { submission };
  });

  app.get('/forms/:id/pdf', {
    preHandler: [app.authenticate, app.authorize(SUBMISSION_READ_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsedParams = submissionIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const { buffer, filename } = await generateSubmissionPdf(
      parsedParams.data.id,
      request.user.projectScopes && request.user.projectScopes.length > 0
        ? request.user.projectScopes
        : null,
    );
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(buffer);
  });

  app.patch('/forms/:id', {
    preHandler: [app.authenticate, app.authorize(SUBMISSION_UPDATE_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = submissionIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = updateFormSubmissionBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const hasFields = ['payload', 'signedBy', 'signedAt', 'attachments'].some((key) =>
      Object.prototype.hasOwnProperty.call(parsedBody.data, key),
    );

    if (!hasFields) {
      throw new AppError('No fields provided for update', 400);
    }

    const updateData: UpdateSubmissionParams = {};

    if (Object.prototype.hasOwnProperty.call(parsedBody.data, 'payload')) {
      updateData.payload = parsedBody.data.payload;
    }

    if (Object.prototype.hasOwnProperty.call(parsedBody.data, 'signedBy')) {
      updateData.signedBy = parsedBody.data.signedBy ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(parsedBody.data, 'signedAt')) {
      updateData.signedAt = parsedBody.data.signedAt ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(parsedBody.data, 'attachments')) {
      updateData.attachments = parsedBody.data.attachments ?? null;
    }

    const submission = await updateSubmission(
      parsedParams.data.id,
      updateData,
      request.user.projectScopes && request.user.projectScopes.length > 0
        ? request.user.projectScopes
        : null,
    );
    return { submission };
  });
};
