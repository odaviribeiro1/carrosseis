import { type ReactNode } from 'react';
import { useRoleStore } from '@/stores/role-store';
import type { UserRole } from '@content-hub/shared';

const roleHierarchy: Record<UserRole, number> = {
  member: 0,
  owner: 1,
};

interface RoleGuardProps {
  minRole: UserRole;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only if the user has the minimum required role.
 */
export function RoleGuard({ minRole, children, fallback }: RoleGuardProps) {
  const { role } = useRoleStore();

  if (!role) return fallback ? <>{fallback}</> : null;

  if (roleHierarchy[role] < roleHierarchy[minRole]) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
