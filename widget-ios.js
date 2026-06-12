// Widget de Portafolio para iOS — Scriptable
// ─────────────────────────────────────────────
// Muestra en tu pantalla de inicio: valor total, ganancia del día
// y el semáforo de mercado. Se actualiza solo cada ~15 min.
//
// CÓMO INSTALARLO (gratis, 3 min):
// 1. Instala "Scriptable" desde el App Store (gratis)
// 2. Abre Scriptable → "+" → pega este archivo completo → renómbralo "Portafolio"
// 3. En la pantalla de inicio: mantén presionado → "+" → busca Scriptable
//    → elige tamaño pequeño o mediano → agregar
// 4. Toca el widget recién creado → Script: "Portafolio" → listo

const API = 'https://script.google.com/macros/s/AKfycbzf5GTt1JUrftY5sGG2I3LVbFrRHyNO4LAxlthWPvRE1FJsDUKdqev2jc6Nxik86-bh/exec';

const r = new Request(API + '?action=portafolio&_t=' + Date.now());
const { resumen, posiciones } = await r.loadJSON();

// Mejor y peor posición del día
const sorted = [...posiciones].sort((a, b) => (b.varDia || 0) - (a.varDia || 0));
const mejor = sorted[0], peor = sorted[sorted.length - 1];

const fmt = n => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = n => (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';

const POS = resumen.ganancia >= 0;
const GREEN = new Color('#3ddc8e'), RED = new Color('#ff5d72');
const MUTED = new Color('#8d97a7'), TEXT = new Color('#eef2f8');

const w = new ListWidget();
w.backgroundColor = new Color('#0b0e14');
const grad = new LinearGradient();
grad.colors = [new Color('#16223c'), new Color('#0b0e14')];
grad.locations = [0, 0.7];
w.backgroundGradient = grad;
w.setPadding(14, 14, 14, 14);

const title = w.addText('MI PORTAFOLIO');
title.font = Font.semiboldSystemFont(9);
title.textColor = MUTED;

w.addSpacer(4);
const valor = w.addText(fmt(resumen.valor));
valor.font = Font.boldSystemFont(24);
valor.textColor = TEXT;
valor.minimumScaleFactor = 0.6;

w.addSpacer(2);
const gan = w.addText(`${POS ? '+' : ''}${fmt(resumen.ganancia).replace('$-', '-$')} · ${pct(resumen.retorno)}`);
gan.font = Font.semiboldSystemFont(12);
gan.textColor = POS ? GREEN : RED;

if (config.widgetFamily !== 'small' && mejor && peor) {
  w.addSpacer(8);
  const row = w.addStack();
  row.layoutHorizontally();
  for (const [p, lbl] of [[mejor, '▲'], [peor, '▼']]) {
    const cell = row.addStack();
    cell.layoutVertically();
    const t1 = cell.addText(`${lbl} ${p.ticker}`);
    t1.font = Font.semiboldSystemFont(10);
    t1.textColor = (p.varDia || 0) >= 0 ? GREEN : RED;
    const t2 = cell.addText(pct(p.varDia || 0) + ' hoy');
    t2.font = Font.systemFont(9);
    t2.textColor = MUTED;
    row.addSpacer(14);
  }
}

w.addSpacer();
const foot = w.addText('Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
foot.font = Font.systemFont(8);
foot.textColor = MUTED;

w.url = 'https://martinfernanm-boop.github.io/portafolio-dashboard/';
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  w.presentMedium();
}
Script.complete();
