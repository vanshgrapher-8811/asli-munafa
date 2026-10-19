// Asli Munafa UI. Renders the input flow, results and the four worlds.
// No network calls: nothing here fetches, posts, beacons or loads anything remote.

import { calculate, validate, applyWhatIf, depreciationFromAsset, parseNumber, EMPTY_INPUT } from './engine.js';
import { PRESETS, PRESET_ORDER } from './presets.js';
import { translate, GLOSSARY, formatINR, formatShort, formatPer100, formatPct, formatPlain } from './i18n.js';
import { CONFIG } from './config.js';
import { renderShareCard } from './share.js';

// ---------------------------------------------------------------------------
// Field and step definitions

const FIELDS = {
  moneyIn: { kind: 'money', big: true },
  gstIncluded: { kind: 'yesno', show: (s) => s.raw.gstMode === 'regular' },
  orders: { kind: 'count' },
  gstMode: { kind: 'choice', options: ['regular', 'composition', 'none'] },
  gstRate: { kind: 'gstRate', show: (s) => s.raw.gstMode === 'regular' },
  compositionRate: { kind: 'pct', show: (s) => s.raw.gstMode === 'composition' },
  gstNone: { kind: 'note', show: (s) => s.raw.gstMode === 'none' },
  returns: { kind: 'returns' },
  cogs: { kind: 'money' },
  packaging: { kind: 'money' },
  shipping: { kind: 'money' },
  paymentFeePct: { kind: 'pct' },
  commissionPct: { kind: 'pct' },
  otherVariable: { kind: 'money' },
  marketing: { kind: 'money' },
  rent: { kind: 'money' },
  staff: { kind: 'money' },
  ownerSalary: { kind: 'money' },
  utilities: { kind: 'money' },
  otherFixed: { kind: 'money' },
  interest: { kind: 'money' },
  depreciation: { kind: 'money', helper: 'dep' },
  taxRate: { kind: 'pct' },
};

const STEPS = [
  { id: 's1', fields: ['moneyIn', 'gstIncluded', 'orders'] },
  { id: 's2', fields: ['gstMode', 'gstRate', 'compositionRate', 'gstNone'] },
  { id: 's3', fields: ['returns'] },
  { id: 's4', fields: ['cogs'] },
  { id: 's5', fields: ['packaging', 'shipping'] },
  { id: 's6', fields: ['paymentFeePct', 'commissionPct', 'otherVariable'] },
  { id: 's7', fields: ['marketing'] },
  { id: 's8', fields: ['rent', 'staff', 'ownerSalary'] },
  { id: 's9', fields: ['utilities', 'otherFixed'] },
  { id: 's10', fields: ['interest', 'depreciation'], optional: true },
  { id: 's11', fields: ['taxRate'], optional: true },
];

const CASH_FIELDS = ['stockBought', 'udhaarGiven', 'udhaarCollected', 'supplierCredit', 'supplierPaid', 'loanPrincipal', 'personalWithdrawals'];
const GST_CHIPS = ['0', '5', '18', '40'];
const WHATIF = [
  { key: 'price', min: -10, max: 10, step: 1 },
  { key: 'returns', min: -50, max: 50, step: 5 },
  { key: 'marketing', min: -50, max: 50, step: 5 },
  { key: 'fixed', min: -20, max: 20, step: 2 },
];

// Chart colours by cost category (fixed order; text labels always sit beside them).
const CAT = {
  gst: '#C7A8F0', returns: '#F24FA7', cogs: '#F5E15B', selling: '#F6A99B',
  marketing: '#6C6CF5', running: '#E08A1E', intdep: '#F2D6CF', tax: '#F7C948',
};
const LEAK_CAT = {
  returns: 'returns', compositionTax: 'returns', cogs: 'cogs', delivery: 'selling', fees: 'selling', otherVariable: 'selling',
  marketing: 'marketing', rent: 'running', staff: 'running', utilities: 'running', otherFixed: 'running', interest: 'intdep',
};
const LEAK_GAIN = { returns: 0.5, cogs: 0.05, delivery: 0.1, fees: 0.2, otherVariable: 0.1, marketing: 0.2, rent: 0.1, staff: 0.1, utilities: 0.15, otherFixed: 0.15 };

// ---------------------------------------------------------------------------
// State

const state = {
  lang: 'en',
  type: 'd2c',
  raw: {},
  examples: new Set(),
  edited: new Set(),
  whatIf: { price: 0, returns: 0, marketing: 0, fixed: 0 },
  remember: false,
  showTable: false,
  active: 0,
  burstDone: false,
  lastNet: null,
  result: null,
  base: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const t = (key, vars) => translate(state.lang, key, vars, state.type);
const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rawFromValues(v) {
  const raw = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'number') raw[k] = formatPlain(val);
    else if (val === null) raw[k] = '';
    else raw[k] = val;
  }
  const rate = String(v.gstRate ?? 18);
  raw.gstRateChoice = GST_CHIPS.includes(rate) ? rate : 'custom';
  raw.gstRate = rate;
  raw.returnsValue = v.returnsMode === 'amount' ? formatPlain(v.returnsAmount) : String(v.returnsPct ?? '');
  raw.paymentFeePct = String(v.paymentFeePct ?? '');
  raw.commissionPct = String(v.commissionPct ?? '');
  raw.taxRate = String(v.taxRate ?? '');
  raw.compositionRate = String(v.compositionRate ?? 1);
  return raw;
}

function engineInput() {
  const r = state.raw;
  const out = {};
  for (const k of [...Object.keys(EMPTY_INPUT)]) if (k in r) out[k] = r[k];
  out.gstIncluded = r.gstIncluded !== false;
  out.gstRate = r.gstRateChoice === 'custom' ? r.gstRate : r.gstRateChoice;
  if (r.returnsMode === 'amount') { out.returnsAmount = r.returnsValue; out.returnsPct = ''; }
  else { out.returnsPct = r.returnsValue; out.returnsAmount = ''; }
  return out;
}

const NUMERIC_KEYS = new Set([
  ...Object.keys(FIELDS).filter((k) => ['money', 'pct', 'count'].includes(FIELDS[k].kind)),
  'returnsValue', 'gstRate', ...CASH_FIELDS,
]);

// Fill fields from a business type's examples. Anything the owner typed or picked stays.
function loadPreset(type, { keepUserValues = true } = {}) {
  const preset = PRESETS[type] || PRESETS.blank;
  const fresh = rawFromValues(preset.example);
  if (!keepUserValues) state.edited = new Set();
  const next = {};
  const examples = new Set();
  for (const [k, v0] of Object.entries(fresh)) {
    let v = v0;
    if (type === 'blank' && NUMERIC_KEYS.has(k) && k !== 'gstRate' && k !== 'compositionRate') v = '';
    if (keepUserValues && state.edited.has(k) && k in state.raw) { next[k] = state.raw[k]; continue; }
    next[k] = v;
    if (type !== 'blank' && NUMERIC_KEYS.has(k) && v !== '' && v !== '0' && k !== 'gstRate' && k !== 'compositionRate') examples.add(k);
  }
  state.raw = next;
  state.examples = examples;
  state.type = type;
}

