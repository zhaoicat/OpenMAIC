import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser } from '@/lib/server/auth';
import {
  type AdminProviderConfig,
  type AdminProviderEntry,
  type AdminProviderSection,
  maskAdminProviderConfig,
  normalizeAdminEntry,
  readAdminProviderConfig,
  writeAdminProviderConfig,
} from '@/lib/server/admin-provider-config';
import { clearServerProviderConfigCache } from '@/lib/server/provider-config';

const VALID_SECTIONS = new Set<AdminProviderSection>([
  'providers',
  'tts',
  'asr',
  'pdf',
  'image',
  'video',
  'web-search',
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (user?.role !== 'admin') {
    return apiError('INVALID_REQUEST', 403, '需要管理员权限');
  }
  const config = await readAdminProviderConfig();
  return apiSuccess({ config: maskAdminProviderConfig(config) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (user?.role !== 'admin') {
    return apiError('INVALID_REQUEST', 403, '需要管理员权限');
  }

  const body = (await request.json().catch(() => null)) as {
    section?: AdminProviderSection;
    providerId?: string;
    config?: AdminProviderEntry;
    remove?: boolean;
  } | null;
  if (!body?.section || !VALID_SECTIONS.has(body.section) || !body.providerId) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'section 和 providerId 必填');
  }

  const providerId = body.providerId.trim();
  if (!providerId || !/^[a-zA-Z0-9_-]+$/.test(providerId)) {
    return apiError('INVALID_REQUEST', 400, 'providerId 格式不正确');
  }

  const current = await readAdminProviderConfig();
  const section = body.section;
  const next: AdminProviderConfig = { ...current, [section]: { ...(current[section] || {}) } };
  if (body.remove) {
    delete next[section]?.[providerId];
  } else {
    const existing = current[section]?.[providerId];
    const normalized = normalizeAdminEntry(body.config || {});
    next[section]![providerId] = {
      ...normalized,
      apiKey: normalized.apiKey || existing?.apiKey,
    };
  }

  await writeAdminProviderConfig(next);
  clearServerProviderConfigCache();
  return apiSuccess({ config: maskAdminProviderConfig(next) });
}
