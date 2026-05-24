import type { VercelRequest, VercelResponse } from '@vercel/node';
import { build } from 'esbuild';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type BootstrapBody = {
  supabase_url: string;
  supabase_anon_key: string;
  supabase_service_role_key: string;
  supabase_pat: string;
  vercel_token: string;
  owner_email: string;
  owner_password: string;
};

const ROOT = process.cwd();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Metodo nao permitido' });

  const body = req.body as BootstrapBody;
  const cryptoKey = process.env.CRYPTO_KEY && /^[a-f0-9]{64}$/i.test(process.env.CRYPTO_KEY)
    ? process.env.CRYPTO_KEY
    : randomBytes(32).toString('hex');

  try {
    validateBody(body);
    const projectRef = new URL(body.supabase_url).hostname.split('.')[0];
    if (!projectRef) throw new Error('Nao foi possivel extrair o project ref do Supabase.');

    await runSql(createBootstrapStateSql(), projectRef, body.supabase_pat);
    await checkpoint(projectRef, body.supabase_pat, 'connection_ok', {});

    const migrationsDir = join(ROOT, 'supabase', 'migrations');
    const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
    for (const file of migrations) {
      const step = `migration:${file}`;
      if (await hasCheckpoint(projectRef, body.supabase_pat, step)) continue;
      await runSql(readFileSync(join(migrationsDir, file), 'utf8'), projectRef, body.supabase_pat);
      await checkpoint(projectRef, body.supabase_pat, step, {});
    }

    await deployEdgeSecrets(projectRef, body.supabase_pat, {
      SUPABASE_URL: body.supabase_url,
      SUPABASE_SERVICE_ROLE_KEY: body.supabase_service_role_key,
      CRYPTO_KEY: cryptoKey,
    });
    await checkpoint(projectRef, body.supabase_pat, 'edge_functions_secrets_set', {});

    const edgeFunctions = await listEdgeFunctions();
    for (const fn of edgeFunctions) {
      // Fix 8: deploya SEMPRE (upsert idempotente) — sem pular por checkpoint,
      // senao mudancas no codigo de uma EF nunca sobem ao re-rodar o Step 3.
      // O checkpoint segue sendo gravado, mas so como diagnostico.
      const step = `edge_function:${fn.slug}`;
      await upsertEdgeFunction(projectRef, body.supabase_pat, fn.slug, fn.body);
      await checkpoint(projectRef, body.supabase_pat, step, {});
    }
    await checkpoint(projectRef, body.supabase_pat, 'edge_functions_deployed', { count: edgeFunctions.length });

    const ownerUserId = await ensureOwner(body);
    await checkpoint(projectRef, body.supabase_pat, 'owner_created', {
      user_id: ownerUserId,
      email: body.owner_email,
    });

    const vercelProjectId = process.env.VERCEL_PROJECT_ID;
    if (!vercelProjectId) {
      throw new Error('VERCEL_PROJECT_ID ausente — defina a env do projeto na Vercel para o setup automatico.');
    }

    await setVercelEnvs(body.vercel_token, vercelProjectId, {
      SUPABASE_URL: body.supabase_url,
      SUPABASE_ANON_KEY: body.supabase_anon_key,
      SUPABASE_SERVICE_ROLE_KEY: body.supabase_service_role_key,
      VITE_SUPABASE_URL: body.supabase_url,
      VITE_SUPABASE_ANON_KEY: body.supabase_anon_key,
      CRYPTO_KEY: cryptoKey,
    });
    await checkpoint(projectRef, body.supabase_pat, 'vercel_envs_set', {});

    // As envs setadas via /env nao ficam ativas no deployment atual — dispara um redeploy.
    const deployment = await triggerVercelRedeploy(body.vercel_token, vercelProjectId, projectRef, body.supabase_pat);

    return res.status(200).json({
      success: true,
      steps_completed: await listCheckpoints(projectRef, body.supabase_pat),
      deployment_id: deployment.deployment_id,
      deployment_url: deployment.deployment_url,
      owner_user_id: ownerUserId,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      step_failed: 'bootstrap',
      error_code: 'BOOTSTRAP_FAILED',
      message: err instanceof Error ? err.message : 'Erro desconhecido no bootstrap.',
    });
  }
}

