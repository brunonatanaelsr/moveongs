import fs from 'node:fs';
import path from 'node:path';

type VaultContents = Record<string, string>;

let cachedVault: VaultContents | null = null;

function loadVaultFromDisk(filePath: string): VaultContents {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const contents = fs.readFileSync(absolutePath, 'utf-8');

    try {
      const parsed = JSON.parse(contents) as VaultContents;
      return parsed;
    } catch {
      const entries = contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map((line) => {
          const [key, ...rest] = line.split('=');
          return [key.trim(), rest.join('=').trim()] as const;
        })
        .filter(([key]) => key.length > 0);

      return Object.fromEntries(entries);
    }
  } catch (error) {
    console.warn('failed to load secret vault file', error);
    return {};
  }
}

function getVault(): VaultContents {
  if (cachedVault) {
    return cachedVault;
  }

  const vaultPath = process.env.SECRET_VAULT_PATH;
  if (!vaultPath) {
    cachedVault = {};
    return cachedVault;
  }

  cachedVault = loadVaultFromDisk(vaultPath);
  return cachedVault;
}

export function hydrateProcessEnvFromVault(): void {
  const vault = getVault();

  for (const [key, value] of Object.entries(vault)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function getSecretFromVault(key: string): string | undefined {
  const vault = getVault();
  return vault[key];
}

export function clearVaultCache(): void {
  cachedVault = null;
}