// ---------------------------------------------------------------------------
// Rendering: inputs

function fieldId(k) { return `f-${k}`; }

function moneyInput(k, opts = {}) {
  const val = state.raw[k] ?? '';
  const ex = state.examples.has(k);
  return `<div class="inbox ${opts.big ? 'big' : ''} ${ex ? 'is-example' : ''}">
    <span class="pre" aria-hidden="true">₹</span>
    <input id="${fieldId(k)}" data-k="${k}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next"
      value="${esc(val)}" placeholder="0" aria-describedby="h-${k} e-${k}">
    ${ex ? `<span class="ex-tag">${esc(t('example.tag'))}</span>` : ''}
  </div>`;
}

function pctInput(k, value = state.raw[k] ?? '', dataKey = k) {
  const ex = state.examples.has(dataKey);
  return `<div class="inbox pct ${ex ? 'is-example' : ''}">
    <input id="${fieldId(dataKey)}" data-k="${dataKey}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next"
      value="${esc(value)}" placeholder="0" aria-describedby="h-${dataKey} e-${dataKey}">
    <span class="post" aria-hidden="true">%</span>
    ${ex ? `<span class="ex-tag">${esc(t('example.tag'))}</span>` : ''}
  </div>`;
}

function hint(k, text) {
  return `<p class="hint" id="h-${k}">${esc(text)}</p><p class="err" id="e-${k}" hidden></p>`;
}

function segmented(name, options, current, labelId) {
  return `<div class="seg" role="radiogroup" aria-labelledby="${labelId}">
    ${options.map(([val, label]) => `<button type="button" role="radio" class="seg-btn" data-seg="${name}" data-val="${esc(val)}"
      aria-checked="${String(val) === String(current)}">${esc(label)}</button>`).join('')}
  </div>`;
}

function renderField(k) {
  const def = FIELDS[k];
  if (def.show && !def.show(state)) return '';
  const label = t(`field.${k}.label`);
  const hintText = t(`field.${k}.hint`);
  const hasHint = hintText !== `field.${k}.hint`;
  switch (def.kind) {
    case 'money': {
      let extra = '';
      if (k === 'moneyIn') extra = `<p class="short" id="short-moneyIn" aria-hidden="true"></p>`;
      if (def.helper === 'dep') extra = depHelper();
      return `<div class="field" data-field="${k}">
        <label for="${fieldId(k)}">${esc(label)}</label>${moneyInput(k, def)}${extra}${hint(k, hasHint ? hintText : t('hint.empty'))}</div>`;
    }
    case 'count':
      return `<div class="field" data-field="${k}">
        <label for="${fieldId(k)}">${esc(label)}</label>
        <div class="inbox ${state.examples.has(k) ? 'is-example' : ''}"><input id="${fieldId(k)}" data-k="${k}" type="text" inputmode="numeric" autocomplete="off" value="${esc(state.raw[k] ?? '')}" placeholder="0" aria-describedby="h-${k} e-${k}">
        ${state.examples.has(k) ? `<span class="ex-tag">${esc(t('example.tag'))}</span>` : ''}</div>
        ${hint(k, hintText)}</div>`;
    case 'pct':
      return `<div class="field" data-field="${k}">
        <label for="${fieldId(k)}">${esc(label)}</label>${pctInput(k)}${hint(k, hasHint ? hintText : t('hint.empty'))}</div>`;
    case 'yesno':
      return `<div class="field" data-field="${k}">
        <span class="label" id="l-${k}">${esc(label)}</span>
        ${segmented(k, [[true, t('yes')], [false, t('no')]], state.raw.gstIncluded !== false, `l-${k}`)}</div>`;
    case 'choice':
      return `<div class="field" data-field="${k}">
        <span class="label" id="l-${k}">${esc(label)}</span>
        ${segmented(k, def.options.map((o) => [o, t(`gstMode.${o}`)]), state.raw.gstMode, `l-${k}`)}</div>`;
    case 'gstRate': {
      const choice = state.raw.gstRateChoice;
      return `<div class="field" data-field="${k}">
        <span class="label" id="l-${k}">${esc(label)}</span>
        ${segmented('gstRateChoice', [...GST_CHIPS.map((c) => [c, `${c}%`]), ['custom', t('field.gstRate.custom')]], choice, `l-${k}`)}
        ${choice === 'custom' ? `<label class="sub-label" for="${fieldId('gstRate')}">${esc(t('field.gstRateCustom.label'))}</label>${pctInput('gstRate')}` : ''}
        <p class="err" id="e-gstRate" hidden></p>
        <p class="hint" id="h-gstRate">${esc(t('field.gstRate.hint'))}</p></div>`;
    }
    case 'note':
      return `<p class="note">${esc(t('field.none.note'))}</p>`;
    case 'returns': {
      const mode = state.raw.returnsMode === 'amount' ? 'amount' : 'pct';
      const input = mode === 'amount' ? moneyInput('returnsValue') : pctInput('returnsValue');
      return `<div class="field" data-field="returns">
        <label for="${fieldId('returnsValue')}">${esc(t('field.returns.label'))}</label>
        ${segmented('returnsMode', [['pct', t('unit.pct')], ['amount', t('unit.amount')]], mode, 'l-returnsMode')}
        <span class="sr-only" id="l-returnsMode">${esc(t('field.returns.label'))}</span>
        ${input}${hint('returnsValue', t('field.returns.hint'))}</div>`;
    }
    default: return '';
  }
}

function depHelper() {
  return `<details class="dep-helper"><summary>${esc(t('dep.helper'))}</summary>
    <div class="dep-row">
      <div><label for="dep-cost">${esc(t('dep.cost'))}</label><div class="inbox"><span class="pre" aria-hidden="true">₹</span><input id="dep-cost" type="text" inputmode="decimal" autocomplete="off" placeholder="0"></div></div>
      <div><label for="dep-years">${esc(t('dep.years'))}</label><div class="inbox"><input id="dep-years" type="text" inputmode="decimal" autocomplete="off" placeholder="5"></div></div>
    </div>
    <button type="button" class="chip-btn" id="dep-use" disabled>${esc(t('dep.use', { amount: '₹0' }))}</button>
  </details>`;
}

