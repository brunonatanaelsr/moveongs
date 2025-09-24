import path from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://imm:test@localhost:5432/imm_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1h';
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'tmp/test-uploads');
