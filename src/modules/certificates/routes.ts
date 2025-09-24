import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { enrollmentIdParamSchema } from '../enrollments/schemas';
import {
  certificateIdParamSchema,
  issueCertificateBodySchema,
  listCertificatesQuerySchema,
} from './schemas';
import {
  getCertificateOrFail,
  issueCertificate,
  listCertificates,
  loadCertificateFile,
} from './service';

const CERTIFICATE_WRITE_ROLES = ['admin', 'coordenacao', 'tecnica'];
const CERTIFICATE_READ_ROLES = [
  'admin',
  'coordenacao',
  'tecnica',
  'educadora',
  'recepcao',
  'financeiro',
  'voluntaria',
  'leitura_externa',
  'beneficiaria',
];

const CERTIFICATE_ISSUE_REQUIREMENTS = {
  roles: CERTIFICATE_WRITE_ROLES,
  permissions: ['certificates:issue:project'],
} as const;

const CERTIFICATE_READ_REQUIREMENTS = {
  roles: CERTIFICATE_READ_ROLES,
  permissions: ['certificates:read:project', 'certificates:read:own'],
} as const;

export const certificateRoutes: FastifyPluginAsync = async (app) => {
  app.post('/enrollments/:id/certificates', {
    preHandler: [app.authenticate, app.authorize(CERTIFICATE_ISSUE_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsedParams = enrollmentIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = issueCertificateBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const allowedProjectIds = request.user.projectScopes && request.user.projectScopes.length > 0
      ? request.user.projectScopes
      : null;

    const certificate = await issueCertificate({
      enrollmentId: parsedParams.data.id,
      issuedBy: request.user?.sub ?? null,
      type: parsedBody.data.type,
      metadata: parsedBody.data.metadata ?? null,
      allowedProjectIds,
    });

    return reply.code(201).send({ certificate });
  });

  app.get('/enrollments/:id/certificates', {
    preHandler: [app.authenticate, app.authorize(CERTIFICATE_READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = enrollmentIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedQuery = listCertificatesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw new AppError('Invalid query', 400, parsedQuery.error.flatten());
    }

    const allowedProjectIds = request.user.projectScopes && request.user.projectScopes.length > 0
      ? request.user.projectScopes
      : null;

    const limit = parsedQuery.data.limit ?? 50;
    const offset = parsedQuery.data.offset ?? 0;

    const certificates = await listCertificates({
      enrollmentId: parsedParams.data.id,
      limit,
      offset,
      allowedProjectIds,
    });

    return {
      data: certificates,
      meta: {
        limit,
        offset,
        count: certificates.length,
      },
    };
  });

  app.get('/certificates/:id', {
    preHandler: [app.authenticate, app.authorize(CERTIFICATE_READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = certificateIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const certificate = await getCertificateOrFail(
      parsedParams.data.id,
      request.user.projectScopes && request.user.projectScopes.length > 0
        ? request.user.projectScopes
        : null,
    );
    return { certificate };
  });

  app.get('/certificates/:id/download', {
    preHandler: [app.authenticate, app.authorize(CERTIFICATE_READ_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsedParams = certificateIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const { metadata, buffer } = await loadCertificateFile(
      parsedParams.data.id,
      request.user.projectScopes && request.user.projectScopes.length > 0
        ? request.user.projectScopes
        : null,
    );

    reply.header('Content-Type', metadata.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
    return reply.send(buffer);
  });
};
