import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { beneficiaryIdParamSchema } from '../beneficiaries/schemas';
import {
  consentIdParamSchema,
  createConsentBodySchema,
  listConsentQuerySchema,
  updateConsentBodySchema,
} from './schemas';
import { getConsentOrFail, listConsents, registerConsent, updateExistingConsent } from './service';

const READ_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'recepcao', 'financeiro', 'voluntaria', 'leitura_externa'],
  permissions: ['consents:read', 'consents:read:own'],
} as const;
const WRITE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'recepcao'],
  permissions: ['consents:create'],
} as const;
const UPDATE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica'],
  permissions: ['consents:update'],
} as const;

export const consentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/beneficiaries/:id/consents', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const beneficiaryParams = beneficiaryIdParamSchema.safeParse(request.params);
    if (!beneficiaryParams.success) {
      throw new AppError('Invalid params', 400, beneficiaryParams.error.flatten());
    }

    const query = listConsentQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError('Invalid query', 400, query.error.flatten());
    }

    const consents = await listConsents({
      beneficiaryId: beneficiaryParams.data.id,
      type: query.data.type,
      includeRevoked: query.data.includeRevoked,
    });

    return { data: consents };
  });

  app.post('/beneficiaries/:id/consents', {
    preHandler: [app.authenticate, app.authorize(WRITE_REQUIREMENTS)],
  }, async (request, reply) => {
    const beneficiaryParams = beneficiaryIdParamSchema.safeParse(request.params);
    if (!beneficiaryParams.success) {
      throw new AppError('Invalid params', 400, beneficiaryParams.error.flatten());
    }

    const body = createConsentBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const consent = await registerConsent({
      beneficiaryId: beneficiaryParams.data.id,
      type: body.data.type,
      textVersion: body.data.textVersion,
      granted: body.data.granted,
      grantedAt: body.data.grantedAt,
      evidence: body.data.evidence,
      userId: request.user?.sub ?? null,
    });

    return reply.code(201).send({ consent });
  });

  app.get('/consents/:id', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const params = consentIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const consent = await getConsentOrFail(params.data.id);
    return { consent };
  });

  app.patch('/consents/:id', {
    preHandler: [app.authenticate, app.authorize(UPDATE_REQUIREMENTS)],
  }, async (request) => {
    const params = consentIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const body = updateConsentBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const consent = await updateExistingConsent(params.data.id, {
      textVersion: body.data.textVersion,
      granted: body.data.granted,
      grantedAt: body.data.grantedAt,
      revokedAt: body.data.revokedAt,
      evidence: body.data.evidence,
      userId: request.user?.sub ?? null,
    });

    return { consent };
  });
};
