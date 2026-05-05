import { apiSuccess } from '@/lib/server/api-response';
import { clearSessionCookie } from '@/lib/server/auth';

export async function POST() {
  const response = apiSuccess({ ok: true });
  clearSessionCookie(response);
  return response;
}
