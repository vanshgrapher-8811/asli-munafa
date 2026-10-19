// Share / save image. Drawn on a local <canvas> and turned into a PNG blob in memory.
// Nothing is uploaded: the image only leaves the phone if the owner shares it.

import { formatINR, formatPer100 } from './i18n.js';

const W = 1080;
const H = 1350;
const C = {
  canvas: '#3B1FE0', deep: '#2A14B8', ink: '#120E0B', cream: '#F3EEE6', gold: '#F7C948', amber: '#E08A1E',
  butter: '#F5E15B', coral: '#F0603A', mint: '#7FE0DC', teal: '#2EC4A6', peri: '#6C6CF5', salmon: '#F6A99B',
  lavender: '#C7A8F0', pink: '#F24FA7', lime: '#5BF27A', blush: '#F2D6CF',
};
const SANS = 'Poppins, "Nirmala UI", "Noto Sans Devanagari", system-ui, sans-serif';
const DISPLAY = 'Unbounded, Poppins, "Nirmala UI", system-ui, sans-serif';
const MONO = '"Space Mono", ui-monospace, Consolas, monospace';

/**
 * @param r       engine result
 * @param opts    { withNumbers, lang, t, url, cat }
 * @returns Promise<Blob>
 */
export async function renderShareCard(r, { withNumbers, t, url, cat }) {
  await loadFonts();
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const has = r.moneyIn > 0;
  const keep = r.netProfit >= 0;
  const p = Math.abs(r.per100.netProfit);
  const valueColor = !has ? C.cream : keep ? C.mint : C.coral;

  const horizonY = withNumbers ? 470 : 560;
  drawSky(ctx, horizonY, keep);
  drawFloor(ctx, horizonY);

  // The Lens orb with the number inside.
  const orb = withNumbers ? { x: W / 2, y: 430, r: 245 } : { x: W / 2, y: 560, r: 300 };
  drawOrb(ctx, orb, r, cat);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.cream;
  ctx.font = `600 ${Math.round(orb.r * 0.15)}px ${SANS}`;
  ctx.fillText(has ? t(keep ? 'orb.keep' : 'orb.lose') : '', orb.x, orb.y - orb.r * 0.42);
  const valueText = has ? formatPer100(p) : '₹—';
  let size = Math.round(orb.r * 0.5);
  ctx.font = `800 ${size}px ${DISPLAY}`;
  while (ctx.measureText(valueText).width > orb.r * 1.55 && size > 40) { size -= 6; ctx.font = `800 ${size}px ${DISPLAY}`; }
  ctx.fillStyle = C.ink;
  ctx.fillText(valueText, orb.x + 6, orb.y + 6);
  ctx.fillStyle = valueColor;
  ctx.fillText(valueText, orb.x, orb.y);
  ctx.fillStyle = C.cream;
  ctx.font = `600 ${Math.round(orb.r * 0.13)}px ${SANS}`;
  ctx.fillText(t('orb.of'), orb.x, orb.y + orb.r * 0.44);

  // Bottom panel: solid ink so text never sits on the neon or the grid.
  const panel = withNumbers ? { x: 60, y: 760, w: W - 120, h: 540 } : { x: 60, y: 940, w: W - 120, h: 350 };
  roundRect(ctx, panel.x + 8, panel.y + 8, panel.w, panel.h, 36);
  ctx.fillStyle = 'rgba(18,14,11,.55)';
  ctx.fill();
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 36);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = iridescent(ctx, panel.x, panel.y, panel.x + panel.w, panel.y + panel.h);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = panel.y + 78;
  const left = panel.x + 48;
  const maxW = panel.w - 96;
  if (withNumbers) {
    const rows = [
      ['row.moneyIn', r.moneyIn], ['row.netRevenue', r.netRevenue], ['row.cm1', r.cm1], ['row.cm3', r.cm3], ['row.ebitda', r.ebitda], ['row.net', r.netProfit],
    ];
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = C.gold;
    ctx.fillText(t('res.title'), left, y);
    y += 22;
    for (const [k, v] of rows) {
      y += 58;
      const isNet = k === 'row.net';
      ctx.font = `${isNet ? 600 : 400} 32px ${SANS}`;
      ctx.fillStyle = C.cream;
      ctx.fillText(t(k), left, y);
      ctx.textAlign = 'right';
      ctx.font = `700 32px ${MONO}`;
      ctx.fillStyle = isNet ? (v >= 0 ? C.mint : C.coral) : v < 0 ? C.coral : C.cream;
      ctx.fillText(formatINR(v), panel.x + panel.w - 48, y);
      ctx.textAlign = 'left';
      if (!isNet) {
        ctx.fillStyle = 'rgba(243,238,230,.12)';
        ctx.fillRect(left, y + 20, maxW, 2);
      }
    }
    ctx.font = `400 26px ${MONO}`;
    ctx.fillStyle = C.lavender;
    ctx.fillText(url, left, panel.y + panel.h - 34);
  } else {
    ctx.font = `600 44px ${SANS}`;
    ctx.fillStyle = C.cream;
    const line = has ? t(keep ? 'card.keep' : 'card.lose', { x: formatPer100(p) }) : t('hero.zero');
    for (const l of wrap(ctx, line, maxW - 120)) { ctx.fillText(l, left, y); y += 58; }
    ctx.font = `800 40px ${DISPLAY}`;
    ctx.fillStyle = C.gold;
    ctx.fillText(t('card.ask'), left, y + 8);
    y += 84;
    ctx.font = `700 32px ${MONO}`;
    ctx.fillStyle = C.lavender;
    ctx.fillText(url, left, y);
    y += 44;
    ctx.font = `400 24px ${SANS}`;
    ctx.fillStyle = 'rgba(243,238,230,.75)';
    ctx.fillText(t('card.private'), left, y);
  }
  drawCraft(ctx, panel.x + panel.w - 120, panel.y - 30, 1.1, keep);

  grain(ctx, 0.09);
  return toBlob(cv);
}

