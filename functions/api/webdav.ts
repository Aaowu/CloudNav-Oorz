
interface Env {
  CLOUDNAV_KV: any;
  PASSWORD: string;
}

interface WebsiteConfig {
  passwordExpiryDays?: number;
}

const AUTH_TIME_HEADER = 'x-auth-issued-at';

const getCorsHeaders = (request: Request) => {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowOrigin = origin && (
    origin === requestUrl.origin ||
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://')
  ) ? origin : requestUrl.origin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, x-auth-password, ${AUTH_TIME_HEADER}`,
  };
};

const getWebsiteConfig = async (env: Env): Promise<WebsiteConfig> => {
  const rawConfig = await env.CLOUDNAV_KV.get('website_config');
  return rawConfig ? JSON.parse(rawConfig) : { passwordExpiryDays: 7 };
};

const buildJsonResponse = (body: unknown, status: number, corsHeaders: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const validateAuth = async (request: Request, env: Env, corsHeaders: Record<string, string>) => {
  if (!env.PASSWORD) {
    return buildJsonResponse({ error: 'Server misconfigured: PASSWORD not set' }, 500, corsHeaders);
  }

  const providedPassword = request.headers.get('x-auth-password');
  if (!providedPassword || providedPassword !== env.PASSWORD) {
    return buildJsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  const websiteConfig = await getWebsiteConfig(env);
  const passwordExpiryDays = websiteConfig.passwordExpiryDays ?? 7;
  if (passwordExpiryDays > 0) {
    const authIssuedAtRaw = request.headers.get(AUTH_TIME_HEADER);
    const authIssuedAt = authIssuedAtRaw ? Number(authIssuedAtRaw) : NaN;
    const expiryMs = passwordExpiryDays * 24 * 60 * 60 * 1000;

    if (!Number.isFinite(authIssuedAt) || authIssuedAt <= 0 || Date.now() - authIssuedAt > expiryMs) {
      return buildJsonResponse({ error: '密码已过期，请重新输入' }, 401, corsHeaders);
    }
  }

  return null;
};

export const onRequestOptions = async (context: { request: Request }) =>
  new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(request);
  
  try {
    const authError = await validateAuth(request, env, corsHeaders);
    if (authError) {
      return authError;
    }

    const body = await request.json() as any;
    const { operation, config, payload, filename } = body;
    
    if (!config || !config.url || !config.username || !config.password) {
        return buildJsonResponse({ error: 'Missing configuration' }, 400, corsHeaders);
    }

    let baseUrl = config.url.trim();
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    
    const finalFilename = filename || 'cloudnav_backup.json';
    const fileUrl = baseUrl + finalFilename;

    const authHeader = `Basic ${btoa(`${config.username}:${config.password}`)}`;
    
    let fetchUrl = baseUrl;
    let method = 'PROPFIND';
    let headers: Record<string, string> = {
        'Authorization': authHeader,
        'User-Agent': 'CloudNav/1.0'
    };
    let requestBody = undefined;

    if (operation === 'check') {
        fetchUrl = baseUrl;
        method = 'PROPFIND';
        headers['Depth'] = '0';
    } else if (operation === 'upload') {
        fetchUrl = fileUrl;
        method = 'PUT';
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(payload); 
    } else if (operation === 'download') {
        fetchUrl = fileUrl;
        method = 'GET';
    } else {
        return buildJsonResponse({ error: 'Invalid operation' }, 400, corsHeaders);
    }

    const response = await fetch(fetchUrl, {
        method,
        headers,
        body: requestBody
    });

    if (operation === 'download') {
        if (!response.ok) {
             if (response.status === 404) {
                 return buildJsonResponse({ error: 'Backup file not found' }, 404, corsHeaders);
             }
             return buildJsonResponse({ error: `WebDAV Error: ${response.status}` }, response.status, corsHeaders);
        }
        const data = await response.json();
        return buildJsonResponse(data, 200, corsHeaders);
    }

    const success = response.ok || response.status === 207;
    
    return buildJsonResponse({ success, status: response.status }, 200, corsHeaders);

  } catch (err: any) {
    return buildJsonResponse({ error: err.message }, 500, corsHeaders);
  }
};
