import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';

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
      return json({ error: 'Apenas o owner pode revogar convites' }, 403, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const inviteId = typeof body.invite_id === 'string' ? body.invite_id : '';
    if (!inviteId) {
      return json({ error: 'invite_id obrigatorio' }, 400, corsHeaders);
    }

    const { error: updateErr } = await admin
      .schema(SCHEMA)
      .from('invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId)
      .is('used_at', null)
      .is('revoked_at', null);

    if (updateErr) {
      return json({ error: updateErr.message }, 500, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
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
