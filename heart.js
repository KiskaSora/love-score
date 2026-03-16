import { saveSettingsDebounced } from '../../../../script.js';
import { cfg, loveData, RELATION_TYPES, escHtml, getActiveInterp } from './config.js';

// ─── Цветовые хелперы ────────────────────────────────────────────────────────
export function _h2r(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
export function _lerpHex(a, b, t) {
  const [r1,g1,b1] = _h2r(a), [r2,g2,b2] = _h2r(b);
  return '#' + [r1+t*(r2-r1), g1+t*(g2-g1), b1+t*(b2-b1)].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
}

// ─── Цвета сердца (SVG стиль) ─────────────────────────────────────────────────
export function heartColor(score, max, rt='neutral') {
  const _t = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
  const r  = Math.max(0, Math.min(1, Math.abs(score) / (score >= 0 ? max : 100)));
  if (score >= 0) {
    if (r <= 0.5) return _lerpHex('#ffffff', _t.color, Math.max(r * 2, 0.1));
    return _lerpHex(_t.color, _t.deep, (r - 0.5) * 2);
  } else {
    const negPeak = (rt === 'hostile') ? '#0a8c3a' : '#4ec900';
    const negDeep = (rt === 'hostile') ? '#041a0a' : '#050f00';
    if (r <= 0.5) return _lerpHex('#ffffff', negPeak, Math.max(r * 2, 0.1));
    return _lerpHex(negPeak, negDeep, (r - 0.5) * 2);
  }
}

export function heartStroke(score, rt='neutral') {
  if (score >= 0) {
    const r = Math.max(0, Math.min(1, score / (loveData().maxScore || 100)));
    if (r < 0.15) return 'rgba(200,200,200,.35)';
    const [r1,g1,b1] = _h2r((RELATION_TYPES[rt] || RELATION_TYPES.romance).color);
    return `rgba(${r1},${g1},${b1},.5)`;
  }
  const r = Math.abs(score) / 100;
  if (r >= 0.75) return 'rgba(5,25,0,.95)';
  if (r >= 0.40) return 'rgba(20,90,0,.85)';
  return 'rgba(80,200,0,.6)';
}

// ─── Цвета сердца (Blur стиль) ────────────────────────────────────────────────
export function heartColorRgba(score, max, rt='neutral') {
  const t     = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
  const ratio = Math.max(0, Math.min(1, Math.abs(score) / (score >= 0 ? max : 100)));
  if (rt === 'hostile') {
    const [r,g,b] = _h2r('#0a8c3a');
    return `rgba(${r},${g},${b},${0.15 + ratio * 0.85})`;
  }
  if (score >= 0) {
    const [r,g,b] = _h2r(t.color);
    return `rgba(${r},${g},${b},${0.15 + ratio * 0.85})`;
  } else {
    const [r,g,b] = _h2r('#4ec900');
    return `rgba(${r},${g},${b},${0.15 + ratio * 0.85})`;
  }
}

// ─── Построение SVG сердца ────────────────────────────────────────────────────
export const HEART_P = 'M50,85 C50,85 8,58 8,32 C8,16 20,6 34,6 C43,6 49,11 50,16 C51,11 57,6 66,6 C80,6 92,16 92,32 C92,58 50,85 50,85 Z';

export function buildTipHTML(rt) {
  const rtInfo   = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
  const interp   = getActiveInterp();
  const descText = interp?.description?.trim() || '';
  return '<div id="ls-status-tip">'
    + '<div class="ls-tip-type" style="color:' + rtInfo.color + ';">' + escHtml(rtInfo.label) + '</div>'
    + (descText ? '<div class="ls-tip-desc">' + escHtml(descText) + '</div>' : '')
    + '</div>';
}

export function buildHeartSVG(score, max, rt='neutral') {
  const isNeg = score < 0;
  const col = heartColor(score, max, rt), stroke = heartStroke(score, rt);
  let fillY, fillH, tr = '';
  if (!isNeg) {
    const r = Math.max(0, Math.min(1, score / max));
    fillY = (95*(1-r)).toFixed(2); fillH = (95*r).toFixed(2);
  } else {
    const r = Math.max(0, Math.min(1, Math.abs(score)/100));
    fillY = '0'; fillH = (95*r).toFixed(2); tr = 'transform="rotate(180,50,47.5)"';
  }
  const fs = Math.abs(score) >= 100 ? '13' : '17';
  return '<svg viewBox="0 0 100 95" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible;">'
    + '<defs><clipPath id="ls-hclip"><path ' + tr + ' d="' + HEART_P + '"/></clipPath></defs>'
    + '<path ' + tr + ' d="' + HEART_P + '" fill="rgba(22,10,16,.88)" stroke="' + stroke + '" stroke-width="2.5"/>'
    + '<rect x="0" y="0" width="100" height="95" clip-path="url(#ls-hclip)" fill="'+(RELATION_TYPES[rt]||RELATION_TYPES.neutral).color+'" opacity="0.13"/>'
    + '<rect id="ls-heart-fill" x="0" y="' + fillY + '" width="100" height="' + fillH + '" clip-path="url(#ls-hclip)" fill="' + col + '" opacity="0.92"/>'
    + '<text id="ls-score-main" x="50" y="43" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="' + fs + '" font-weight="700" font-family="system-ui,sans-serif">' + escHtml(String(score)) + '</text>'
    + '<text id="ls-score-denom" x="50" y="62" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,.6)" font-size="10" font-family="system-ui,sans-serif">/' + escHtml(String(max)) + '</text>'
    + '</svg>' + buildTipHTML(rt);
}

// ─── Построение Blur сердца ───────────────────────────────────────────────────
export const BLUR_HEART_P = 'M50 88 C50 88 6 56 6 30 C6 14 18 4 32 4 C42 4 48 10 50 15 C52 10 58 4 68 4 C82 4 94 14 94 30 C94 56 50 88 50 88 Z';

export function buildBlurHeart(score, max, rt='neutral') {
  const isNeg = score < 0, isHostile = rt === 'hostile';
  const shouldFlip = isNeg || isHostile;
  const color  = heartColorRgba(score, max, rt);
  const rtInfo = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
  const sz     = cfg().widgetSize || 64;
  const blur   = Math.max(3, Math.min(7, Math.round(sz * 0.06)));
  const tr     = shouldFlip ? ` transform="rotate(180,50,46)"` : '';
  const interp = getActiveInterp();
  const descText = interp?.description?.trim() || '';
  return `<div class="ls-heart-wrap">
    <div class="ls-heart-blur" style="filter:blur(${blur}px)">
      <svg viewBox="0 0 100 92" xmlns="http://www.w3.org/2000/svg">
        <path d="${BLUR_HEART_P}"${tr} fill="${color}"/>
      </svg>
    </div>
    <div class="ls-heart-score">
      <span class="ls-heart-num">${score}</span>
      <span class="ls-heart-denom">/${max}</span>
    </div>
    <div class="ls-tip">
      <div class="ls-tip-type" style="color:${rtInfo.color}">${escHtml(rtInfo.label)}</div>
      ${descText ? `<div class="ls-tip-desc">${escHtml(descText)}</div>` : ''}
    </div>
  </div>`;
}

// ─── Виджет ───────────────────────────────────────────────────────────────────
export function applyWidgetSize(sz) {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.style.width  = sz + 'px';
  w.style.height = Math.round(sz * 0.94) + 'px';
}

export function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

export function updateWidgetGlow(rt, isNeg) {
  const _tc = isNeg ? [60,220,60] : _h2r((RELATION_TYPES[rt] || RELATION_TYPES.neutral).color);
  const [r,g,b] = _tc;
  document.documentElement.style.setProperty('--ls-glow',       `drop-shadow(0 4px 14px rgba(${r},${g},${b},.3))`);
  document.documentElement.style.setProperty('--ls-hover-glow', `drop-shadow(0 6px 22px rgba(${r},${g},${b},.55))`);
}

export function _renderWidgetContent(w) {
  if (!w) return;
  const d = loveData(), c = cfg();
  const style = c.heartStyle || 'svg';
  if (style === 'blur') {
    w.innerHTML = buildBlurHeart(d.score, d.maxScore, d.relationType || 'neutral');
    w.style.filter = '';
  } else {
    w.innerHTML = buildHeartSVG(d.score, d.maxScore, d.relationType || 'neutral');
    updateWidgetGlow(d.relationType || 'neutral', d.score < 0);
  }
}

export function makeDraggable(w) {
  let drag = false, moved = false, grabX = 0, grabY = 0;
  w.addEventListener('pointerdown', e => {
    const r = w.getBoundingClientRect(); grabX = e.clientX-r.left; grabY = e.clientY-r.top;
    drag = true; moved = false; w.setPointerCapture(e.pointerId);
    w.style.transition = 'none'; e.preventDefault();
  });
  w.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = Math.abs(e.clientX-(w.getBoundingClientRect().left+grabX));
    const dy = Math.abs(e.clientY-(w.getBoundingClientRect().top+grabY));
    if (!moved && (dx>4||dy>4)) moved = true;
    if (!moved) return;
    w.style.left = clamp(e.clientX-grabX, 8, window.innerWidth-w.offsetWidth-8)+'px'; w.style.right = 'auto';
    w.style.top  = clamp(e.clientY-grabY, 8, window.innerHeight-w.offsetHeight-8)+'px'; w.style.bottom = 'auto';
    e.preventDefault();
  });
  w.addEventListener('pointerup', () => {
    if (!drag) return; drag = false;
    w.style.transition = 'filter .2s ease,transform .35s ease'; w.style.filter = '';
    if (moved) { cfg().widgetPos = { top: w.style.top, left: w.style.left }; saveSettingsDebounced(); }
  });
}