function renderSteps() {
  const total = STEPS.length;
  const html = STEPS.map((s, i) => {
    const hasExample = s.fields.some((f) => state.examples.has(f) || (f === 'returns' && state.examples.has('returnsValue')));
    const last = i === total - 1;
    return `<section class="card step" data-step="${i + 1}" aria-labelledby="${s.id}-title">
      <div class="step-head">
        <span class="step-num">${esc(t('step.of', { n: i + 1, total }))}${s.optional ? ` · ${esc(t('step.optional'))}` : ''}</span>
        ${hasExample ? `<span class="ex-tag card-tag">${esc(t('example.tag'))}</span>` : ''}
      </div>
      <h3 id="${s.id}-title">${esc(t(`${s.id}.title`))}</h3>
      <p class="card-sub">${esc(t(`${s.id}.sub`))}</p>
      <div class="fields">${s.fields.map(renderField).join('')}</div>
      <div class="step-nav">
        ${i > 0 ? `<button type="button" class="btn-ghost" data-nav="back">${esc(t('btn.back'))}</button>` : '<span></span>'}
        <button type="button" class="${last ? 'btn-primary' : 'btn-next'}" data-nav="${last ? 'see' : 'next'}">${esc(last ? t('btn.see') : t('btn.next'))}</button>
      </div>
    </section>`;
  }).join('');
  $('#steps').innerHTML = html;
  $('#example-banner').hidden = state.examples.size === 0;
  updateShort();
  requestAnimationFrame(() => placeSelbox(state.active, true));
}

function renderTypes() {
  const keys = [...PRESET_ORDER, 'blank'];
  $('#types').innerHTML = keys.map((k) => `<button type="button" class="type" role="radio" data-type="${k}" aria-checked="${state.type === k}">
      ${typeIcon(PRESETS[k].icon)}
      <span class="type-name">${esc(translate(state.lang, `type.${k}`))}</span>
      <span class="type-sub">${esc(translate(state.lang, `type.${k}.sub`))}</span>
    </button>`).join('');
}

// Faceted two-tone icons: one light face, one dark face.
function typeIcon(name) {
  const icons = {
    parcel: '<polygon points="4,9 16,4 28,9 16,14" fill="#F7C948"/><polygon points="4,9 16,14 16,28 4,22" fill="#F0603A"/><polygon points="16,14 28,9 28,22 16,28" fill="#C8441F"/>',
    shop: '<polygon points="3,12 6,4 26,4 29,12" fill="#F7C948"/><rect x="5" y="12" width="11" height="15" fill="#7FE0DC"/><rect x="16" y="12" width="11" height="15" fill="#2EC4A6"/><rect x="12" y="18" width="8" height="9" fill="#120E0B"/>',
    cup: '<polygon points="5,9 16,9 15,27 8,27" fill="#F2D6CF"/><polygon points="16,9 26,9 23,27 15,27" fill="#F6A99B"/><path d="M25 13h3a3 3 0 0 1 0 6h-4" fill="none" stroke="#F6A99B" stroke-width="2.4"/><path d="M11 6c0-2 2-2 2-4M17 6c0-2 2-2 2-4" stroke="#C7A8F0" stroke-width="1.6" fill="none"/>',
    spark: '<polygon points="16,2 19,13 16,16 13,13" fill="#C7A8F0"/><polygon points="16,30 13,19 16,16 19,19" fill="#6C6CF5"/><polygon points="2,16 13,13 16,16 13,19" fill="#F24FA7"/><polygon points="30,16 19,19 16,16 19,13" fill="#C7A8F0"/>',
    gear: '<circle cx="16" cy="16" r="10" fill="#7FE0DC"/><path d="M16 6a10 10 0 0 1 0 20z" fill="#2EC4A6"/><g fill="#120E0B"><rect x="14" y="2" width="4" height="5"/><rect x="14" y="25" width="4" height="5"/><rect x="2" y="14" width="5" height="4"/><rect x="25" y="14" width="5" height="4"/></g><circle cx="16" cy="16" r="4" fill="#120E0B"/>',
    blank: '<rect x="6" y="4" width="20" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/><path d="M16 11v10M11 16h10" stroke="currentColor" stroke-width="2"/>',
  };
  return `<svg class="type-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${icons[name] || icons.blank}</svg>`;
}

function renderCashFields() {
  const cogs = state.result ? formatINR(state.result.cogs) : '';
  $('#cash-fields').innerHTML = CASH_FIELDS.map((k) => {
    const hintText = t(`field.${k}.hint`);
    const h = hintText === `field.${k}.hint` ? '' : hintText;
    const extra = k === 'stockBought' && cogs ? ` (${t('row.cogs')}: ${cogs})` : '';
    return `<div class="field" data-field="${k}"><label for="${fieldId(k)}">${esc(t(`field.${k}.label`))}</label>${moneyInput(k)}${hint(k, (h + extra).trim() || t('hint.empty'))}</div>`;
  }).join('');
}

function renderWhatIfSliders() {
  $('#wi-sliders').innerHTML = WHATIF.map((w) => `<div class="wi-row">
      <label for="wi-${w.key}">${esc(t(`wi.${w.key}`))}</label>
      <output id="wi-${w.key}-out" for="wi-${w.key}">${fmtSigned(state.whatIf[w.key])}</output>
      <input type="range" id="wi-${w.key}" data-wi="${w.key}" min="${w.min}" max="${w.max}" step="${w.step}" value="${state.whatIf[w.key]}"
        aria-valuetext="${fmtSigned(state.whatIf[w.key])}">
      <span class="wi-min" aria-hidden="true">${w.min}%</span><span class="wi-max" aria-hidden="true">+${w.max}%</span>
    </div>`).join('');
}

