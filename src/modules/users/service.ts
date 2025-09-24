import { hash } from 'bcryptjs';
import { AppError } from '../../shared/errors';
import type { RoleAssignment, UserRecord } from './repository';
import { createUser as createUserRepository, getUserByEmailWithPassword, listUsers } from './repository';

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, SALT_ROUNDS);
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  roles: RoleAssignment[];
};

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const existing = await getUserByEmailWithPassword(input.email);

  if (existing) {
    throw new AppError('Email already in use', 409);
  }

  const passwordHash = await hashPassword(input.password);
  const roles = input.roles.map((role) => ({ slug: role.slug, projectId: role.projectId ?? null }));

  return createUserRepository({
    name: input.name,
    email: input.email,
    passwordHash,
    roles,
  });
}

export async function listAllUsers(): Promise<UserRecord[]> {
  return listUsers();
}
