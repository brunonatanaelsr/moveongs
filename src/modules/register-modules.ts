import type { FastifyInstance } from 'fastify';

import { registerAuthDecorators } from './auth/plugin';
import { authRoutes } from './auth/routes';
import { healthRoutes } from './system/health.route';
import { beneficiaryRoutes } from './beneficiaries/routes';
import { userRoutes } from './users/routes';
import { projectRoutes } from './projects/routes';
import { enrollmentRoutes } from './enrollments/routes';

export async function registerModules(app: FastifyInstance) {
  await registerAuthDecorators(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(projectRoutes);
  await app.register(enrollmentRoutes);
  await app.register(beneficiaryRoutes);
}