function fmtSigned(n) { return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`; }

function renderGlossary() {
  const items = GLOSSARY[state.lang] || GLOSSARY.en;
  $('#glossary').innerHTML = items.map(([key, title, def, ex, why]) => `<details class="term" id="term-${key}">
      <summary><span>${esc(title)}</span><span class="chev" aria-hidden="true"></span></summary>
      <p class="term-def">${esc(def)}</p>
      <p class="term-ex"><strong>${esc(t('learn.example'))}:</strong> ${esc(ex)}</p>
      <p class="term-why"><strong>${esc(t('learn.why'))}:</strong> ${esc(why)}</p>
    </details>`).join('');
}

function renderStatic() {
  document.documentElement.lang = state.lang === 'hi' ? 'hi' : 'en';
  for (const el of $$('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of $$('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  $('#lang-btn').setAttribute('lang', state.lang === 'hi' ? 'en' : 'hi');
  $('#ladder-toggle').textContent = t(state.showTable ? 'ladder.asChart' : 'ladder.asTable');
  $('#cta-action').innerHTML = esc(t('cta.action', { handle: CONFIG.INSTAGRAM_HANDLE }));
  for (const id of ['#privacy-code', '#footer-code']) $(id).href = CONFIG.GITHUB_URL;
  $('#privacy-code').textContent = CONFIG.GITHUB_URL.replace(/^https?:\/\//, '');
  document.title = `${t('app.title')} · ${t('app.tagline')}`;
}

function renderAll() {
  renderStatic();
  renderTypes();
  renderSteps();
  renderCashFields();
  renderWhatIfSliders();
  renderGlossary();
  update(true);
}

// ---------------------------------------------------------------------------
// Rendering: results

let pending = 0;
function scheduleUpdate() {
  if (pending) return;
  pending = setTimeout(() => { pending = 0; update(); }, 16);
}

function whatIfActive() { return Object.values(state.whatIf).some((v) => v !== 0); }

function update(force = false) {
  const { values, errors } = validate(engineInput());
  const base = calculate(values);
  const res = whatIfActive() ? calculate(applyWhatIf(values, state.whatIf)) : base;
  const prevNet = state.result ? state.result.netProfit : null;
  state.base = base;
  state.result = res;
  renderErrors(errors);
  renderHero(res, force);
  renderLadder(res);
  renderThought(res);
  renderLeaks(res);
  renderBreakEven(res);
  renderPerOrder(res);
  renderFlags(res);
  renderWhatIfOut(res, base);
  renderCash(res);
  renderLive(res);
  setCraft(res);
  $('#res-example').hidden = state.examples.size === 0;
  $('#res-whatif').hidden = !whatIfActive();
  // Sunburst when a what-if turns a loss into a profit.
  if (prevNet !== null && prevNet <= 0 && res.netProfit > 0 && res.moneyIn > 0 && whatIfActive()) playBurst();
  persist();
}

function renderErrors(errors) {
  const map = { returnsPct: 'returnsValue', returnsAmount: 'returnsValue' };
  for (const el of $$('.err')) { el.hidden = true; el.textContent = ''; }
  for (const el of $$('input[data-k]')) el.removeAttribute('aria-invalid');
  for (const [k, code] of Object.entries(errors)) {
    const id = map[k] || k;
    const el = document.getElementById(`e-${id}`);
    const input = document.getElementById(fieldId(id));
    if (el) { el.textContent = t(`err.${code}`); el.hidden = false; }
    if (input) input.setAttribute('aria-invalid', 'true');
  }
}

function updateShort() {
  const el = $('#short-moneyIn');
  if (!el) return;
  const n = parseNumber(state.raw.moneyIn);
  el.textContent = Number.isFinite(n) && n >= 100000 ? `≈ ${formatShort(n, state.lang)} ${t('unit.perMonth')}` : '';
}

let orbTween = null;
function renderHero(r, force) {
  const has = r.moneyIn > 0;
  const keep = r.netProfit >= 0;
  const p = r.per100.netProfit;
  const lens = $('#lens');
  lens.dataset.state = !has ? 'empty' : keep ? 'profit' : 'loss';
  $('#orb-l1').textContent = has ? t(keep ? 'orb.keep' : 'orb.lose') : '';
  $('#orb-l2').textContent = has ? t('orb.of') : t('orb.empty');
  const valEl = $('#orb-val');
  if (!has) valEl.textContent = '₹—';
  else {
    const from = state.lastNet === null || force ? Math.abs(p) : Math.abs(state.lastNet);
    const to = Math.abs(p);
    if (orbTween) orbTween.stop();
    valEl.textContent = formatPer100(from === to ? to : from);
    orbTween = stepTween(from, to, 420, (v) => { valEl.textContent = formatPer100(v); }, false);
  }
  state.lastNet = has ? p : null;
  $('#hero-line').textContent = has ? t(keep ? 'hero.keep' : 'hero.lose', { x: formatPer100(Math.abs(p)) }) : t('hero.zero');
  $('#hero-month').textContent = has ? t(keep ? 'hero.month.profit' : 'hero.month.loss', { amount: formatINR(Math.abs(r.netProfit)) }) : '';
  $('#hero-month').className = `hero-month ${has ? (keep ? 'pos' : 'neg') : ''}`;
  renderBands(r);
}

// The lens bands: one blurred band per cost category, thickness by its share of money in.
function renderBands(r) {
  const has = r.moneyIn > 0;
  const cats = [
    ['gst', r.gstInsideMoneyIn], ['returns', r.returns + r.compositionTax], ['cogs', r.cogs],
    ['selling', r.sellingCosts], ['marketing', r.marketing], ['running', r.fixedCosts],
  ];
  const total = cats.reduce((a, [, v]) => a + Math.max(0, v), 0) || 1;
  const bands = cats.map(([k, v], i) => {
    const share = has ? Math.max(0, v) / total : 1 / cats.length;
    const h = 8 + share * 70;
    const accent = i % 2 ? '#5BF27A' : '#F24FA7';
    return `<span class="band b${i}" style="--h:${h.toFixed(1)}%;--c:${CAT[k]};--a:${accent}"></span>`;
  }).join('');
  const key = bands;
  const host = $('#lens-bands');
  if (host.dataset.key !== key) {
    host.innerHTML = bands;
    $('#orb-refract').innerHTML = bands;
    host.dataset.key = key;
  }
}

function ladderRows(r) {
  const rows = [['moneyIn', r.moneyIn, 'total']];
  if (r.gstInsideMoneyIn > 0) rows.push(['gst', -r.gstInsideMoneyIn, 'minus', 'gst']);
  rows.push(['returns', -r.returns, 'minus', 'returns']);
  if (r.compositionTax > 0) rows.push(['compositionTax', -r.compositionTax, 'minus', 'returns']);
  rows.push(
    ['netRevenue', r.netRevenue, 'total'],
    ['cogs', -r.cogs, 'minus', 'cogs'],
    ['cm1', r.cm1, 'total'],
    ['selling', -r.sellingCosts, 'minus', 'selling'],
    ['cm2', r.cm2, 'total'],
    ['marketing', -r.marketing, 'minus', 'marketing'],
    ['cm3', r.cm3, 'total'],
    ['running', -r.fixedCosts, 'minus', 'running'],
    ['ebitda', r.ebitda, 'total'],
    ['intdep', -(r.interest + r.depreciation), 'minus', 'intdep'],
    ['pbt', r.pbt, 'total'],
    ['tax', -r.tax, 'minus', 'tax'],
    ['net', r.netProfit, 'net'],
  );
  return rows;
}

const barState = new Map();
function renderLadder(r) {
  const rows = ladderRows(r);
  // Running position for the floating deduction bars.
  let level = 0;
  const geo = rows.map(([key, v, kind, cat]) => {
    let a; let b;
    if (kind === 'minus') { a = level + v; b = level; level = a; } else { a = Math.min(0, v); b = Math.max(0, v); level = v; }
    return { key, v, kind, cat, a, b };
  });
  const lo = Math.min(0, ...geo.map((g) => g.a));
  const hi = Math.max(1, ...geo.map((g) => g.b));
  const span = hi - lo || 1;
  const x = (v) => ((v - lo) / span) * 100;
  const zero = x(0);

  const host = $('#ladder');
  if (host.children.length !== rows.length || host.dataset.lang !== state.lang) {
    host.dataset.lang = state.lang;
    host.innerHTML = geo.map((g) => `<li class="lrow ${g.kind}" data-key="${g.key}">
        <button type="button" class="lbtn" aria-expanded="false" aria-controls="why-${g.key}">
          <span class="lname">${esc(t(`row.${g.key}`))}</span>
          <span class="lval"><span class="lmoney"></span><span class="lper"></span></span>
          <span class="ltrack" aria-hidden="true"><span class="lzero"></span><span class="lbar"></span></span>
        </button>
        <p class="lwhy" id="why-${g.key}" hidden>${esc(t(`row.${g.key}.why`))}</p>
      </li>`).join('');
    barState.clear();
  }
  geo.forEach((g, i) => {
    const li = host.children[i];
    const bar = $('.lbar', li);
    const color = g.kind === 'minus' ? CAT[g.cat] : g.v >= 0 ? 'var(--pos)' : 'var(--neg)';
    bar.style.background = color;
    li.classList.toggle('negative', g.kind !== 'minus' && g.v < 0);
    $('.lzero', li).style.left = `${zero}%`;
    $('.lmoney', li).textContent = formatINR(g.v);
    $('.lper', li).textContent = t('ladder.per100', { x: formatPer100(r.per100 ? (g.v / (r.moneyIn || 1)) * 100 : 0) });
    const target = { l: x(g.a), w: Math.max(g.b > g.a ? 0.6 : 0, x(g.b) - x(g.a)) };
    const cur = barState.get(g.key) || { l: zero, w: 0, tw: null };
    if (cur.tw) cur.tw.stop();
    const from = { l: cur.l, w: cur.w };
    const st = { l: from.l, w: from.w, tw: null };
    barState.set(g.key, st);
    st.tw = stepTween(0, 1, 500, (k) => {
      st.l = from.l + (target.l - from.l) * k;
      st.w = Math.max(0, from.w + (target.w - from.w) * k);
      bar.style.left = `${st.l}%`;
      bar.style.width = `${st.w}%`;
    }, true, i * 25);
  });
  renderLadderTable(r, geo);
}

function renderLadderTable(r, geo) {
  const rowsHtml = geo.map((g) => `<tr class="${g.kind}"><th scope="row">${esc(t(`row.${g.key}`))}</th>
    <td>${formatINR(g.v)}</td><td>${formatPer100(r.moneyIn ? (g.v / r.moneyIn) * 100 : 0)}</td></tr>`).join('');
  $('#ladder-table').innerHTML = `<table class="ltable"><caption class="sr-only">${esc(t('ladder.title'))}</caption>
    <thead><tr><th scope="col">${esc(t('ladder.col.step'))}</th><th scope="col">${esc(t('ladder.col.month'))}</th><th scope="col">${esc(t('ladder.col.per100'))}</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table>`;
}

function renderThought(r) {
  const has = r.moneyIn > 0;
  const gap = r.naiveProfit - r.netProfit;
  const parts = [
    ['gst', r.gstInsideMoneyIn, 'gst'],
    ['returns', r.returns + r.compositionTax, 'returns'],
    ['selling', r.sellingCosts, 'selling'],
    ['marketing', r.marketing, 'marketing'],
    ['running', r.fixedCosts - r.ownerSalary, 'running'],
    ['owner', r.ownerSalary, 'running'],
    ['loans', r.interest + r.depreciation + r.tax, 'intdep'],
  ].filter(([, v]) => v > 0);
  const max = Math.max(1, ...parts.map(([, v]) => v));
  $('#thought').innerHTML = !has ? `<p class="muted">${esc(t('hero.zero'))}</p>` : `
    <div class="vs">
      <div class="vs-box naive"><span class="vs-label">${esc(t('thought.naive'))}</span><span class="vs-val">${formatShort(r.naiveProfit, state.lang)}</span></div>
      <div class="vs-box real ${r.netProfit >= 0 ? 'pos' : 'neg'}"><span class="vs-label">${esc(t('thought.real'))}</span><span class="vs-val">${formatShort(r.netProfit, state.lang)}</span></div>
    </div>
    <p class="vs-gap"><span>${esc(t('thought.gap'))}</span> <strong>${formatINR(gap)}</strong></p>
    <p class="mini-title">${esc(t('thought.made'))}</p>
    <ul class="diff">${parts.map(([k, v, cat]) => `<li><span class="diff-name"><i style="background:${CAT[cat]}" aria-hidden="true"></i>${esc(t(`thought.${k}`))}</span>
      <span class="diff-bar" aria-hidden="true"><span style="width:${(v / max) * 100}%;background:${CAT[cat]}"></span></span>
      <span class="diff-val">−${formatINR(v).replace('−', '')}</span></li>`).join('')}</ul>`;
}

function renderLeaks(r) {
  if (!r.leaks.length) { $('#leaks').innerHTML = `<li class="muted">${esc(t('leaks.none'))}</li>`; return; }
  $('#leaks').innerHTML = r.leaks.map((l, i) => {
    const gain = LEAK_GAIN[l.key] ? formatINR(l.amount * LEAK_GAIN[l.key]) : '';
    return `<li class="leak">
      <span class="leak-rank" aria-hidden="true">${i + 1}</span>
      <div class="leak-body">
        <div class="leak-head"><span class="leak-name"><i style="background:${CAT[LEAK_CAT[l.key]]}" aria-hidden="true"></i>${esc(t(`leak.${l.key}`))}</span>
          <span class="leak-pct">${formatPct(l.pctOfNR)}</span></div>
        <p>${esc(t(`tip.${l.key}`, { pct: formatPct(l.pctOfNR), gain }))}</p>
      </div></li>`;
  }).join('');
}

function renderBreakEven(r) {
  const be = r.breakEven;
  const gst = r.gstMode === 'regular' && r.gstIncluded ? t('be.incl') : '';
  let html;
  if (be.reason === 'noSales') html = `<p class="muted">${esc(t('be.noSales'))}</p>`;
  else if (!be.reachable) html = `<p class="flag-line neg">${warnIcon()}<span>${esc(t('be.none'))}</span></p>`;
  else {
    const above = be.gap <= 0;
    const max = Math.max(r.moneyIn, be.sales) * 1.15;
    const text = t(above ? 'be.above' : 'be.need', { amount: formatShort(be.sales, state.lang), gap: formatShort(Math.abs(be.gap), state.lang), gst });
    html = `<p>${esc(text)}</p>
      <div class="be-meter ${above ? 'pos' : 'neg'}" aria-hidden="true">
        <span class="be-fill" style="width:${(r.moneyIn / max) * 100}%"></span>
        <span class="be-mark" style="left:${(be.sales / max) * 100}%"></span>
      </div>
      <div class="be-legend" aria-hidden="true"><span><i class="dot ${above ? 'pos' : 'neg'}"></i>${esc(t('row.moneyIn'))}: ${formatShort(r.moneyIn, state.lang)}</span><span><i class="dot mark"></i>${esc(t('be.title'))}: ${formatShort(be.sales, state.lang)}</span></div>`;
  }
  $('#breakeven').innerHTML = html;
}

function renderPerOrder(r) {
  const panel = $('#po-panel');
  panel.hidden = !r.perOrder;
  if (!r.perOrder) return;
  $('#po-sub').textContent = t('po.sub', { n: formatPlain(r.orders) });
  const p = r.perOrder;
  const rows = [['moneyIn', p.moneyIn], ['netRevenue', p.netRevenue], ['cm1', p.cm1], ['cm2', p.cm2], ['cm3', p.cm3], ['net', p.netProfit]];
  const inr2 = (v) => (Math.abs(v) < 100 ? `${v < 0 ? '−' : ''}₹${Math.abs(v).toFixed(2)}` : formatINR(v));
  $('#perorder').innerHTML = `<table class="ltable po"><caption class="sr-only">${esc(t('po.title'))}</caption><tbody>${rows.map(([k, v]) => `<tr class="${k === 'net' ? 'net' : ''}"><th scope="row">${esc(t(`po.${k}`))}</th><td class="${v < 0 ? 'neg-text' : ''}">${inr2(v)}</td></tr>`).join('')}</tbody></table>`;
}

function warnIcon() {
  return '<svg class="ficon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><polygon points="10,2 19,18 1,18" fill="#F0603A"/><polygon points="10,2 19,18 10,18" fill="#C8441F"/><rect x="9" y="7" width="2" height="6" fill="#120E0B"/><rect x="9" y="14.5" width="2" height="2" fill="#120E0B"/></svg>';
}
function okIcon() {
  return '<svg class="ficon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" fill="#7FE0DC"/><path d="M10 1a9 9 0 0 1 0 18z" fill="#2EC4A6"/><path d="M5.5 10.5l3 3 6-7" fill="none" stroke="#120E0B" stroke-width="2.2"/></svg>';
}
function infoIcon() {
  return '<svg class="ficon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" fill="#F7C948"/><path d="M10 1a9 9 0 0 1 0 18z" fill="#E08A1E"/><rect x="9" y="8.5" width="2" height="6" fill="#120E0B"/><rect x="9" y="5" width="2" height="2" fill="#120E0B"/></svg>';
}

function renderFlags(r) {
  const list = r.flags.filter((f) => f !== 'noSales');
  if (r.moneyIn <= 0) { $('#flags').innerHTML = `<li class="muted">${esc(t('be.noSales'))}</li>`; return; }
  const items = list.map((f) => {
    const serious = ['cm2Negative', 'cm3Negative', 'noNetRevenue', 'belowBreakEven'].includes(f);
    const text = t(`flag.${f}`, { amount: formatINR(r.gstInsideMoneyIn) });
    return `<li class="flag ${serious ? 'neg' : 'info'}">${serious ? warnIcon() : infoIcon()}<span>${esc(text)}</span></li>`;
  });
  if (!list.some((f) => f === 'cm2Negative' || f === 'cm3Negative' || f === 'noNetRevenue') && r.netProfit >= 0) {
    items.push(`<li class="flag pos">${okIcon()}<span>${esc(t('flag.healthy'))}</span></li>`);
  }
  $('#flags').innerHTML = items.join('');
}

function renderWhatIfOut(r, base) {
  const has = r.moneyIn > 0;
  const nv = $('#wi-new');
  nv.textContent = has ? `${formatPer100(r.per100.netProfit)}` : '—';
  nv.className = `wi-out-val ${r.netProfit >= 0 ? 'pos' : 'neg'}`;
  const d = r.netProfit - base.netProfit;
  const cv = $('#wi-change');
  cv.textContent = has ? `${d > 0 ? '+' : ''}${formatINR(d)}` : '—';
  cv.className = `wi-out-val ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`;
}

function renderCash(r) {
  const c = r.cash;
  const sh = document.getElementById('h-stockBought');
  if (sh) sh.textContent = `${t('field.stockBought.hint')} (${t('row.cogs')}: ${formatINR(r.cogs)})`;
  const parts = Object.entries(c.parts).filter(([k, v]) => k === 'netProfit' || Math.round(v) !== 0);
  $('#cash-out').innerHTML = `<ul class="cash-parts">${parts.map(([k, v]) => `<li><span>${esc(t(`cash.p.${k}`))}</span><span class="${v < 0 ? 'neg-text' : 'pos-text'}">${v > 0 && k !== 'netProfit' ? '+' : ''}${formatINR(v)}</span></li>`).join('')}</ul>
    <p class="cash-total"><span>${esc(t('cash.result'))}</span><strong class="${c.change < 0 ? 'neg-text' : 'pos-text'}">${c.change > 0 ? '+' : ''}${formatINR(c.change)}</strong></p>`;
}

function renderLive(r) {
  const has = r.moneyIn > 0;
  const el = $('#live-text');
  const lb = $('#livebar');
  lb.dataset.state = !has ? 'empty' : r.netProfit >= 0 ? 'profit' : 'loss';
  el.innerHTML = !has ? esc(t('live.empty'))
    : esc(t(r.netProfit >= 0 ? 'live.keep' : 'live.lose', { x: '§' })).replace('§', `<strong>${formatPer100(Math.abs(r.per100.netProfit))}</strong>`);
}

// ---------------------------------------------------------------------------
// Motion: backgrounds flow (CSS), objects step (12 drawings per second, springy overshoot).

const STEP_MS = 1000 / 12;
function easeOutBack(x) { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

function stepTween(from, to, duration, apply, spring = true, delay = 0) {
  if (reducedMotion() || duration <= 0 || document.hidden) { apply(to); return { stop() {} }; }
  // Objects step: one drawing every 1/12 s, on a timer (no need for 60 fps frames).
  let timer = 0;
  let step = 0;
  const total = Math.max(1, Math.round(duration / STEP_MS));
  const tick = () => {
    step += 1;
    const p = Math.min(1, step / total);
    apply(from + (to - from) * (spring ? easeOutBack(p) : 1 - Math.pow(1 - p, 3)));
    if (p < 1) timer = setTimeout(tick, STEP_MS);
  };
  timer = setTimeout(tick, delay);
  return { stop() { clearTimeout(timer); } };
}

// Canvas selection box: jumps to the active card.
let selTween = null;
let selRect = null;
function placeSelbox(index, instant = false) {
  const cards = $$('#calc .card.step');
  const card = cards[index] || cards[0];
  const box = $('#selbox');
  if (!card || !box) return;
  const host = $('#calc').getBoundingClientRect();
  const r = card.getBoundingClientRect();
  const pad = 6;
  const target = { x: r.left - host.left - pad, y: r.top - host.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
  const from = selRect || target;
  selRect = target;
  const apply = (k) => {
    box.style.transform = `translate(${from.x + (target.x - from.x) * k}px, ${from.y + (target.y - from.y) * k}px)`;
    box.style.width = `${from.w + (target.w - from.w) * k}px`;
    box.style.height = `${from.h + (target.h - from.h) * k}px`;
  };
  if (selTween) selTween.stop();
  if (instant) apply(1); else selTween = stepTween(0, 1, 420, apply, true);
  box.classList.add('on');
}

function setActive(i, opts = {}) {
  const changed = i !== state.active;
  state.active = i;
  $$('#calc .card.step').forEach((c, idx) => c.classList.toggle('active', idx === i));
  if (changed || opts.force) placeSelbox(i);
}

// Horizon: the craft rises with profit and skims the floor with a loss; the sun dips on a loss.
let craftTween = null;
let craftLift = null;
function setCraft(r) {
  const hz = $('#horizon');
  const s = r.moneyIn <= 0 ? 'idle' : r.netProfit >= 0 ? 'profit' : 'loss';
  hz.dataset.state = s;
  const target = { idle: 0.5, profit: 1, loss: 0 }[s];
  if (craftLift === target) return;
  const from = craftLift ?? 0.5;
  craftLift = target;
  if (craftTween) craftTween.stop();
  craftTween = stepTween(from, target, 700, (k) => {
    hz.style.setProperty('--lift', k.toFixed(3));
  }, true);
}

function playBurst() {
  const b = $('#burst');
  b.classList.remove('play');
  void b.offsetWidth; // restart the animation
  b.classList.add('play');
  const done = () => b.classList.remove('play');
  b.addEventListener('animationend', done, { once: true });
  setTimeout(done, 1600);
}

// ---------------------------------------------------------------------------
// Persistence: only when "Remember on this device" is on.

function persist() {
  if (!state.remember) return;
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ v: 1, type: state.type, raw: state.raw, examples: [...state.examples], edited: [...state.edited], lang: state.lang }));
  } catch (e) { /* storage blocked: fine, nothing is saved */ }
}

function restore() {
  try {
    const s = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!s) return false;
    const data = JSON.parse(s);
    if (!data || data.v !== 1) return false;
    state.type = data.type in PRESETS ? data.type : 'blank';
    state.raw = data.raw || {};
    state.examples = new Set(data.examples || []);
    state.edited = new Set(data.edited || []);
    if (data.lang === 'hi' || data.lang === 'en') state.lang = data.lang;
    state.remember = true;
    return true;
  } catch (e) { return false; }
}

function forget() {
  try { localStorage.removeItem(CONFIG.STORAGE_KEY); } catch (e) { /* nothing to remove */ }
}

// ---------------------------------------------------------------------------
// Events

function onInput(e) {
  const el = e.target;
  if (el.matches('input[data-k]')) {
    const k = el.dataset.k;
    state.raw[k] = el.value;
    state.edited.add(k);
    if (state.examples.delete(k)) {
      const box = el.closest('.inbox');
      box.classList.remove('is-example');
      box.querySelector('.ex-tag')?.remove();
      refreshExampleTags();
    }
    if (k === 'moneyIn') updateShort();
    scheduleUpdate();
  } else if (el.matches('input[data-wi]')) {
    const k = el.dataset.wi;
    state.whatIf[k] = Number(el.value);
    const label = fmtSigned(state.whatIf[k]);
    $(`#wi-${k}-out`).textContent = label;
    el.setAttribute('aria-valuetext', label);
    scheduleUpdate();
  } else if (el.id === 'dep-cost' || el.id === 'dep-years') {
    const m = depreciationFromAsset(parseNumber($('#dep-cost').value), parseNumber($('#dep-years').value));
    const btn = $('#dep-use');
    btn.disabled = !(m > 0);
    btn.dataset.amount = String(Math.round(m));
    btn.textContent = t('dep.use', { amount: formatINR(m) });
  }
}

