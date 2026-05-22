import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getSupabaseClient } from '@/lib/supabase';

const inviteFormSchema = z
  .object({
    password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmacao de senha e obrigatoria'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Senhas nao conferem',
    path: ['confirmPassword'],
  });

type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface InviteInfo {
  email: string;
  role: string;
  expires_at: string;
}

export function InvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [validating, setValidating] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
  });

  useEffect(() => {
    if (!token) {
      setError('Token de convite ausente.');
      setValidating(false);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError('Supabase nao configurado.');
      setValidating(false);
      return;
    }

    void (async () => {
      // validate_invite() lives in `public`; client defaults to `content_hub`.
      const { data, error: rpcErr } = await client.schema('public').rpc('validate_invite', { p_token: token });
      if (rpcErr) {
        setError('Erro ao validar convite: ' + rpcErr.message);
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        setError('Convite invalido, expirado ou ja utilizado.');
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        setInvite(row as InviteInfo);
      }
      setValidating(false);
    })();
  }, [token]);

  async function onSubmit(values: InviteFormValues) {
    if (!invite) return;
    const client = getSupabaseClient();
    if (!client) {
      toast.error('Supabase nao configurado');
      return;
    }

    setSubmitting(true);
    try {
      const { error: signUpErr } = await client.auth.signUp({
        email: invite.email,
        password: values.password,
        options: {
          data: { invite_token: token },
        },
      });
      if (signUpErr) throw signUpErr;
      toast.success('Conta criada com sucesso!');
      navigate('/login');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar conta';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: '#0A0A0F' }}
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Aceitar convite</CardTitle>
          <CardDescription>
            Crie sua conta para entrar nesta instancia
          </CardDescription>
        </CardHeader>
        <CardContent>
          {validating ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-[#94A3B8]" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : invite ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={invite.email} disabled readOnly />
                <p className="text-xs text-[#94A3B8]">
                  Convite valido ate{' '}
                  {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 8 caracteres"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-red-400">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a senha"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-400">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar conta
              </Button>
            </form>
          ) : null}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-[#94A3B8]">
            Ja tem conta?{' '}
            <Link to="/login" className="text-[#60A5FA] hover:text-[#3B82F6] transition-colors">
              Entrar
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
