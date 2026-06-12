// Widget de Portafolio (chico) — Scriptable
// Instalación: Scriptable → "+" → pegar → renombrar "Portafolio chico"
// → widget pequeño de Scriptable en pantalla de inicio → asignar script

const API = 'https://script.google.com/macros/s/AKfycbzf5GTt1JUrftY5sGG2I3LVbFrRHyNO4LAxlthWPvRE1FJsDUKdqev2jc6Nxik86-bh/exec';

const r = new Request(API + '?action=portafolio&_t=' + Date.now());
const { resumen, posiciones } = await r.loadJSON();

const sorted = [...posiciones].sort((a, b) => (b.varDia || 0) - (a.varDia || 0));
const mejor = sorted[0];

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
w.setPadding(12, 12, 12, 12);

const title = w.addText('PORTAFOLIO');
title.font = Font.semiboldSystemFont(8);
title.textColor = MUTED;

w.addSpacer(3);
const valor = w.addText(fmt(resumen.valor));
valor.font = Font.boldSystemFont(19);
valor.textColor = TEXT;
valor.minimumScaleFactor = 0.55;
valor.lineLimit = 1;

w.addSpacer(1);
const gan = w.addText(pct(resumen.retorno) + ' total');
gan.font = Font.semiboldSystemFont(11);
gan.textColor = POS ? GREEN : RED;

const ganUsd = w.addText((resumen.ganancia >= 0 ? '+' : '−') + fmt(Math.abs(resumen.ganancia)));
ganUsd.font = Font.systemFont(9);
ganUsd.textColor = POS ? GREEN : RED;

if (mejor) {
  w.addSpacer(5);
  const top = w.addText(((mejor.varDia || 0) >= 0 ? '▲ ' : '▼ ') + mejor.ticker + ' ' + pct(mejor.varDia || 0));
  top.font = Font.semiboldSystemFont(9);
  top.textColor = (mejor.varDia || 0) >= 0 ? GREEN : RED;
  top.lineLimit = 1;
}

w.addSpacer();
const foot = w.addText(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
foot.font = Font.systemFont(7);
foot.textColor = MUTED;

w.url = 'https://martinfernanm-boop.github.io/portafolio-dashboard/';
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  w.presentSmall();
}
Script.complete();
