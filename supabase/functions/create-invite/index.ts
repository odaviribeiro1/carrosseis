import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';

const SCHEMA = 'content_hub';

Deno.serve(async (req: Request) => {
  const corsHeaders = await getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nao autorizado' }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: userResult, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userResult.user) {
      return json({ error: 'Sessao invalida' }, 401, corsHeaders);
    }
    const user = userResult.user;

    const { data: caller, error: roleErr } = await admin
      .schema(SCHEMA)
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleErr || !caller || caller.role !== 'owner') {
      return json({ error: 'Apenas o owner pode criar convites' }, 403, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Email invalido' }, 400, corsHeaders);
    }

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const inviteToken = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const { data: invite, error: insertErr } = await admin
      .schema(SCHEMA)
      .from('invites')
      .insert({
        email,
        token: inviteToken,
        role: 'member',
        invited_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !invite) {
      return json({ error: insertErr?.message ?? 'Erro ao criar convite' }, 500, corsHeaders);
    }

    const appUrl = await getCredential('app_url') ?? '';
    const inviteUrl = appUrl
      ? `${appUrl.replace(/\/$/, '')}/invite?token=${inviteToken}`
      : `/invite?token=${inviteToken}`;

    const resendKey = await getCredential('resend_api_key');
    let emailSent = false;
    if (resendKey) {
      emailSent = await sendInviteEmail(resendKey, email, inviteUrl);
    }

    return json(
      {
        ok: true,
        invite_id: invite.id,
        invite_url: inviteUrl,
        expires_at: invite.expires_at,
        email_sent: emailSent,
      },
      200,
      corsHeaders,
    );
  } catch (e) {
    return json({ error: String(e) }, 500, corsHeaders);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function sendInviteEmail(apiKey: string, to: string, inviteUrl: string): Promise<boolean> {
  try {
    const from = await getCredential('email_from') ?? 'noreply@example.com';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: 'Voce foi convidado para o Content Hub',
        html: `<p>Voce foi convidado para esta instancia. Acesse o link abaixo para criar sua conta (valido por 7 dias):</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