async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const sample = 'Aa₹0123456789मुनाफ़ा';
  await Promise.all([
    `600 40px Poppins`, `400 40px Poppins`, `800 40px Unbounded`, `700 32px "Space Mono"`, `400 32px "Space Mono"`,
  ].map((f) => document.fonts.load(f, sample).catch(() => null)));
}

function drawSky(ctx, horizonY, keep) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, '#12095a');
  g.addColorStop(0.55, C.deep);
  g.addColorStop(1, C.canvas);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizonY);
  // Stars and twinkles
  ctx.fillStyle = C.cream;
  const stars = [[90, 80], [260, 150], [420, 60], [700, 110], [980, 70], [870, 220], [150, 300], [1010, 330], [560, 40]];
  for (const [x, y] of stars) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
  twinkle(ctx, 120, 170, 22); twinkle(ctx, 940, 150, 16); twinkle(ctx, 330, 90, 12);
  // Halo ring and planet
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, horizonY); ctx.clip();
  ctx.strokeStyle = 'rgba(199,168,240,.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(820, horizonY, 330, 320, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = C.mint;
  ctx.beginPath(); ctx.arc(820, horizonY, 280, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.teal;
  ctx.beginPath(); ctx.arc(820, horizonY, 280, -Math.PI / 2, Math.PI / 2); ctx.ellipse(820, horizonY, 150, 280, 0, Math.PI / 2, -Math.PI / 2, true); ctx.fill();
  ctx.fillStyle = C.peri;
  for (const [x, y, rr] of [[680, horizonY - 170, 40], [820, horizonY - 230, 30], [970, horizonY - 170, 46], [1040, horizonY - 60, 24], [640, horizonY - 60, 22]]) {
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
  }
  // Sliced sun: higher on a profit, dipping on a loss.
  const sunY = horizonY - (keep ? 130 : 55);
  ctx.save();
  // Clip to horizontal bands so the sun's lower half reads as slices.
  ctx.beginPath();
  let top = sunY - 140;
  for (let i = 0; i < 5; i++) {
    const gapY = sunY + 20 + i * 24 + i * i * 2;
    ctx.rect(40, top, 340, gapY - top);
    top = gapY + 4 + i * 2;
  }
  ctx.rect(40, top, 340, sunY + 140 - top);
  ctx.clip();
  ctx.fillStyle = C.coral;
  ctx.beginPath(); ctx.arc(210, sunY, 130, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,68,31,.55)';
  ctx.beginPath(); ctx.arc(210, sunY, 130, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.restore();
  // Clouds
  ctx.fillStyle = C.salmon;
  cloud(ctx, -40, horizonY, 1.5);
  cloud(ctx, 700, horizonY, 1.8);
  ctx.restore();
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, horizonY - 6, W, 14);
}

function cloud(ctx, x, base, s) {
  ctx.beginPath();
  ctx.arc(x + 40 * s, base - 30 * s, 34 * s, 0, Math.PI * 2);
  ctx.arc(x + 90 * s, base - 52 * s, 46 * s, 0, Math.PI * 2);
  ctx.arc(x + 150 * s, base - 34 * s, 36 * s, 0, Math.PI * 2);
  ctx.arc(x + 190 * s, base - 18 * s, 24 * s, 0, Math.PI * 2);
  ctx.rect(x + 6 * s, base - 30 * s, 200 * s, 30 * s);
  ctx.fill();
}

