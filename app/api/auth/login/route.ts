import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getRolePermissions, setSessionCookie, verifyUserCredentials } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  if (!body?.email || !body.password) {
    return apiError('MISSING_REQUIRED_FIELD', 400, '邮箱和密码必填');
  }

  const user = await verifyUserCredentials(body.email, body.password);
  if (!user) {
    return apiError('INVALID_REQUEST', 401, '邮箱或密码错误');
  }

  const response = apiSuccess({ user, permissions: getRolePermissions(user) });
  setSessionCookie(response, user.id);
  return response;
}
