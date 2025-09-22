import { z } from 'zod';

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable();

const householdMemberSchema = z.object({
  name: z.string().min(1).optional().nullable(),
  birthDate: optionalDate,
  works: z.boolean().optional().nullable(),
  income: z.number().nonnegative().optional().nullable(),
  schooling: z.string().optional().nullable(),
  relationship: z.string().optional().nullable(),
});

export const createBeneficiaryBodySchema = z.object({
  code: z.string().min(1).optional().nullable(),
  fullName: z.string().min(3),
  birthDate: optionalDate,
  cpf: z.string().min(5).optional().nullable(),
  rg: z.string().optional().nullable(),
  rgIssuer: z.string().optional().nullable(),
  rgIssueDate: optionalDate,
  nis: z.string().optional().nullable(),
  phone1: z.string().optional().nullable(),
  phone2: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
  reference: z.string().optional().nullable(),
  householdMembers: z.array(householdMemberSchema).default([]),
  vulnerabilities: z.array(z.string()).default([]),
});

export const updateBeneficiaryBodySchema = createBeneficiaryBodySchema.partial();

export const beneficiaryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listBeneficiaryQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

export type CreateBeneficiaryBody = z.infer<typeof createBeneficiaryBodySchema>;
export type UpdateBeneficiaryBody = z.infer<typeof updateBeneficiaryBodySchema>;
export type ListBeneficiaryQuery = z.infer<typeof listBeneficiaryQuerySchema>;
