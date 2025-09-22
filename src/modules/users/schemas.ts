import { z } from 'zod';

export const roleAssignmentSchema = z.object({
  slug: z.string().min(1, 'role slug is required'),
  projectId: z.string().uuid().optional().nullable(),
});

export const createUserBodySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  roles: z.array(roleAssignmentSchema).default([]),
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