export function createWidget() {
  if (document.getElementById('ls-widget')) return;
  const d = loveData(), c = cfg();
  const w = document.createElement('div'); w.id = 'ls-widget';
  _renderWidgetContent(w);
  document.body.appendChild(w);
  const sz = c.widgetSize || 64; applyWidgetSize(sz);
  updateWidgetGlow(d.relationType || 'neutral', d.score < 0);
  if (c.widgetPos?.top != null) {
    const st = parseFloat(c.widgetPos.top), sl = parseFloat(c.widgetPos.left);
    w.style.top  = clamp(isNaN(st)?100:st, 8, window.innerHeight - Math.round(sz*.94) - 8) + 'px';
    w.style.left = clamp(isNaN(sl)?18:sl,  8, window.innerWidth  - sz - 8) + 'px';
    w.style.bottom = 'auto'; w.style.right = 'auto';
  }
  makeDraggable(w);
}

export function refreshWidget() {
  const c = cfg(), w = document.getElementById('ls-widget'); if (!w) return;
  w.style.display = c.isEnabled ? 'block' : 'none';
  _renderWidgetContent(w);
}

export function pulseWidget() {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.classList.remove('ls-beat','ls-flip'); void w.offsetWidth;
  w.classList.add('ls-beat');
  w.addEventListener('animationend', () => w.classList.remove('ls-beat'), { once: true });
}

export function flipWidget() {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.classList.remove('ls-beat','ls-flip'); void w.offsetWidth;
  w.classList.add('ls-flip');
  w.addEventListener('animationend', () => { w.classList.remove('ls-flip'); refreshWidget(); }, { once: true });
}
