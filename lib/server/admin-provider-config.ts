import { promises as fs } from 'fs';
import path from 'path';

export interface AdminProviderEntry {
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  proxy?: string;
}

export type AdminProviderSection =
  | 'providers'
  | 'tts'
  | 'asr'
  | 'pdf'
  | 'image'
  | 'video'
  | 'web-search';

export interface AdminProviderConfig {
  providers?: Record<string, AdminProviderEntry>;
  tts?: Record<string, AdminProviderEntry>;
  asr?: Record<string, AdminProviderEntry>;
  pdf?: Record<string, AdminProviderEntry>;
  image?: Record<string, AdminProviderEntry>;
  video?: Record<string, AdminProviderEntry>;
  'web-search'?: Record<string, AdminProviderEntry>;
}

const CONFIG_FILE = path.join(process.cwd(), 'data', 'admin', 'provider-config.json');

export async function readAdminProviderConfig(): Promise<AdminProviderConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AdminProviderConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeAdminProviderConfig(config: AdminProviderConfig) {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  const tempFile = `${CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(config, null, 2), 'utf-8');
  await fs.rename(tempFile, CONFIG_FILE);
}

export function maskAdminProviderConfig(config: AdminProviderConfig): AdminProviderConfig {
  const masked: AdminProviderConfig = {};
  for (const [section, entries] of Object.entries(config) as [
    AdminProviderSection,
    Record<string, AdminProviderEntry> | undefined,
  ][]) {
    if (!entries) continue;
    masked[section] = {};
    for (const [providerId, entry] of Object.entries(entries)) {
      masked[section]![providerId] = {
        ...entry,
        apiKey: entry.apiKey ? '********' : '',
      };
    }
  }
  return masked;
}

export function normalizeAdminEntry(input: AdminProviderEntry): AdminProviderEntry {
  const models = Array.isArray(input.models)
    ? input.models.map((model) => model.trim()).filter(Boolean)
    : undefined;
  return {
    apiKey: input.apiKey?.trim(),
    baseUrl: input.baseUrl?.trim(),
    models,
    proxy: input.proxy?.trim(),
  };
}