function twinkle(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

function drawFloor(ctx, horizonY) {
  ctx.fillStyle = C.coral;
  ctx.fillRect(0, horizonY + 8, W, H - horizonY);
  ctx.strokeStyle = C.butter;
  ctx.lineWidth = 3;
  const vx = W / 2;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath(); ctx.moveTo(vx + i * 14, horizonY + 8); ctx.lineTo(vx + i * 160, H); ctx.stroke();
  }
  for (let k = 1; k < 16; k++) {
    const y = horizonY + 8 + Math.pow(k, 1.9) * 4;
    if (y > H) break;
    ctx.lineWidth = 1.5 + k * 0.25;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const fade = ctx.createLinearGradient(0, horizonY, 0, horizonY + 120);
  fade.addColorStop(0, 'rgba(18,14,11,.6)');
  fade.addColorStop(1, 'rgba(18,14,11,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, horizonY, W, 120);
}

function drawOrb(ctx, o, r, cat) {
  // Iridescent rim
  ctx.save();
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 8, 0, Math.PI * 2);
  ctx.fillStyle = iridescent(ctx, o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r, o);
  ctx.fill();
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = C.ink;
  ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
  // Refracted cost bands, flipped: bigger costs make thicker bands.
  const cats = [
    [cat.running, r.fixedCosts], [cat.marketing, r.marketing], [cat.selling, r.sellingCosts],
    [cat.cogs, r.cogs], [cat.returns, r.returns + r.compositionTax], [cat.gst, r.gstInsideMoneyIn],
  ];
  const total = cats.reduce((a, [, v]) => a + Math.max(0, v), 0) || 1;
  if ('filter' in ctx) ctx.filter = `blur(${Math.round(o.r * 0.12)}px)`;
  let y = o.y - o.r;
  cats.forEach(([color, v], i) => {
    const h = (0.06 + (Math.max(0, v) / total) * 0.8) * o.r * 2 * 0.75;
    const g = ctx.createLinearGradient(o.x - o.r, 0, o.x + o.r, 0);
    g.addColorStop(0, color);
    g.addColorStop(0.5, i % 2 ? C.lime : C.pink);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(o.x - o.r * 1.2, y, o.r * 2.4, h);
    y += h * 1.05;
  });
  ctx.globalAlpha = 1;
  if ('filter' in ctx) ctx.filter = 'none';
  // Dark glass centre so the number always reads clearly.
  const shade = ctx.createRadialGradient(o.x, o.y, o.r * 0.1, o.x, o.y, o.r);
  shade.addColorStop(0, 'rgba(18,14,11,.94)');
  shade.addColorStop(0.62, 'rgba(18,14,11,.82)');
  shade.addColorStop(1, 'rgba(18,14,11,.25)');
  ctx.fillStyle = shade;
  ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
  // Specular highlight
  const hl = ctx.createRadialGradient(o.x - o.r * 0.4, o.y - o.r * 0.5, 2, o.x - o.r * 0.4, o.y - o.r * 0.5, o.r * 0.5);
  hl.addColorStop(0, 'rgba(255,255,255,.28)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
  ctx.restore();
}

function iridescent(ctx, x0, y0, x1, y1, centre) {
  const stops = ['#ffffff', C.lavender, C.mint, C.pink, '#ffffff'];
  let g;
  if (centre && typeof ctx.createConicGradient === 'function') g = ctx.createConicGradient(0, centre.x, centre.y);
  else g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

function drawCraft(ctx, x, y, s, keep) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // trail: mint for profit, coral for loss
  ctx.strokeStyle = keep ? C.mint : C.coral;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-70, 36); ctx.lineTo(-20, 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-60, 52); ctx.lineTo(-24, 46); ctx.stroke();
  const poly = (pts, fill) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  poly([[60, 6], [6, 44], [54, 36]], C.coral);
  poly([[60, 6], [114, 44], [66, 36]], '#C8441F');
  poly([[54, 36], [60, 6], [60, 54]], '#8C8CFA');
  poly([[66, 36], [60, 6], [60, 54]], C.peri);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Film grain from a small random tile.
function grain(ctx, alpha) {
  const n = document.createElement('canvas');
  n.width = 160;
  n.height = 160;
  const nc = n.getContext('2d');
  const img = nc.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  nc.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(n, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function toBlob(cv) {
  return new Promise((resolve, reject) => {
    if (cv.toBlob) {
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png');
      return;
    }
    // Old browsers: decode the data URL by hand (no fetch: the page has no network access).
    const data = cv.toDataURL('image/png').split(',')[1];
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    resolve(new Blob([arr], { type: 'image/png' }));
  });
}
