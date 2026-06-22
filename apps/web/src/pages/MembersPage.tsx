import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2, Copy, Mail, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase';
import type { UserRole } from '@content-hub/shared';

interface Member {
  user_id: string;
  role: UserRole;
}

interface Invite {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  created_at: string;
}

const roleLabels: Record<UserRole, string> = {
  owner: 'Owner',
  member: 'Membro',
};

export function MembersPanel() {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const { data } = await client.from('user_roles').select('user_id, role');
    if (data) setMembers(data as Member[]);
  }, []);

  const loadInvites = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const { data } = await client
      .from('invites')
      .select('id, email, token, expires_at, created_at')
      .is('used_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    if (data) setInvites(data as Invite[]);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadMembers(), loadInvites()]);
    setLoading(false);
  }, [loadInvites, loadMembers]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function removeMember(userId: string) {
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.from('user_roles').delete().eq('user_id', userId);
    if (error) {
      toast.error('Erro ao remover membro');
      return;
    }
    toast.success('Membro removido');
    void loadMembers();
  }

  async function createInvite() {
    const client = getSupabaseClient();
    if (!client) return;
    if (!inviteEmail.trim()) {
      toast.error('Email obrigatorio');
      return;
    }

    setCreatingInvite(true);
    try {
      const { data, error } = await client.functions.invoke('create-invite', {
        body: { email: inviteEmail.trim() },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Erro ao criar convite');

      toast.success(
        data.email_sent
          ? 'Convite criado e enviado por email'
          : 'Convite criado. Copie o link e envie manualmente.',
      );
      setInviteEmail('');
      void loadInvites();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar convite';
      toast.error(msg);
    } finally {
      setCreatingInvite(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { data, error } = await client.functions.invoke('revoke-invite', {
        body: { invite_id: inviteId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Erro ao revogar');
      toast.success('Convite revogado');
      void loadInvites();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao revogar convite';
      toast.error(msg);
    }
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite?token=${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Link copiado'))
      .catch(() => toast.error('Erro ao copiar'));
  }

  return (
    <>
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm text-[#94A3B8]">
          Self-signup esta fechado. Apenas o owner pode convidar novos membros.
        </p>

        <RoleGuard minRole="owner">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Convidar novo membro</CardTitle>
              <CardDescription>
                Convites valem por 7 dias. O email de cadastro precisa coincidir com o convidado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="invite-email" className="sr-only">
                    Email
                  </Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={creatingInvite}
                  />
                </div>
                <Button onClick={() => void createInvite()} disabled={creatingInvite}>
                  {creatingInvite ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Convidar
                </Button>
              </div>
            </CardContent>
          </Card>

          {invites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Convites pendentes</CardTitle>
                <CardDescription>
                  {invites.length} convite{invites.length !== 1 ? 's' : ''} aguardando uso
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between rounded-xl border border-[rgba(59,130,246,0.12)] bg-[rgba(59,130,246,0.04)] px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#F8FAFC]">{invite.email}</p>
                        <p className="text-xs text-[#94A3B8]">
                          Expira em {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Copiar link"
                          onClick={() => copyInviteLink(invite.token)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Revogar"
                          onClick={() => void revokeInvite(invite.id)}
                        >
                          <X className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </RoleGuard>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lista de membros</CardTitle>
            <CardDescription>
              {members.length} membro{members.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#94A3B8]" />
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between rounded-xl border border-[rgba(59,130,246,0.12)] bg-[rgba(59,130,246,0.04)] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {member.user_id === user?.id ? 'Voce' : member.user_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-[#94A3B8]">{roleLabels[member.role]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.user_id !== user?.id && member.role !== 'owner' && (
                        <RoleGuard minRole="owner">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setMemberToRemove(member.user_id)}
                          >
                            <Trash2 className="h-4 w-4 text-[#EF4444]" />
                          </Button>
                        </RoleGuard>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => { if (!open) setMemberToRemove(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este membro? Ele perderá o acesso à
              plataforma. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (memberToRemove) {
                  void removeMember(memberToRemove);
                  setMemberToRemove(null);
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
