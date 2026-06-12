// Worker del Portafolio — Cloudflare Worker (gratis)
// ────────────────────────────────────────────────────
// Hace 4 cosas:
//   1. /?url=…      Proxy para Binance (endpoints firmados, bloqueados en browsers)
//   2. /yf?url=…    Proxy para Yahoo Finance con caché de 60s (reemplaza corsproxy.io)
//   3. /gas?…       Caché de 45s sobre el API de Google Apps Script (app más rápida)
//   4. Cron         Alertas de crypto por Telegram (revisa precios cada 5 min)
//
// INSTALACIÓN:
// 1. Pega este archivo completo en tu worker (Edit code → Deploy)
// 2. Completa TELEGRAM_TOKEN y TELEGRAM_CHAT abajo (los mismos del bot)
// 3. Para las alertas: Settings del worker → Triggers → Cron Triggers →
//    Add Cron Trigger → escribe: */5 * * * *  → Save
// 4. Ajusta ALERTAS a gusto (símbolos, umbral %, niveles de precio)

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzf5GTt1JUrftY5sGG2I3LVbFrRHyNO4LAxlthWPvRE1FJsDUKdqev2jc6Nxik86-bh/exec';

const TELEGRAM_TOKEN = 'PEGA_AQUI_TU_TOKEN';
const TELEGRAM_CHAT  = 'PEGA_AQUI_TU_CHAT_ID';

const ALERTAS = {
  simbolos: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  movimiento24hPct: 5,          // alerta si |variación 24h| >= 5%
  niveles: {
    // BTCUSDT: { sobre: [120000], bajo: [80000] },  // ejemplo
  },
  cooldownMin: 240,             // no repetir la misma alerta por 4 horas
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'x-mbx-apikey,content-type',
  'Content-Type': 'application/json',
};
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept': 'application/json' };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CORS });

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);

    const u = new URL(request.url);

    if (u.pathname === '/yf')  return handleYahoo(u, ctx);
    if (u.pathname === '/gas') return handleGas(u, ctx);
    return handleBinance(u, request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAlertas());
  },
};

// ── 1. BINANCE (firmado) ──────────────────────────────────────
async function handleBinance(u, request) {
  const target = u.searchParams.get('url');
  if (!target) return json({ error: 'falta parámetro url' }, 400);

  let t;
  try { t = new URL(target); } catch { return json({ error: 'url inválida' }, 400); }
  if (!/^api[0-9]?(-gcp)?\.binance\.com$/.test(t.hostname)) return json({ error: 'host no permitido' }, 403);

  const apiKey = request.headers.get('x-mbx-apikey') || '';
  const headers = { ...UA };
  if (apiKey) headers['X-MBX-APIKEY'] = apiKey;

  const resp = await fetch(t.toString(), { headers });
  const body = await resp.text();
  if (body && body[0] !== '{' && body[0] !== '[') {
    return json({ error: 'upstream no-JSON', upstreamStatus: resp.status, snippet: body.slice(0, 200) }, 502);
  }
  return new Response(body, { status: resp.status, headers: CORS });
}

// ── 2. YAHOO FINANCE (caché 60s) ──────────────────────────────
async function handleYahoo(u, ctx) {
  const target = u.searchParams.get('url');
  if (!target) return json({ error: 'falta parámetro url' }, 400);

  let t;
  try { t = new URL(target); } catch { return json({ error: 'url inválida' }, 400); }
  if (!/^(query[12]\.finance|fc)\.yahoo\.com$/.test(t.hostname)) return json({ error: 'host no permitido' }, 403);

  const cache = caches.default;
  const cacheKey = new Request('https://yf-cache.local/' + encodeURIComponent(t.toString()));
  const hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('x-cache', 'HIT');
    return r;
  }

  const resp = await fetch(t.toString(), { headers: UA });
  const body = await resp.text();
  const out = new Response(body, {
    status: resp.status,
    headers: { ...CORS, 'Cache-Control': 'public, max-age=60', 'x-cache': 'MISS' },
  });
  if (resp.status === 200 && body && (body[0] === '{' || body[0] === '[')) {
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
  }
  return out;
}

// ── 3. GAS (caché 45s, excepto escrituras) ────────────────────
async function handleGas(u, ctx) {
  const params = new URLSearchParams(u.search);
  params.delete('_t'); // el cache-buster del cliente no debe romper el caché
  const action = params.get('action') || '';
  const target = GAS_URL + '?' + params.toString();
  const esEscritura = action === 'journal_add';

  const cache = caches.default;
  const cacheKey = new Request('https://gas-cache.local/' + encodeURIComponent(target));

  if (!esEscritura) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      r.headers.set('x-cache', 'HIT');
      return r;
    }
  }

  const resp = await fetch(target, { redirect: 'follow' });
  const body = await resp.text();
  const out = new Response(body, {
    status: resp.status,
    headers: { ...CORS, 'Cache-Control': 'public, max-age=45', 'x-cache': 'MISS' },
  });
  if (!esEscritura && resp.status === 200 && body && body[0] === '{') {
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
  }
  return out;
}

// ── 4. ALERTAS CRYPTO → TELEGRAM (cron cada 5 min) ────────────
async function checkAlertas() {
  if (TELEGRAM_TOKEN.startsWith('PEGA')) return;

  const syms = encodeURIComponent(JSON.stringify(ALERTAS.simbolos));
  const data = await fetch(`https://api-gcp.binance.com/api/v3/ticker/24hr?symbols=${syms}`, { headers: UA })
    .then(r => r.json()).catch(() => null);
  if (!Array.isArray(data)) return;

  const msgs = [];
  for (const t of data) {
    const sym = t.symbol, precio = parseFloat(t.lastPrice), chg = parseFloat(t.priceChangePercent);
    const nombre = sym.replace('USDT', '');

    if (Math.abs(chg) >= ALERTAS.movimiento24hPct && await cooldownOk(`mov:${sym}`)) {
      msgs.push(`${chg >= 0 ? '🟢' : '🔴'} ${nombre} ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% en 24h — $${precio.toLocaleString('en-US')}`);
    }
    const niv = ALERTAS.niveles[sym] || {};
    for (const n of (niv.sobre || [])) {
      if (precio >= n && await cooldownOk(`sobre:${sym}:${n}`)) {
        msgs.push(`🎯 ${nombre} superó $${n.toLocaleString('en-US')} — ahora $${precio.toLocaleString('en-US')}`);
      }
    }
    for (const n of (niv.bajo || [])) {
      if (precio <= n && await cooldownOk(`bajo:${sym}:${n}`)) {
        msgs.push(`⚠️ ${nombre} cayó bajo $${n.toLocaleString('en-US')} — ahora $${precio.toLocaleString('en-US')}`);
      }
    }
  }

  if (msgs.length) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: 'ALERTA CRYPTO\n\n' + msgs.join('\n') }),
    });
  }
}

// Cooldown sin base de datos: usa el caché del worker como memoria
async function cooldownOk(clave) {
  const cache = caches.default;
  const key = new Request('https://cooldown.local/' + clave);
  if (await cache.match(key)) return false;
  await cache.put(key, new Response('1', { headers: { 'Cache-Control': `public, max-age=${ALERTAS.cooldownMin * 60}` } }));
  return true;
}
