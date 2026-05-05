import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
  updatedAt?: string;
  ownerId?: string;
  ownerName?: string;
  published?: boolean;
  publishedAt?: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
    ownerId?: string;
    ownerName?: string;
    published?: boolean;
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const existing = await readClassroom(data.id);
  const now = new Date().toISOString();
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ownerId: data.ownerId ?? existing?.ownerId,
    ownerName: data.ownerName ?? existing?.ownerName,
    published: data.published ?? existing?.published ?? false,
    publishedAt: existing?.publishedAt,
  };

  await ensureClassroomsDir();
  const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}

export async function updateClassroomPublishState(
  id: string,
  published: boolean,
): Promise<PersistedClassroomData> {
  const classroom = await readClassroom(id);
  if (!classroom) {
    throw new Error('Classroom not found');
  }
  const now = new Date().toISOString();
  const updated: PersistedClassroomData = {
    ...classroom,
    published,
    publishedAt: published ? classroom.publishedAt || now : undefined,
    updatedAt: now,
  };
  await writeJsonFileAtomic(path.join(CLASSROOMS_DIR, `${id}.json`), updated);
  return updated;
}

export async function listPublishedClassrooms(): Promise<PersistedClassroomData[]> {
  await ensureClassroomsDir();
  const entries = await fs.readdir(CLASSROOMS_DIR, { withFileTypes: true });
  const classrooms = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const id = entry.name.replace(/\.json$/, '');
        return readClassroom(id);
      }),
  );
  return classrooms
    .filter((item): item is PersistedClassroomData => !!item?.published)
    .sort((a, b) =>
      (b.publishedAt || b.updatedAt || '').localeCompare(a.publishedAt || a.updatedAt || ''),
    );
}
