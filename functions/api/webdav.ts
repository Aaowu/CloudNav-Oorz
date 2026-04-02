
export const onRequestPost = async (context: { request: Request }) => {
  const { request } = context;
  
  try {
    const body = await request.json() as any;
    const { operation, config, payload, filename } = body;
    
    if (!config || !config.url || !config.username || !config.password) {
        return new Response(JSON.stringify({ error: 'Missing configuration' }), { status: 400 });
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
        return new Response(JSON.stringify({ error: 'Invalid operation' }), { status: 400 });
    }

    const response = await fetch(fetchUrl, {
        method,
        headers,
        body: requestBody
    });

    if (operation === 'download') {
        if (!response.ok) {
             if (response.status === 404) {
                 return new Response(JSON.stringify({ error: 'Backup file not found' }), { status: 404 });
             }
             return new Response(JSON.stringify({ error: `WebDAV Error: ${response.status}` }), { status: response.status });
        }
        const data = await response.json();
        return new Response(JSON.stringify(data), { 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const success = response.ok || response.status === 207;
    
    return new Response(JSON.stringify({ success, status: response.status }), { 
        headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
