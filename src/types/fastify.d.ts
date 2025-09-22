import 'fastify';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: import('fastify').preHandlerHookHandler;
    authorize: (roles: string[]) => import('fastify').preHandlerHookHandler;
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
    };
    user: {
      sub: string;
      email: string;
      name: string;
      roles: string[];
      projectScopes: string[];
    };
  }
}
