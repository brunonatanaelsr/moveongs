import { compare } from 'bcryptjs';
import { UnauthorizedError } from '../../shared/errors';
import { getUserByEmailWithPassword, type PermissionGrant } from '../users/repository';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  roles: { slug: string; projectId?: string | null }[];
  permissions: PermissionGrant[];
};

export async function validateCredentials(email: string, password: string): Promise<AuthenticatedUser> {
  const user = await getUserByEmailWithPassword(email);

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordMatches = await compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid credentials');
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
  };
}