function refreshExampleTags() {
  $('#example-banner').hidden = state.examples.size === 0;
  $$('#steps .card.step').forEach((card, i) => {
    const s = STEPS[i];
    const has = s.fields.some((f) => state.examples.has(f) || (f === 'returns' && state.examples.has('returnsValue')));
    if (!has) card.querySelector('.card-tag')?.remove();
  });
}

function onBlur(e) {
  const el = e.target;
  if (!el.matches || !el.matches('input[data-k]')) return;
  const k = el.dataset.k;
  const isMoney = (FIELDS[k] && (FIELDS[k].kind === 'money' || FIELDS[k].kind === 'count')) || CASH_FIELDS.includes(k) || (k === 'returnsValue' && state.raw.returnsMode === 'amount');
  if (!isMoney) return;
  const n = parseNumber(el.value);
  if (Number.isFinite(n) && n >= 0) { el.value = formatPlain(n); state.raw[k] = el.value; }
}

function onClick(e) {
  const el = e.target.closest('button, a, summary');
  if (!el) return;

  if (el.dataset.type) { chooseType(el.dataset.type); return; }

  if (el.dataset.seg) {
    const name = el.dataset.seg;
    let val = el.dataset.val;
    if (name === 'gstIncluded') val = val === 'true';
    state.raw[name] = val;
    if (name === 'gstRateChoice' && val !== 'custom') state.raw.gstRate = val;
    if (name === 'returnsMode') state.raw.returnsValue = '';
    state.edited.add(name);
    if (name === 'gstRateChoice') state.edited.add('gstRate');
    if (name === 'returnsMode') { state.edited.add('returnsValue'); state.examples.delete('returnsValue'); }
    const card = el.closest('.card.step');
    const idx = Number(card?.dataset.step || 0);
    renderSteps();
    setActive(idx, { force: true });
    const again = $(`#steps .seg-btn[data-seg="${name}"][data-val="${CSS.escape(String(el.dataset.val))}"]`);
    again?.focus({ preventScroll: true });
    scheduleUpdate();
    return;
  }

  if (el.dataset.nav) {
    const card = el.closest('.card.step');
    const idx = Number(card.dataset.step);
    if (el.dataset.nav === 'next') goToStep(idx + 1);
    else if (el.dataset.nav === 'back') goToStep(idx - 1);
    else seeResults();
    return;
  }

  if (el.classList.contains('lbtn')) {
    const why = el.nextElementSibling;
    const open = el.getAttribute('aria-expanded') === 'true';
    el.setAttribute('aria-expanded', String(!open));
    why.hidden = open;
    return;
  }

  if (el.dataset.close !== undefined) { closeDialog(el.closest('dialog')); return; }

  switch (el.id) {
    case 'lang-btn': state.lang = state.lang === 'hi' ? 'en' : 'hi'; renderAll(); persist(); break;
    case 'how-btn': openDialog($('#privacy-dlg')); break;
    case 'clear-examples': clearExamples(); break;
    case 'ladder-toggle':
      state.showTable = !state.showTable;
      $('#ladder').hidden = state.showTable;
      $('#ladder-table').hidden = !state.showTable;
      el.setAttribute('aria-pressed', String(state.showTable));
      el.textContent = t(state.showTable ? 'ladder.asChart' : 'ladder.asTable');
      break;
    case 'wi-reset':
      state.whatIf = { price: 0, returns: 0, marketing: 0, fixed: 0 };
      renderWhatIfSliders();
      scheduleUpdate();
      break;
    case 'dep-use':
      state.raw.depreciation = formatPlain(Number(el.dataset.amount || 0));
      state.examples.delete('depreciation');
      state.edited.add('depreciation');
      renderSteps();
      setActive(10, { force: true });
      scheduleUpdate();
      break;
    case 'live-btn': seeResults(); break;
    case 'save-image': share(true); break;
    case 'save-share': share(false); break;
    case 'save-print': window.print(); break;
    case 'save-clear': clearEverything(el); break;
    case 'remember': toggleRemember(); break;
    default: break;
  }
}

