export type UserRole = 'admin' | 'user';
export type AccessRole = UserRole | 'guest';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface RolePermissions {
  role: AccessRole;
  canEdit: boolean;
  canPublish: boolean;
  canManageModels: boolean;
  canManageAllWorks: boolean;
}