function validateBody(body: Partial<BootstrapBody>) {
  if (!body.supabase_url || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(body.supabase_url)) {
    throw new Error('URL do Supabase invalida.');
  }
  for (const key of ['supabase_anon_key', 'supabase_service_role_key', 'supabase_pat', 'vercel_token'] as const) {
    if (!body[key]) throw new Error(`Campo obrigatorio ausente: ${key}.`);
  }
  if (!body.owner_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.owner_email)) {
    throw new Error('Email do owner invalido.');
  }
  if (!body.owner_password || body.owner_password.length < 8 || !/[a-zA-Z]/.test(body.owner_password) || !/\d/.test(body.owner_password)) {
    throw new Error('Senha do owner precisa ter 8 caracteres, letras e numeros.');
  }
}

function createBootstrapStateSql() {
  return `
CREATE TABLE IF NOT EXISTS public._bootstrap_state (
  step text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);
ALTER TABLE public._bootstrap_state ENABLE ROW LEVEL SECURITY;`;
}

async function runSql(query: string, ref: string, pat: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Migration falhou: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function hasCheckpoint(ref: string, pat: string, step: string): Promise<boolean> {
  const escaped = step.replace(/'/g, "''");
  const result = await runSql(`SELECT step FROM public._bootstrap_state WHERE step = '${escaped}'`, ref, pat);
  return JSON.stringify(result).includes(step);
}

async function checkpoint(ref: string, pat: string, step: string, metadata: unknown) {
  const escapedStep = step.replace(/'/g, "''");
  const escapedMeta = JSON.stringify(metadata).replace(/'/g, "''");
  await runSql(
    `INSERT INTO public._bootstrap_state (step, metadata)
     VALUES ('${escapedStep}', '${escapedMeta}'::jsonb)
     ON CONFLICT (step) DO NOTHING`,
    ref,
    pat,
  );
}

async function listCheckpoints(ref: string, pat: string): Promise<string[]> {
  const result = await runSql('SELECT step FROM public._bootstrap_state ORDER BY completed_at', ref, pat);
  const text = JSON.stringify(result);
  return [...text.matchAll(/"step"\s*:\s*"([^"]+)"/g)].map((match) => match[1] ?? '');
}

async function listEdgeFunctions(): Promise<Array<{ slug: string; body: string }>> {
  const functionsDir = join(ROOT, 'supabase', 'functions');
  const slugs = readdirSync(functionsDir)
    .filter((entry) => entry !== '_shared' && statSync(join(functionsDir, entry)).isDirectory())
    .sort();

  return Promise.all(
    slugs.map(async (slug) => ({
      slug,
      body: await bundleEdgeFunction(join(functionsDir, slug, 'index.ts')),
    })),
  );
}

async function bundleEdgeFunction(entryPoint: string): Promise<string> {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    legalComments: 'none',
    external: ['http://*', 'https://*'],
    logLevel: 'silent',
  });

  const bundled = result.outputFiles[0]?.text;
  if (!bundled) {
    throw new Error(`Falha ao empacotar Edge Function: ${entryPoint}`);
  }
  return bundled;
}

async function deployEdgeSecrets(ref: string, pat: string, secrets: Record<string, string>) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.entries(secrets).map(([name, value]) => ({ name, value }))),
  });
  if (!res.ok) throw new Error(`Falha ao configurar secrets das Edge Functions: ${await res.text()}`);
}