function chooseType(type) {
  loadPreset(type);
  $$('#types .type').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === type)));
  renderSteps();
  renderCashFields();
  update();
  setActive(0, { force: true });
}

function clearExamples() {
  for (const k of state.examples) state.raw[k] = '';
  state.examples.clear();
  renderSteps();
  renderCashFields();
  update();
}

let clearArmed = 0;
function clearEverything(btn) {
  const label = $('.save-name', btn);
  if (!clearArmed) {
    label.textContent = t('save.clearConfirm');
    clearArmed = setTimeout(() => { clearArmed = 0; label.textContent = t('save.clear'); }, 4000);
    return;
  }
  clearTimeout(clearArmed);
  clearArmed = 0;
  label.textContent = t('save.clear');
  state.raw = {};
  state.examples = new Set();
  loadPreset('blank', { keepUserValues: false });
  $$('#types .type').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === 'blank')));
  state.whatIf = { price: 0, returns: 0, marketing: 0, fixed: 0 };
  state.remember = false;
  forget();
  $('#remember').setAttribute('aria-checked', 'false');
  renderAll();
  $('#save-status').textContent = t('save.cleared');
}

function toggleRemember() {
  state.remember = !state.remember;
  $('#remember').setAttribute('aria-checked', String(state.remember));
  if (state.remember) persist(); else forget();
}

