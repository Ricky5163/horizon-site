const corsHeaders = (origin, env) => {
  const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://horizonaudios.com')
    .split(',')
    .map((item) => item.trim());
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
};

const json = (body, status, origin, env) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin, env),
      'Content-Type': 'application/json',
    },
  });

const slugKey = (key) =>
  key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9./_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin, env) });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Metodo nao permitido.' }, 405, origin, env);
    }

    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessao admin em falta.' }, 401, origin, env);

    const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!userResponse.ok) return json({ error: 'Sessao invalida.' }, 401, origin, env);

    const user = await userResponse.json();
    const adminEmails = (env.ADMIN_EMAILS || 'admin@horizon.pt')
      .split(',')
      .map((email) => email.trim().toLowerCase());
    if (!adminEmails.includes(String(user.email || '').toLowerCase())) {
      return json({ error: 'Acesso admin necessario.' }, 403, origin, env);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const requestedKey = String(formData.get('key') || '');

    if (!(file instanceof File) || file.size === 0) {
      return json({ error: 'Ficheiro de audio em falta.' }, 400, origin, env);
    }

    if (!file.type.startsWith('audio/')) {
      return json({ error: 'O ficheiro tem de ser audio.' }, 400, origin, env);
    }

    const key = slugKey(requestedKey || `audios/${Date.now()}-${file.name}`);
    await env.AUDIO_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return json({
      key,
      url: `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`,
    }, 200, origin, env);
  },
};
