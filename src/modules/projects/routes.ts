import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  cohortIdParamSchema,
  createCohortBodySchema,
  createProjectBodySchema,
  listProjectsQuerySchema,
  projectIdParamSchema,
  updateProjectBodySchema,
} from './schemas';
import {
  createCohort,
  createProject,
  getProjectOrFail,
  listCohorts,
  listProjects,
  updateProject,
} from './service';

type FastifyDecorators = import('fastify').FastifyInstance;

const PROJECT_READ_ROLES = ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'voluntaria', 'financeiro'];
const PROJECT_WRITE_ROLES = ['admin', 'coordenacao'];
const COHORT_WRITE_ROLES = ['admin', 'coordenacao'];

export const projectRoutes: FastifyPluginAsync = async (app: FastifyDecorators) => {
  app.get('/projects', {
    preHandler: [app.authenticate, app.authorize(PROJECT_READ_ROLES)],
  }, async (request) => {
    const parsedQuery = listProjectsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw new AppError('Invalid query', 400, parsedQuery.error.flatten());
    }

    const projects = await listProjects(parsedQuery.data);
    return { data: projects };
  });

  app.post('/projects', {
    preHandler: [app.authenticate, app.authorize(PROJECT_WRITE_ROLES)],
  }, async (request, reply) => {
    const parsedBody = createProjectBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const project = await createProject(parsedBody.data);
    return reply.code(201).send({ project });
  });

  app.get('/projects/:id', {
    preHandler: [app.authenticate, app.authorize(PROJECT_READ_ROLES)],
  }, async (request) => {
    const parsedParams = projectIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const project = await getProjectOrFail(parsedParams.data.id);
    return { project };
  });

  app.patch('/projects/:id', {
    preHandler: [app.authenticate, app.authorize(PROJECT_WRITE_ROLES)],
  }, async (request) => {
    const parsedParams = projectIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = updateProjectBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const project = await updateProject(parsedParams.data.id, parsedBody.data);
    return { project };
  });

  app.post('/projects/:id/cohorts', {
    preHandler: [app.authenticate, app.authorize(COHORT_WRITE_ROLES)],
  }, async (request, reply) => {
    const parsedParams = projectIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = createCohortBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const cohort = await createCohort(parsedParams.data.id, parsedBody.data);
    return reply.code(201).send({ cohort });
  });

  app.get('/projects/:id/cohorts', {
    preHandler: [app.authenticate, app.authorize(PROJECT_READ_ROLES)],
  }, async (request) => {
    const parsedParams = projectIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const cohorts = await listCohorts(parsedParams.data.id);
    return { data: cohorts };
  });
};
