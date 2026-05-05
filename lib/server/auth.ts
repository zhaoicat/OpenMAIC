import { promises as fs } from 'fs';
import path from 'path';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { PublicUser, RolePermissions, UserRole } from '@/lib/types/auth';

const AUTH_DIR = path.join(process.cwd(), 'data', 'auth');
const USERS_FILE = path.join(AUTH_DIR, 'users.json');
const SESSION_COOKIE = 'openmaic_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface UserRecord extends PublicUser {
  passwordHash: string;
  passwordSalt: string;
}

interface UsersFile {
  users: UserRecord[];
}

async function ensureAuthDir() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
}

async function readUsersFile(): Promise<UsersFile> {
  try {
    const content = await fs.readFile(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(content) as UsersFile;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { users: [] };
    }
    throw error;
  }
}

async function writeUsersFile(data: UsersFile) {
  await ensureAuthDir();
  const tempFile = `${USERS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempFile, USERS_FILE);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.OPENAI_API_KEY || 'openmaic-dev-session';
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function signSessionPayload(payload: string) {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function createSessionToken(userId: string) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${signSessionPayload(payload)}`;
}

function verifySessionToken(token?: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresAtText, signature] = parts;
  const expiresAt = Number(expiresAtText);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const payload = `${userId}.${expiresAtText}`;
  const expected = signSessionPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return userId;
}

export async function registerUser(input: {
  email: string;
  name?: string;
  password: string;
}): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('请输入有效邮箱');
  }
  if (password.length < 6) {
    throw new Error('密码至少需要 6 位');
  }

  const data = await readUsersFile();
  if (data.users.some((user) => user.email === email)) {
    throw new Error('该邮箱已注册');
  }

  const now = new Date().toISOString();
  const role: UserRole = data.users.length === 0 ? 'admin' : 'user';
  const passwordSalt = randomBytes(16).toString('hex');
  const user: UserRecord = {
    id: randomBytes(16).toString('hex'),
    email,
    name: input.name?.trim() || email.split('@')[0],
    role,
    createdAt: now,
    passwordSalt,
    passwordHash: hashPassword(password, passwordSalt),
  };
  data.users.push(user);
  await writeUsersFile(data);
  return toPublicUser(user);
}

export async function verifyUserCredentials(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const data = await readUsersFile();
  const user = data.users.find((item) => item.email === email);
  if (!user) return null;

  const passwordHash = hashPassword(password, user.passwordSalt);
  const actualBuffer = Buffer.from(passwordHash, 'hex');
  const expectedBuffer = Buffer.from(user.passwordHash, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(actualBuffer, expectedBuffer) ? toPublicUser(user) : null;
}

export async function getCurrentUser(request: NextRequest): Promise<PublicUser | null> {
  const userId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const data = await readUsersFile();
  const user = data.users.find((item) => item.id === userId);
  return user ? toPublicUser(user) : null;
}

export function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function canManageOwnedResource(
  user: PublicUser | null,
  ownerId?: string,
): user is PublicUser {
  if (!user) return false;
  return user.role === 'admin' || !ownerId || ownerId === user.id;
}

export function getRolePermissions(user: PublicUser | null): RolePermissions {
  if (!user) {
    return {
      role: 'guest',
      canEdit: false,
      canPublish: false,
      canManageModels: false,
      canManageAllWorks: false,
    };
  }

  const isAdmin = user.role === 'admin';
  return {
    role: user.role,
    canEdit: true,
    canPublish: true,
    canManageModels: isAdmin,
    canManageAllWorks: isAdmin,
  };
}
