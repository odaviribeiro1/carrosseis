import { Settings } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MembersPanel } from '@/pages/MembersPage';
import { CredentialsPanel } from '@/pages/settings/credentials';

type SettingsTab = 'members' | 'credentials';

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: SettingsTab = searchParams.get('tab') === 'credentials' ? 'credentials' : 'members';

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(59,130,246,0.12)] text-[#60A5FA]">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[28px] font-semibold text-[#F8FAFC]">Configuracoes</h1>
            <p className="mt-1 text-sm leading-[1.6] text-[#94A3B8]">
              Gerencie os membros da plataforma e as credenciais de aplicacao.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="mb-6">
            <TabsTrigger value="members">Membros</TabsTrigger>
            <TabsTrigger value="credentials">Credenciais</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <MembersPanel />
          </TabsContent>

          <TabsContent value="credentials">
            <CredentialsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
