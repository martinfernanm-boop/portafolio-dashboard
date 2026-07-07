// ════════════════════════════════════════════════════════════════
// PORTAFOLIO — Widget pequeño (Scriptable) · v2
// ────────────────────────────────────────────────────────────────
// Instalación:
//   1. App Scriptable → "+" → pegar este código → renombrar "Portafolio chico"
//   2. Pantalla de inicio → mantener presionado → "+" → Scriptable → tamaño pequeño
//   3. Tocar el widget → Script: "Portafolio chico" → When Interacting: Open URL
//
// Qué muestra:
//   · Patrimonio total (posiciones + caja)
//   · Ganancia de HOY en $ y % (varDia real de cada posición, igual que la app)
//   · Sparkline de los últimos 30 días hábiles
//   · Punto de mercado NYSE (verde abierto / gris cerrado)
//   · Caja disponible + hora de actualización
//   · Modo claro/oscuro automático · si no hay red, muestra el último dato ("⚠︎")
// ════════════════════════════════════════════════════════════════

const API    = 'https://script.google.com/macros/s/AKfycbzf5GTt1JUrftY5sGG2I3LVbFrRHyNO4LAxlthWPvRE1FJsDUKdqev2jc6Nxik86-bh/exec';
const WORKER = 'https://soft-water-ce6a.martinfernanm.workers.dev'; // caché 45s (más rápido que GAS directo)
const APP_URL = 'https://martinfernanm-boop.github.io/portafolio-dashboard/';

// ── Colores (adaptativos claro/oscuro, mismos tokens que la app) ──
const C = {
  bgTop:    Color.dynamic(new Color('#ffffff'), new Color('#16223c')),
  bgBottom: Color.dynamic(new Color('#eef1f7'), new Color('#06080f')),
  text:     Color.dynamic(new Color('#101726'), new Color('#eef2f8')),
  muted:    Color.dynamic(new Color('#5b6675'), new Color('#8d97a7')),
  faint:    Color.dynamic(new Color('#8a93a3'), new Color('#5d6675')),
  green:    Color.dynamic(new Color('#0c9e63'), new Color('#3ddc8e')),
  red:      Color.dynamic(new Color('#dd2e4d'), new Color('#ff5d72')),
  greenFill:Color.dynamic(new Color('#0c9e63', 0.12), new Color('#3ddc8e', 0.16)),
  redFill:  Color.dynamic(new Color('#dd2e4d', 0.12), new Color('#ff5d72', 0.16)),
};

const fmtUSD = n => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

// ── Datos: worker (rápido) → GAS directo → caché local (offline) ──
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.libraryDirectory(), 'portafolio_widget_v2.json');

async function fetchJSON(url, timeout = 12) {
  const r = new Request(url);
  r.timeoutInterval = timeout;
  return await r.loadJSON();
}

async function cargarDatos() {
  const fuentes = [
    { pf: `${WORKER}/gas?action=portafolio`, hist: `${WORKER}/gas?action=historial` },
    { pf: `${API}?action=portafolio`,        hist: `${API}?action=historial` },
  ];
  for (const f of fuentes) {
    try {
      const [pf, hist] = await Promise.all([fetchJSON(f.pf), fetchJSON(f.hist)]);
      if (pf && pf.resumen) {
        const data = { pf, hist, ts: Date.now() };
        try { fm.writeString(cachePath, JSON.stringify(data)); } catch (e) {}
        return { ...data, stale: false };
      }
    } catch (e) {}
  }
  // Sin red: último dato bueno guardado
  if (fm.fileExists(cachePath)) {
    try { return { ...JSON.parse(fm.readString(cachePath)), stale: true }; } catch (e) {}
  }
  return null;
}

// Ganancia de HOY: Σ (valor − valor/(1+varDia)) — misma fórmula que la app
function calcHoy(posiciones) {
  let s = 0, ok = false;
  for (const p of posiciones || []) {
    const vd = parseFloat(p.varDia), val = parseFloat(p.valorUSD);
    if (!isNaN(vd) && !isNaN(val) && (1 + vd) !== 0) { s += val - val / (1 + vd); ok = true; }
  }
  return ok ? s : null;
}

// ¿NYSE abierto? (lun-vie 9:30–16:00 hora Nueva York)
function mercadoAbierto() {
  try {
    const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const d = ny.getDay(), m = ny.getHours() * 60 + ny.getMinutes();
    return d >= 1 && d <= 5 && m >= 570 && m < 960;
  } catch (e) { return null; }
}

