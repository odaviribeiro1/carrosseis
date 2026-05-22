import { create } from 'zustand';
import type { UserRole } from '@content-hub/shared';

interface RoleState {
  role: UserRole | null;
  loading: boolean;
  setRole: (role: UserRole | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useRoleStore = create<RoleState>((set) => ({
  role: null,
  loading: true,
  setRole: (role) => set({ role }),
  setLoading: (loading) => set({ loading }),
}));
