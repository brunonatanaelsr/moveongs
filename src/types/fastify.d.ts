import 'fastify';
import '@fastify/jwt';

type AuthorizationRequirement =
  | string
  | string[]
  | {
      roles?: string[];
      permissions?: string[];
      strategy?: 'any' | 'all';
    };

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: import('fastify').preHandlerHookHandler;
    authorize: (requirement: AuthorizationRequirement) => import('fastify').preHandlerHookHandler;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      name: string;
      roles: string[];
      projectScopes: string[];
      permissions: string[];
    };
    user: {
      sub: string;
      email: string;
      name: string;
      roles: string[];
      projectScopes: string[];
      permissions: string[];
    };
  }
}
