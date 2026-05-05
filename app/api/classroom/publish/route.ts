import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  readClassroom,
  updateClassroomPublishState,
} from '@/lib/server/classroom-storage';
import { canManageOwnedResource, getCurrentUser } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; published?: boolean };
    if (!body.id) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'id is required');
    }
    if (!isValidClassroomId(body.id)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return apiError('INVALID_REQUEST', 401, '请先登录');
    }

    const classroom = await readClassroom(body.id);
    if (!classroom) {
      return apiError('INVALID_REQUEST', 404, 'Classroom not found');
    }
    if (!canManageOwnedResource(user, classroom.ownerId)) {
      return apiError('INVALID_REQUEST', 403, '没有权限发布该作品');
    }

    const updated = await updateClassroomPublishState(body.id, body.published !== false);
    return apiSuccess({
      classroom: updated,
      url: `${buildRequestOrigin(request)}/classroom/${updated.id}`,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      '发布状态更新失败',
      error instanceof Error ? error.message : String(error),
    );
  }
}