async function upsertEdgeFunction(ref: string, pat: string, slug: string, body: string) {
  // Fix 5: deploy via multipart no endpoint atual POST /functions/deploy?slug= (upsert por slug).
  // O metodo antigo (POST/PATCH em /functions com body JSON cru) foi descontinuado e levava a
  // "Failed to send a request to the Edge Function". Nao setar Content-Type manualmente — o
  // fetch injeta o boundary do multipart sozinho.
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name: slug, entrypoint_path: 'index.ts', verify_jwt: true })], {
      type: 'application/json',
    }),
  );
  form.append('file', new Blob([body], { type: 'application/typescript' }), 'index.ts');

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Falha ao publicar Edge Function ${slug}: ${await res.text()}`);
}

async function ensureOwner(body: BootstrapBody): Promise<string> {
  const admin = createClient(body.supabase_url, body.supabase_service_role_key, {
    auth: { persistSession: false },
  });
  const { data: existing } = await admin.auth.admin.listUsers();
  let user = existing.users.find((item) => item.email?.toLowerCase() === body.owner_email.toLowerCase());

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: body.owner_email,
      password: body.owner_password,
      email_confirm: true,
      user_metadata: { role: 'owner', created_via: 'setup_wizard' },
      app_metadata: { role: 'owner' },
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'Falha ao criar owner.');
    user = created.data.user;
  }

  const { error } = await admin
    .schema('content_hub')
    .from('user_roles')
    .upsert({ user_id: user.id, role: 'owner' });
  if (error) throw error;
  return user.id;
}

async function setVercelEnvs(token: string, projectId: string, envs: Record<string, string>) {
  for (const [key, value] of Object.entries(envs)) {
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?upsert=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview', 'development'] }),
    });
    if (!res.ok) throw new Error(`Falha ao configurar env ${key} na Vercel: ${await res.text()}`);
  }
}

type DeploymentRef = { deployment_id: string; deployment_url: string };

async function triggerVercelRedeploy(
  token: string,
  projectId: string,
  ref: string,
  pat: string,
): Promise<DeploymentRef> {
  // Idempotencia: se um redeploy ja foi disparado, reaproveita o checkpoint (nao dispara de novo).
  if (await hasCheckpoint(ref, pat, 'redeploy_triggered')) {
    return readRedeployCheckpoint(ref, pat);
  }

  // 1. Deployment de producao atual como base do redeploy.
  const projectRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!projectRes.ok) throw new Error(`Falha ao consultar projeto Vercel: ${await projectRes.text()}`);
  const projectData = await projectRes.json();
  const baseDeploymentId = projectData?.targets?.production?.id ?? projectData?.latestDeployments?.[0]?.uid;
  if (!baseDeploymentId) {
    throw new Error('Projeto Vercel sem deployment anterior — nao ha base para redeploy.');
  }

  // 2. Disparar redeploy: novo deployment de producao, herdando refs Git + as envs novas.
  const redeployRes = await fetch('https://api.vercel.com/v13/deployments?forceNew=1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: projectData.name,
      deploymentId: baseDeploymentId,
      target: 'production',
      meta: { source: 'agentise-setup-wizard', reason: 'apply-envs' },
    }),
  });
  if (!redeployRes.ok) throw new Error(`Falha ao disparar redeploy: ${await redeployRes.text()}`);
  const redeployData = await redeployRes.json();
  const deployment: DeploymentRef = {
    deployment_id: redeployData.id ?? redeployData.uid ?? '',
    deployment_url: redeployData.url ?? '',
  };

  // 3. Checkpoint para idempotencia e para o frontend acompanhar o polling.
  await checkpoint(ref, pat, 'redeploy_triggered', {
    deployment_id: deployment.deployment_id,
    deployment_url: deployment.deployment_url,
    triggered_at: new Date().toISOString(),
  });
  return deployment;
}

async function readRedeployCheckpoint(ref: string, pat: string): Promise<DeploymentRef> {
  const result = await runSql(
    "SELECT metadata FROM public._bootstrap_state WHERE step = 'redeploy_triggered'",
    ref,
    pat,
  );
  const text = JSON.stringify(result);
  return {
    deployment_id: text.match(/"deployment_id"\s*:\s*"([^"]*)"/)?.[1] ?? '',
    deployment_url: text.match(/"deployment_url"\s*:\s*"([^"]*)"/)?.[1] ?? '',
  };
}
