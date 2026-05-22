import { useEffect } from 'react';
import { useRoleStore } from '@/stores/role-store';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase';
import type { UserRole } from '@content-hub/shared';

/**
 * Loads the current user's global role (owner | member) into the role store.
 */
export function useRole() {
  const { role, loading, setRole, setLoading } = useRoleStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    async function loadRole() {
      const client = getSupabaseClient();
      if (!client) return;

      setLoading(true);
      try {
        const { data } = await client
          .from('user_roles')
          .select('role')
          .eq('user_id', user!.id)
          .maybeSingle();

        setRole((data?.role as UserRole | undefined) ?? null);
      } catch (err) {
        console.error('Error loading user role:', err);
        setRole(null);
      } finally {
        setLoading(false);
      }
    }

    void loadRole();
  }, [user, setRole, setLoading]);

  return { role, loading };
}
