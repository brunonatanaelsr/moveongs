import { hash } from 'bcryptjs';
import { AppError } from '../../shared/errors';
import type { RoleAssignment, UserRecord } from './repository';
import { createUser as createUserRepository, getUserByEmailWithPassword, listUsers } from './repository';

const SALT_ROUNDS = 12;

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

  const passwordHash = await hash(input.password, SALT_ROUNDS);
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