function goToStep(i) {
  const cards = $$('#calc .card.step');
  const card = cards[Math.max(0, Math.min(cards.length - 1, i))];
  if (!card) return;
  setActive(Number(card.dataset.step));
  card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  const first = card.querySelector('input, .seg-btn[aria-checked="true"], .type[aria-checked="true"]');
  first?.focus({ preventScroll: true });
}

function seeResults() {
  const el = $('#results');
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  $('#res-title').setAttribute('tabindex', '-1');
  $('#res-title').focus({ preventScroll: true });
  if (state.result?.moneyIn > 0) { playBurst(); state.burstDone = true; }
}

// Dialogs (with a fallback for browsers without <dialog>)
let lastFocus = null;
function openDialog(d) {
  lastFocus = document.activeElement;
  if (typeof d.showModal === 'function') d.showModal(); else { d.setAttribute('open', ''); d.classList.add('fallback'); }
  d.querySelector('[data-close], a, button')?.focus();
}
function closeDialog(d) {
  if (!d) return;
  if (typeof d.close === 'function' && d.open) d.close(); else { d.removeAttribute('open'); d.classList.remove('fallback'); }
  if (d.id === 'share-dlg') releaseShare();
  lastFocus?.focus?.();
}

// Share / save image: drawn on a local <canvas>; nothing is uploaded anywhere.
let shareUrl = null;
let shareBlob = null;
async function share(withNumbers) {
  const r = state.result;
  if (!r) return;
  const status = $('#save-status');
  try {
    const blob = await renderShareCard(r, { withNumbers, lang: state.lang, t, url: CONFIG.SITE_URL, cat: CAT });
    releaseShare();
    shareBlob = blob;
    shareUrl = URL.createObjectURL(blob);
    const img = $('#share-img');
    img.src = shareUrl;
    img.alt = r.netProfit >= 0 ? t('card.keep', { x: formatPer100(r.per100.netProfit) }) : t('card.lose', { x: formatPer100(Math.abs(r.per100.netProfit)) });
    const dl = $('#share-download');
    dl.href = shareUrl;
    dl.download = withNumbers ? 'asli-munafa-my-numbers.png' : 'asli-munafa-share.png';
    const file = typeof File === 'function' ? new File([blob], dl.download, { type: 'image/png' }) : null;
    const nat = $('#share-native');
    nat.hidden = !(file && navigator.canShare && navigator.canShare({ files: [file] }));
    nat.onclick = () => navigator.share({ files: [file] }).catch(() => {});
    openDialog($('#share-dlg'));
    status.textContent = '';
  } catch (err) {
    status.textContent = String(err && err.message ? err.message : err);
  }
}
function releaseShare() {
  if (shareUrl) URL.revokeObjectURL(shareUrl);
  shareUrl = null;
  shareBlob = null;
}

