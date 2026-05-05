import { type NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser, getRolePermissions } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  return apiSuccess({ user, permissions: getRolePermissions(user) });
}
