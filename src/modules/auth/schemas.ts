import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const passwordForgotBodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
});

export const passwordResetBodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});
