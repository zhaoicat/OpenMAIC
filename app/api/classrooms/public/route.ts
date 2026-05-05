import { apiSuccess } from '@/lib/server/api-response';
import { listPublishedClassrooms } from '@/lib/server/classroom-storage';

export async function GET() {
  const classrooms = await listPublishedClassrooms();
  return apiSuccess({
    classrooms: classrooms.map((classroom) => ({
      id: classroom.id,
      name: classroom.stage.name,
      description: classroom.stage.description,
      sceneCount: classroom.scenes.length,
      ownerName: classroom.ownerName,
      publishedAt: classroom.publishedAt,
      updatedAt: classroom.updatedAt,
    })),
  });
}
