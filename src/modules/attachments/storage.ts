import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getEnv } from '../../config/env';

let uploadsDir: string | null = null;

async function ensureDirExists(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function getUploadsDir(): Promise<string> {
  if (!uploadsDir) {
    const env = getEnv();
    const base = env.UPLOADS_DIR ?? 'tmp/uploads';
    uploadsDir = path.isAbsolute(base) ? base : path.resolve(process.cwd(), base);
    await ensureDirExists(uploadsDir);
  }

  return uploadsDir;
}

export async function saveFile(buffer: Buffer, originalName?: string | null): Promise<{ filePath: string; fileName: string }> {
  const dir = await getUploadsDir();
  const ext = originalName ? path.extname(originalName) : '';
  const fileName = `${randomUUID()}${ext}`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, buffer);
  return { filePath, fileName };
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export async function readFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}
