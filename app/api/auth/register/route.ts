import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getRolePermissions, registerUser, setSessionCookie } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; name?: string; password?: string };
    if (!body.email || !body.password) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '邮箱和密码必填');
    }

    const user = await registerUser({
      email: body.email,
      name: body.name,
      password: body.password,
    });
    const response = apiSuccess({ user, permissions: getRolePermissions(user) }, 201);
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return apiError('INVALID_REQUEST', 400, error instanceof Error ? error.message : '注册失败');
  }
}