// Sparkline con relleno (DrawContext)
function sparkline(values, w, h, lineColor, fillColor) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1;
  const px = i => 1 + i / (values.length - 1) * (w - 2);
  const py = v => (h - 3) - ((v - min) / span) * (h - 6);
  const pts = values.map((v, i) => new Point(px(i), py(v)));
  const fill = new Path();
  fill.move(new Point(pts[0].x, h));
  pts.forEach(p => fill.addLine(p));
  fill.addLine(new Point(pts[pts.length - 1].x, h));
  fill.closeSubpath();
  ctx.addPath(fill);
  ctx.setFillColor(fillColor);
  ctx.fillPath();
  const line = new Path();
  line.move(pts[0]);
  pts.forEach(p => line.addLine(p));
  ctx.addPath(line);
  ctx.setStrokeColor(lineColor);
  ctx.setLineWidth(2);
  ctx.strokePath();
  return ctx.getImage();
}

// ── Construcción del widget ───────────────────────────────────────
const w = new ListWidget();
w.url = APP_URL;
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
const grad = new LinearGradient();
grad.colors = [C.bgTop, C.bgBottom];
grad.locations = [0, 1];
w.backgroundGradient = grad;
w.setPadding(12, 13, 11, 13);

const data = await cargarDatos();

if (!data) {
  w.addSpacer();
  const err = w.addText('Sin conexión');
  err.font = Font.semiboldSystemFont(12);
  err.textColor = C.muted;
  err.centerAlignText();
  const hint = w.addText('Toca para abrir la app');
  hint.font = Font.systemFont(9);
  hint.textColor = C.faint;
  hint.centerAlignText();
  w.addSpacer();
} else {
  const { resumen, posiciones } = data.pf;
  const hoy = calcHoy(posiciones);
  const hoyPct = hoy != null && resumen.valor ? hoy / ((resumen.valor - hoy) || 1) * 100 : null;
  const up = (hoy ?? 0) >= 0;

  // Fila 1: etiqueta + estado del mercado
  const top = w.addStack();
  top.centerAlignContent();
  const lbl = top.addText(data.stale ? 'PORTAFOLIO ⚠︎' : 'PORTAFOLIO');
  lbl.font = Font.semiboldSystemFont(8);
  lbl.textColor = C.muted;
  top.addSpacer();
  const abierto = mercadoAbierto();
  if (abierto !== null) {
    const dot = top.addText('●');
    dot.font = Font.systemFont(7);
    dot.textColor = abierto ? C.green : C.faint;
  }

  w.addSpacer(3);

  // Valor total
  const valor = w.addText(fmtUSD(resumen.valor || 0));
  valor.font = Font.boldRoundedSystemFont(21);
  valor.textColor = C.text;
  valor.minimumScaleFactor = 0.55;
  valor.lineLimit = 1;

  w.addSpacer(2);

  // Cambio de HOY
  if (hoy != null) {
    const chip = w.addStack();
    chip.centerAlignContent();
    const arrow = chip.addText(up ? '▲ ' : '▼ ');
    arrow.font = Font.semiboldSystemFont(9);
    arrow.textColor = up ? C.green : C.red;
    const chg = chip.addText(`${up ? '+' : '−'}${fmtUSD(Math.abs(hoy)).slice(1)} · ${fmtPct(hoyPct)} hoy`);
    chg.font = Font.semiboldSystemFont(10);
    chg.textColor = up ? C.green : C.red;
    chg.lineLimit = 1;
    chg.minimumScaleFactor = 0.8;
  } else {
    const tot = w.addText(fmtPct((resumen.retorno || 0) * 100) + ' total');
    tot.font = Font.semiboldSystemFont(10);
    tot.textColor = (resumen.retorno || 0) >= 0 ? C.green : C.red;
  }

  w.addSpacer(5);

  // Sparkline 30 días hábiles del patrimonio
  const hist = (data.hist && data.hist.historial ? data.hist.historial : [])
    .map(h => parseFloat(h.valor))
    .filter(v => !isNaN(v) && v > 0)
    .slice(-30);
  if (hist.length >= 3) {
    const trendUp = hist[hist.length - 1] >= hist[0];
    const img = w.addImage(sparkline(hist, 132, 26,
      trendUp ? C.green : C.red,
      trendUp ? C.greenFill : C.redFill));
    img.centerAlignImage();
  }

  w.addSpacer();

  // Footer: caja + hora
  const foot = w.addStack();
  foot.centerAlignContent();
  const caja = foot.addText('Caja ' + fmtUSD(resumen.caja || 0));
  caja.font = Font.mediumSystemFont(8);
  caja.textColor = C.muted;
  caja.lineLimit = 1;
  caja.minimumScaleFactor = 0.7;
  foot.addSpacer();
  const hora = foot.addText(new Date(data.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
  hora.font = Font.systemFont(8);
  hora.textColor = C.faint;
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  w.presentSmall();
}
Script.complete();
