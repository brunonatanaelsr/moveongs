import type { FastifyInstance } from 'fastify';

import { registerAuthDecorators } from './auth/plugin';
import { authRoutes } from './auth/routes';
import { healthRoutes } from './system/health.route';
import { beneficiaryRoutes } from './beneficiaries/routes';
import { userRoutes } from './users/routes';
import { projectRoutes } from './projects/routes';
import { enrollmentRoutes } from './enrollments/routes';
import { certificateRoutes } from './certificates/routes';
import { analyticsRoutes } from './analytics/routes';
import { formRoutes } from './forms/routes';
import { consentRoutes } from './consents/routes';
import { attachmentRoutes } from './attachments/routes';
import { notificationRoutes } from './notifications/routes';
import { auditRoutes } from './audit/routes';
import { evolutionRoutes } from './evolutions/routes';
import { actionPlanRoutes } from './action-plans/routes';
import { timelineRoutes } from './timeline/routes';
import { feedRoutes } from './feed/routes';
import { messageRoutes } from './messages/routes';
import { privacyRoutes } from './privacy/routes';


export async function registerModules(app: FastifyInstance) {
  await registerAuthDecorators(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(projectRoutes);
  await app.register(enrollmentRoutes);
  await app.register(certificateRoutes);
  await app.register(analyticsRoutes);
  await app.register(feedRoutes);
  await app.register(messageRoutes);
  await app.register(beneficiaryRoutes);
  await app.register(formRoutes);
  await app.register(consentRoutes);
  await app.register(attachmentRoutes);
  await app.register(notificationRoutes);
  await app.register(auditRoutes);
  await app.register(evolutionRoutes);
  await app.register(actionPlanRoutes);
  await app.register(timelineRoutes);
  await app.register(privacyRoutes);


}
