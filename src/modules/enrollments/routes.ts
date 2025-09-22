import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  attendanceQuerySchema,
  createEnrollmentBodySchema,
  enrollmentIdParamSchema,
  listEnrollmentQuerySchema,
  recordAttendanceBodySchema,
  updateEnrollmentBodySchema,
} from './schemas';
import {
  createEnrollment,
  getAttendance,
  listEnrollments,
  recordAttendance,
  updateEnrollment,
} from './service';

const ENROLLMENT_WRITE_ROLES = ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao'];
const ENROLLMENT_READ_ROLES = ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro'];

export const enrollmentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/enrollments', {
    preHandler: [app.authenticate, app.authorize(ENROLLMENT_WRITE_ROLES)],
  }, async (request, reply) => {
    const parsedBody = createEnrollmentBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const enrollment = await createEnrollment({
      ...parsedBody.data,
      agreementAcceptance: parsedBody.data.agreementAcceptance ?? null,
    });

    return reply.code(201).send({ enrollment });
  });

  app.get('/enrollments', {
    preHandler: [app.authenticate, app.authorize(ENROLLMENT_READ_ROLES)],
  }, async (request) => {
    const parsedQuery = listEnrollmentQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw new AppError('Invalid query', 400, parsedQuery.error.flatten());
    }

    const data = await listEnrollments(parsedQuery.data);

    return {
      data,
      meta: {
        limit: parsedQuery.data.limit ?? 50,
        offset: parsedQuery.data.offset ?? 0,
        count: data.length,
      },
    };
  });

  app.patch('/enrollments/:id', {
    preHandler: [app.authenticate, app.authorize(ENROLLMENT_WRITE_ROLES)],
  }, async (request) => {
    const parsedParams = enrollmentIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = updateEnrollmentBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const enrollment = await updateEnrollment(parsedParams.data.id, parsedBody.data);
    return { enrollment };
  });

  app.post('/enrollments/:id/attendance', {
    preHandler: [app.authenticate, app.authorize(ENROLLMENT_WRITE_ROLES)],
  }, async (request, reply) => {
    const parsedParams = enrollmentIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = recordAttendanceBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const attendance = await recordAttendance({
      enrollmentId: parsedParams.data.id,
      date: parsedBody.data.date,
      present: parsedBody.data.present,
      justification: parsedBody.data.justification ?? null,
      recordedBy: request.user?.sub,
    });

    return reply.code(201).send({ attendance });
  });

  app.get('/enrollments/:id/attendance', {
    preHandler: [app.authenticate, app.authorize(ENROLLMENT_READ_ROLES)],
  }, async (request) => {
    const parsedParams = enrollmentIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedQuery = attendanceQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw new AppError('Invalid query', 400, parsedQuery.error.flatten());
    }

    const attendance = await getAttendance({
      enrollmentId: parsedParams.data.id,
      startDate: parsedQuery.data.startDate,
      endDate: parsedQuery.data.endDate,
    });

    return { data: attendance };
  });
};
