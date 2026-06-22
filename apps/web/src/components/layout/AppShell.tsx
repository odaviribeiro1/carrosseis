import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  LogOut,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useRole } from '@/hooks/use-role';
import { useRoleStore } from '@/stores/role-store';

interface AppShellProps {
  children: ReactNode;
}

const baseNavItems = [
  { href: '/', label: 'Meu Painel', icon: LayoutDashboard },
  { href: '/create', label: 'Novo Carrossel', icon: PlusCircle },
];

const settingsNavItem = { href: '/settings', label: 'Configuracoes', icon: Settings };

export function AppShell({ children }: AppShellProps) {
  const { signOut } = useAuth();
  const location = useLocation();
  useRole(); // hydrate role store
  const { role } = useRoleStore();
  const navItems = role === 'owner'
    ? [...baseNavItems, settingsNavItem]
    : [...baseNavItems];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col glass-sidebar">
        {/* Logo */}
        <div className="flex h-14 items-center px-4">
          <span className="text-lg font-bold text-[#F8FAFC]">Content Hub</span>
        </div>

        <div className="h-[1px] w-full bg-[rgba(59,130,246,0.08)]" />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? 'bg-[rgba(59,130,246,0.15)] text-[#3B82F6] border border-[rgba(59,130,246,0.25)] shadow-[0_0_20px_rgba(59,130,246,0.08)]'
                    : 'text-[#94A3B8] hover:bg-[rgba(59,130,246,0.06)] hover:text-[#F8FAFC] border border-transparent'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-[rgba(59,130,246,0.08)] p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-[#94A3B8] hover:text-[#F8FAFC]"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="h-full">{children}</div>
      </main>
    </div>
  );
}
