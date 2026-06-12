// Proxy CORS para Binance — Cloudflare Worker (gratis)
// ─────────────────────────────────────────────────────
// Binance dejó de permitir el header X-MBX-APIKEY desde navegadores,
// así que la tab Crypto necesita este worker como puente.
//
// CÓMO INSTALARLO (5 min, gratis, sin tarjeta):
// 1. Crea una cuenta en https://dash.cloudflare.com (gratis)
// 2. Menú lateral: "Workers & Pages" → "Create" → "Create Worker" → Deploy
// 3. Click "Edit code", borra todo, pega este archivo completo → "Deploy"
// 4. Copia la URL del worker (https://TU-WORKER.TU-USUARIO.workers.dev)
// 5. En la webapp, tab Crypto → Configurar → pégala en "URL del proxy"
//
// Seguridad: solo acepta peticiones hacia hosts *.binance.com y solo GET.
// Tu API key pasa por TU worker (infraestructura tuya), no por terceros.

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'x-mbx-apikey,content-type',
      'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'solo GET' }), { status: 405, headers: cors });
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'falta parámetro url' }), { status: 400, headers: cors });
    }

    let t;
    try { t = new URL(target); } catch {
      return new Response(JSON.stringify({ error: 'url inválida' }), { status: 400, headers: cors });
    }
    if (!/^api[0-9]?(-gcp)?\.binance\.com$/.test(t.hostname)) {
      return new Response(JSON.stringify({ error: 'host no permitido' }), { status: 403, headers: cors });
    }

    const apiKey = request.headers.get('x-mbx-apikey') || '';
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept': 'application/json',
    };
    if (apiKey) upstreamHeaders['X-MBX-APIKEY'] = apiKey;

    const resp = await fetch(t.toString(), { headers: upstreamHeaders });
    const body = await resp.text();

    // Si Binance devuelve algo que no es JSON (WAF/HTML), envolverlo para diagnóstico
    if (body && body[0] !== '{' && body[0] !== '[') {
      return new Response(JSON.stringify({
        error: 'upstream no-JSON',
        upstreamStatus: resp.status,
        snippet: body.slice(0, 200),
      }), { status: 502, headers: cors });
    }
    return new Response(body, { status: resp.status, headers: cors });
  },
};