// ---------------------------------------------------------------------------
// Boot

function boot() {
  const restored = restore();
  if (!restored) {
    const nav = (navigator.language || '').toLowerCase();
    state.lang = nav.startsWith('hi') ? 'hi' : 'en';
    loadPreset('d2c', { keepUserValues: false });
  }
  $('#remember').setAttribute('aria-checked', String(state.remember));
  if (document.documentElement.dataset.single === '1') $('#offline-card').hidden = true;

  renderAll();
  setActive(0, { force: true });

  document.addEventListener('input', onInput);
  document.addEventListener('click', onClick);
  document.addEventListener('focusout', onBlur);
  const activateFrom = (e) => {
    const card = e.target.closest && e.target.closest('#calc .card.step');
    if (card) setActive(Number(card.dataset.step));
  };
  document.addEventListener('focusin', activateFrom);
  document.addEventListener('pointerdown', activateFrom);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('#steps input[data-k]')) {
      e.preventDefault();
      const inputs = $$('#steps input[data-k]');
      const i = inputs.indexOf(e.target);
      if (inputs[i + 1]) inputs[i + 1].focus(); else seeResults();
    }
  });
  for (const d of $$('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
    d.addEventListener('close', () => { if (d.id === 'share-dlg') releaseShare(); });
  }

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { selRect = null; placeSelbox(state.active, true); }, 120);
  });
  // Card heights change while typing (errors, hints): keep the box snug.
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => placeSelbox(state.active, true));
    ro.observe($('#steps'));
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.target.id === 'lens') {
          if (en.isIntersecting && !state.burstDone && state.result?.moneyIn > 0) { state.burstDone = true; playBurst(); }
        }
        if (en.target.id === 'results') document.body.classList.toggle('results-visible', en.isIntersecting);
        if (en.target.id === 'calc') document.body.classList.toggle('calc-visible', en.isIntersecting);
      }
    }, { threshold: [0, 0.35] });
    io.observe($('#lens'));
    io.observe($('#results'));
    io.observe($('#calc'));
  } else {
    document.body.classList.add('calc-visible');
  }

  // Load every font face now, so switching to Hindi later makes no network request.
  if (document.fonts && document.fonts.load) {
    const idle = (fn) => window.addEventListener('load', () => setTimeout(() => (window.requestIdleCallback || setTimeout)(fn), 1200), { once: true });
    idle(() => {
      for (const spec of ['400 16px Poppins', '600 16px Poppins', '800 16px Unbounded', '400 16px "Space Mono"', '700 16px "Space Mono"']) {
        document.fonts.load(spec, 'Aa₹मुनाफ़ा').catch(() => {});
      }
    });
  }

  // Offline: a tiny service worker caches the app shell. Skipped where unavailable (in-app browsers, file://).
  const swOk = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && swOk && document.documentElement.dataset.single !== '1') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
