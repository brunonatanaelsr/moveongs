import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const formVersionStatusSchema = z.enum(['active', 'inactive', 'deprecated']);

const formVersionSchema = z.object({
  version: z.string().min(1),
  status: formVersionStatusSchema.default('active'),
  mandatory: z.boolean().default(false),
  effectiveAt: z.string().optional(),
  schemaFile: z.string().min(1),
  notes: z.string().optional(),
});

const formRegistryEntrySchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  owner: z.string().min(1),
  versions: z.array(formVersionSchema).min(1),
});

const formRegistrySchema = z.object({
  registryVersion: z.string().min(1),
  updatedAt: z.string().optional(),
  forms: z.array(formRegistryEntrySchema),
});

export type FormVersionMetadata = z.infer<typeof formVersionSchema>;
export type FormRegistryEntry = z.infer<typeof formRegistryEntrySchema>;
export type FormRegistry = z.infer<typeof formRegistrySchema>;

let cachedRegistry: FormRegistry | null = null;

function resolveRegistryPath(): string {
  return path.resolve('artifacts/json_schemas/registry.json');
}

export async function loadFormRegistry(): Promise<FormRegistry> {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const registryPath = resolveRegistryPath();
  const raw = await fs.readFile(registryPath, 'utf8');
  const parsed = formRegistrySchema.parse(JSON.parse(raw));
  cachedRegistry = parsed;
  return parsed;
}

export async function getRegistryEntry(formType: string): Promise<FormRegistryEntry | null> {
  const registry = await loadFormRegistry();
  return registry.forms.find((entry) => entry.type === formType) ?? null;
}

export async function getRegistryVersion(
  formType: string,
  version: string,
): Promise<FormVersionMetadata | null> {
  const entry = await getRegistryEntry(formType);
  if (!entry) {
    return null;
  }

  return entry.versions.find((item) => item.version === version) ?? null;
}

export async function loadSchemaFromRegistry(formType: string, version: string): Promise<Record<string, unknown> | null> {
  const versionMeta = await getRegistryVersion(formType, version);
  if (!versionMeta) {
    return null;
  }

  const schemaPath = path.resolve('artifacts/json_schemas', versionMeta.schemaFile);
  const raw = await fs.readFile(schemaPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function listMandatoryForms(): Promise<Array<{ type: string; version: string }>> {
  const registry = await loadFormRegistry();
  const mandatory: Array<{ type: string; version: string }> = [];

  for (const form of registry.forms) {
    for (const version of form.versions) {
      if (version.mandatory && version.status === 'active') {
        mandatory.push({ type: form.type, version: version.version });
      }
    }
  }

  return mandatory;
}

export function clearRegistryCache() {
  cachedRegistry = null;
}
