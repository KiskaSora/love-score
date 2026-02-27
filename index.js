import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXT_NAME = 'love-score';
const PROMPT_KEY = EXT_NAME + '_injection';

const defaultSettings = {
  isEnabled: true, maxScore: 100, gradualProgression: true,
  widgetPos: null, widgetSize: 64,
  lastCheckedMessageId: null, chatLoveData: {},
  genEndpoint: '', genApiKey: '', genModel: '', genLang: 'ru', genUserNotes: ''
};

const mkLoveData = () => ({
  score: 0, maxScore: 100,
  scoreChanges: [
    { delta: 1, description: '' }, { delta: 2, description: '' },
    { delta: -1, description: '' }, { delta: -2, description: '' }
  ],
  scaleInterpretations: [
    { min: 0,  max: 10,  description: '' }, { min: 11, max: 30,  description: '' },
    { min: 31, max: 50,  description: '' }, { min: 51, max: 70,  description: '' },
    { min: 71, max: 85,  description: '' }, { min: 86, max: 95,  description: '' },
    { min: 96, max: 100, description: '' }
  ],
  milestones: [
    { threshold: 15, description: 'Сделай комплимент или небольшой знак внимания — скажи что-то приятное, обрати внимание на детали внешности или характера.',     done: false },
    { threshold: 30, description: 'Предложи встретиться или провести время вместе — пригласи на прогулку, в кафе или на любое совместное занятие.',                 done: false },
    { threshold: 50, description: 'Сделай подарок или особый жест — принеси что-то значимое, сделай что-то приятное без повода.',                                   done: false },
    { threshold: 65, description: 'Впервые открыто признайся в чувствах — скажи напрямую что испытываешь, без намёков.',                                            done: false },
    { threshold: 80, description: 'Заговори о серьёзных отношениях — обозначь что хочешь быть вместе, предложи стать парой официально.',                            done: false },
    { threshold: 90, description: 'Сделай предложение руки и сердца — найди подходящий момент и предложи пожениться.',                                              done: false },
    { threshold: 97, description: 'Заговори о совместном будущем и детях — подними тему семьи, планов на жизнь вместе.',                                            done: false }
  ]
});

const cfg = () => extension_settings[EXT_NAME];

function toast(type, msg) {
  try { if (typeof toastr !== 'undefined') toastr[type]?.(msg, 'Love Score', { timeOut: 2300, positionClass: 'toast-top-center' }); } catch {}
}

function getChatId() {
  try { const x = SillyTavern?.getContext?.() ?? {}; return x.chatId ?? x.chat_metadata?.chat_id ?? '__global__'; }
  catch { return '__global__'; }
}

function loveData() {
  const c = cfg();
  if (!c.chatLoveData) c.chatLoveData = {};
  const id = getChatId();
  if (!c.chatLoveData[id]) c.chatLoveData[id] = mkLoveData();
  const d = c.chatLoveData[id];
  if (!d.scoreChanges)         d.scoreChanges         = mkLoveData().scoreChanges;
  if (!d.scaleInterpretations) d.scaleInterpretations = mkLoveData().scaleInterpretations;
  if (!d.milestones)           d.milestones           = mkLoveData().milestones;
  return d;
}

function escHtml(s) {
  return String(s ?? '').split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}

function getActiveInterp() {
  const d = loveData();
  return (d.scaleInterpretations || []).find(ip => d.score >= ip.min && d.score <= ip.max) ?? null;
}

function getPendingMilestones() {
  const d = loveData();
  return (d.milestones || []).filter(m => !m.done && d.score >= m.threshold);
}

function heartColor(score, max) {
  const r = score / max;
  if (r >= 0.85) return '#e8003d';
  if (r >= 0.65) return '#ff2d55';
  if (r >= 0.45) return '#ff6b8a';
  if (r >= 0.25) return '#ff9eb5';
  if (r > 0)     return '#ffc8d5';
  return 'transparent';
}

function injectStyles() {
  if (document.getElementById('ls-styles')) return;
  const el = document.createElement('style');
  el.id = 'ls-styles';
  el.textContent = `
#ls-widget{position:fixed;top:100px;left:18px;bottom:auto;right:auto;width:64px;height:60px;cursor:grab;z-index:999999;user-select:none;touch-action:none;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5));transition:filter .2s ease;}
#ls-widget:hover{filter:drop-shadow(0 4px 14px rgba(0,0,0,.65));}
#ls-widget:active{cursor:grabbing;}
#ls-widget.ls-beat{animation:ls-hb .55s cubic-bezier(.36,1.8,.5,1) forwards;}
@keyframes ls-hb{0%{transform:scale(1)}40%{transform:scale(1.28)}70%{transform:scale(.94)}100%{transform:scale(1)}}
#ls-heart-fill{transition:y .6s ease,height .6s ease,fill .5s ease;}
#ls-status-tip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--black-tint-5,rgba(18,18,22,0.97));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:6px;padding:6px 10px;font-size:11px;color:var(--SmartThemeBodyColor,#ccc);pointer-events:none;opacity:0;white-space:normal;text-align:center;max-width:190px;min-width:90px;transition:opacity .18s ease;z-index:1000000;line-height:1.5;}
#ls-widget:hover #ls-status-tip{opacity:1;}

.ls-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.ls-section-title{font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--SmartThemeBodyColor,#aaa);opacity:.55;margin:14px 0 5px;padding-bottom:4px;border-bottom:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-hint{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.4;line-height:1.5;margin-bottom:6px;}

.ls-num-input{background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:4px 6px;text-align:center;font-size:13px;transition:border-color .15s;}
.ls-num-input:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4));}
.ls-range-input{background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:4px 6px;text-align:center;font-size:13px;width:68px;box-sizing:border-box;transition:border-color .15s;}
.ls-range-input:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4));}
.ls-textarea-field{flex:1;resize:vertical;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:6px 8px;font-family:inherit;font-size:12px;line-height:1.55;box-sizing:border-box;min-height:52px;transition:border-color .15s;}
.ls-textarea-field:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35));}

.ls-card{display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;padding:8px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.02));border:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-card-pos{border-left:3px solid rgba(80,200,120,.5);}
.ls-card-neg{border-left:3px solid rgba(210,80,80,.5);}
.ls-card-neu{border-left:3px solid rgba(120,120,200,.35);}
.ls-card-milestone{border-left:3px solid rgba(200,160,80,.4);}
.ls-card-milestone.ls-done{opacity:.4;}
.ls-heart-box{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:44px;}
.ls-heart-icon{font-size:18px;line-height:1;}
.ls-del-btn{padding:3px 7px!important;min-width:unset!important;align-self:flex-start;opacity:.35;transition:opacity .15s;}
.ls-del-btn:hover{opacity:.8;}
.ls-range-box{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:148px;}
.ls-range-label{font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--SmartThemeBodyColor,#aaa);opacity:.45;line-height:1;}
.ls-range-inner{display:flex;align-items:center;gap:6px;}
.ls-range-sep{opacity:.3;font-size:12px;}
.ls-add-btn{width:100%;margin-top:4px;opacity:.7;}
.ls-add-btn:hover{opacity:1;}

.ls-milestone-left{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:72px;}
.ls-milestone-threshold-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;}
.ls-milestone-threshold-label{font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.4;line-height:1;}
.ls-milestone-done-cb{width:15px;height:15px;cursor:pointer;accent-color:var(--SmartThemeBodyColor,#aaa);margin-top:2px;}
.ls-milestone-status{font-size:9px;opacity:.4;text-align:center;line-height:1.3;}
.ls-milestone-status.ls-status-due{opacity:.8;font-weight:600;}
.ls-milestone-reset-row{display:flex;justify-content:flex-end;margin-bottom:6px;}

#ls-active-state{margin-bottom:8px;padding:8px 10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.1));font-size:12px;line-height:1.55;color:var(--SmartThemeBodyColor,#ccc);}
#ls-active-state strong{opacity:.7;}

input[type=range].ls-size-slider{flex:1;accent-color:var(--SmartThemeBodyColor,#aaa);}

#ls-ai-box{margin-top:12px;padding:10px;border-radius:6px;border:1px solid var(--border-color,rgba(255,255,255,.1));}
#ls-ai-box .ls-section-title{margin-top:0;margin-bottom:8px;}
.ls-api-label{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.45;margin:6px 0 3px;display:block;}
.ls-api-field{width:100%;box-sizing:border-box;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:5px 8px;font-size:12px;transition:border-color .15s;}
.ls-api-field:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35));}
.ls-model-row{display:flex;gap:6px;align-items:center;margin-bottom:2px;}
.ls-model-row select{flex:1;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:5px 8px;font-size:12px;}
.ls-refresh-btn{padding:5px 9px!important;min-width:unset!important;flex-shrink:0;}
.ls-refresh-btn.ls-loading i{animation:ls-spin .7s linear infinite;}
@keyframes ls-spin{to{transform:rotate(360deg)}}
#ls-char-select{width:100%;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:5px 8px;font-size:12px;margin:4px 0 0;}
#ls-char-preview{display:flex;align-items:center;gap:9px;padding:6px 2px 4px;}
#ls-char-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color,rgba(255,255,255,.18));flex-shrink:0;background:var(--input-background-fill,rgba(255,255,255,.06));transition:opacity .2s;}
#ls-char-avatar.ls-avatar-hidden{display:none;}
#ls-char-avatar-name{font-size:12px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;}
#ls-gen-btn{width:100%;margin-top:4px;}
#ls-gen-status{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.6;margin-top:5px;min-height:15px;line-height:1.4;}
`;
  document.head.appendChild(el);
}

function buildHeartSVG(score, max) {
  const ratio = Math.max(0, Math.min(1, score / max));
  const fY = (95 * (1 - ratio)).toFixed(2);
  const fH = (95 * ratio).toFixed(2);
  const col = heartColor(score, max);
  const P = 'M50,85 C50,85 8,58 8,32 C8,16 20,6 34,6 C43,6 49,11 50,16 C51,11 57,6 66,6 C80,6 92,16 92,32 C92,58 50,85 50,85 Z';
  return '<svg id="ls-heart-svg" viewBox="0 0 100 95" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible;">'
    + '<defs><clipPath id="ls-hclip"><path d="' + P + '"/></clipPath></defs>'
    + '<path d="' + P + '" fill="rgba(22,10,16,.88)" stroke="rgba(255,90,120,.35)" stroke-width="2"/>'
    + '<rect id="ls-heart-fill" x="0" y="' + fY + '" width="100" height="' + fH + '" clip-path="url(#ls-hclip)" fill="' + col + '" opacity="0.9"/>'
    + '<text id="ls-score-main" x="50" y="43" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="17" font-weight="600" font-family="system-ui,sans-serif">' + score + '</text>'
    + '<text id="ls-score-denom" x="50" y="62" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,.5)" font-size="10" font-family="system-ui,sans-serif">/' + max + '</text>'
    + '</svg><div id="ls-status-tip"></div>';
}

function applyWidgetSize(sz) {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.style.width  = sz + 'px';
  w.style.height = Math.round(sz * 0.94) + 'px';
}

function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

function createWidget() {
  if (document.getElementById('ls-widget')) return;
  injectStyles();
  const d = loveData(), c = cfg();
  const w = document.createElement('div');
  w.id = 'ls-widget';
  w.innerHTML = buildHeartSVG(d.score, d.maxScore);
  document.body.appendChild(w);
  const sz = c.widgetSize || 64;
  applyWidgetSize(sz);
  if (c.widgetPos?.top != null) {
    const st = parseFloat(c.widgetPos.top), sl = parseFloat(c.widgetPos.left);
    const wW = sz, wH = Math.round(sz * 0.94);
    w.style.top  = clamp(isNaN(st) ? 100 : st, 8, window.innerHeight - wH - 8) + 'px';
    w.style.left = clamp(isNaN(sl) ?  18 : sl, 8, window.innerWidth  - wW - 8) + 'px';
    w.style.bottom = 'auto'; w.style.right = 'auto';
  }
  makeDraggable(w);
}

function makeDraggable(w) {
  let drag = false, moved = false, grabX = 0, grabY = 0;
  w.addEventListener('pointerdown', (e) => {
    const r = w.getBoundingClientRect();
    grabX = e.clientX - r.left; grabY = e.clientY - r.top;
    drag = true; moved = false; w.setPointerCapture(e.pointerId);
    w.style.transition = 'none'; e.preventDefault();
  });
  w.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = Math.abs(e.clientX - (w.getBoundingClientRect().left + grabX));
    const dy = Math.abs(e.clientY - (w.getBoundingClientRect().top  + grabY));
    if (!moved && (dx > 4 || dy > 4)) moved = true;
    if (!moved) return;
    const nL = clamp(e.clientX - grabX, 8, window.innerWidth  - w.offsetWidth  - 8);
    const nT = clamp(e.clientY - grabY, 8, window.innerHeight - w.offsetHeight - 8);
    w.style.left = nL + 'px'; w.style.right  = 'auto';
    w.style.top  = nT + 'px'; w.style.bottom = 'auto';
    e.preventDefault();
  });
  w.addEventListener('pointerup', () => {
    if (!drag) return; drag = false;
    w.style.transition = 'filter .2s ease';
    if (moved) { cfg().widgetPos = { top: w.style.top, left: w.style.left }; saveSettingsDebounced(); }
  });
}

function refreshWidget() {
  const c = cfg(), d = loveData(), w = document.getElementById('ls-widget');
  if (!w) return;
  w.style.display = c.isEnabled ? 'block' : 'none';
  const ratio = Math.max(0, Math.min(1, d.score / d.maxScore));
  const fill = document.getElementById('ls-heart-fill');
  if (fill) {
    fill.setAttribute('y', (95 * (1 - ratio)).toFixed(2));
    fill.setAttribute('height', (95 * ratio).toFixed(2));
    fill.setAttribute('fill', heartColor(d.score, d.maxScore));
  }
  const main = document.getElementById('ls-score-main'); if (main) main.textContent = d.score;
  const den  = document.getElementById('ls-score-denom'); if (den)  den.textContent  = '/' + d.maxScore;
  const tip  = document.getElementById('ls-status-tip');
  if (tip) tip.textContent = getActiveInterp()?.description?.trim() || (d.score + ' / ' + d.maxScore);
}

function pulseWidget() {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.classList.remove('ls-beat'); void w.offsetWidth; w.classList.add('ls-beat');
  w.addEventListener('animationend', () => w.classList.remove('ls-beat'), { once: true });
}

function getCharacterList() {
  try {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx || !Array.isArray(ctx.characters)) return [];
    return ctx.characters.map((ch, i) => ({ index: i, name: ch.name || ('Персонаж ' + i) }));
  } catch(e) { return []; }
}

function getCurrentCharacterCard() {
  try {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx) return null;
    if (ctx.characterId !== undefined && Array.isArray(ctx.characters))
      return ctx.characters[ctx.characterId] ?? null;
    if (Array.isArray(ctx.characters) && ctx.characters.length > 0)
      return ctx.characters[0];
  } catch(e) {}
  return null;
}

function getCharacterByIndex(idx) {
  try {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx || !Array.isArray(ctx.characters)) return null;
    return ctx.characters[idx] ?? null;
  } catch(e) { return null; }
}

function getCharacterAvatarUrl(char) {
  if (!char) return null;
  const av = char.avatar || (char.data && char.data.avatar);
  if (!av || av === 'none') return null;
  return '/characters/' + av;
}

function updateCharPreview(char) {
  const img  = document.getElementById('ls-char-avatar');
  const name = document.getElementById('ls-char-avatar-name');
  if (!img || !name) return;
  const url = getCharacterAvatarUrl(char);
  if (url) {
    img.src = url;
    img.classList.remove('ls-avatar-hidden');
    img.onerror = () => { img.classList.add('ls-avatar-hidden'); };
  } else {
    img.classList.add('ls-avatar-hidden');
    img.src = '';
  }
  name.textContent = char?.name || '';
}

function buildCharacterCardText(char) {
  if (!char) return '';
  const parts = [];
  const s = v => (typeof v === 'string' && v.trim()) ? v.trim() : null;
  if (s(char.name))        parts.push('Name: ' + char.name.trim());
  if (s(char.description)) parts.push('Description:\n' + char.description.trim());
  if (s(char.personality)) parts.push('Personality:\n' + char.personality.trim());
  if (s(char.scenario))    parts.push('Scenario:\n' + char.scenario.trim());
  if (s(char.mes_example)) parts.push('Example dialogue:\n' + char.mes_example.trim());
  const d = char.data;
  if (d) {
    if (s(d.description) && d.description !== char.description) parts.push('Description:\n' + d.description.trim());
    if (s(d.personality) && d.personality !== char.personality) parts.push('Personality:\n' + d.personality.trim());
    if (s(d.scenario)    && d.scenario    !== char.scenario)    parts.push('Scenario:\n'    + d.scenario.trim());
    if (s(d.character_note)) parts.push('Creator notes:\n' + d.character_note.trim());
    if (Array.isArray(d.tags) && d.tags.length) parts.push('Tags: ' + d.tags.join(', '));
  }
  return parts.join('\n\n');
}

function populateCharSelect() {
  const sel = document.getElementById('ls-char-select'); if (!sel) return;
  const list = getCharacterList();
  while (sel.options.length > 1) sel.remove(1);
  list.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch.index; opt.textContent = ch.name;
    sel.appendChild(opt);
  });
}

function getBaseUrl() {
  return (cfg().genEndpoint || '').trim()
    .replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/v1$/, '');
}

async function fetchModelsForSelect() {
  const base = getBaseUrl(), apiKey = (cfg().genApiKey || '').trim();
  if (!base || !apiKey) { toast('warning', 'Укажи Endpoint и API Key'); return []; }
  const resp = await fetch(base + '/v1/models', { method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey } });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  return (data.data || data.models || []).map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean).sort();
}

async function onRefreshModels() {
  const btn = document.getElementById('ls-refresh-models'), sel = document.getElementById('ls-gen-model-select');
  if (!btn || !sel) return;
  btn.classList.add('ls-loading');
  try {
    const models = await fetchModelsForSelect(), current = cfg().genModel;
    sel.innerHTML = '<option value="">-- выбери модель --</option>';
    models.forEach(id => { const opt = document.createElement('option'); opt.value = id; opt.textContent = id; if (id === current) opt.selected = true; sel.appendChild(opt); });
    if (!models.length) toast('warning', 'Список моделей пуст');
    else toast('success', 'Загружено моделей: ' + models.length);
  } catch(e) { toast('error', 'Ошибка загрузки моделей: ' + e.message); }
  finally { btn.classList.remove('ls-loading'); }
}

async function generateLoveScoreWithAI(charCard) {
  const c = cfg(), base = getBaseUrl(), apiKey = (c.genApiKey || '').trim(), model = (c.genModel || '').trim() || 'gpt-4o';
  if (!base)   throw new Error('Укажи Endpoint в настройках');
  if (!apiKey) throw new Error('Укажи API Key в настройках');
  const d = loveData(), maxScore = d.maxScore || 100;
  const lang = c.genLang || 'ru', langLabel = lang === 'ru' ? 'Russian' : 'English';
  const userNotes = (c.genUserNotes || '').trim();

  const systemMsg = 'You are configuring a Love Score system for a text-based RPG. Reply with ONLY valid JSON — no explanations, no markdown, no code blocks.';
  const userMsg = [
    'Analyze the character card below and generate fully tailored love score rules for this specific character.',
    'Max score: ' + maxScore + '. For cold, distant or guarded characters suggest a higher max (200-300) via suggestedMax field.',
    '', 'CHARACTER CARD:', charCard, '',
    'Reply with STRICTLY valid JSON and nothing else:',
    '{', '  "suggestedMax": ' + maxScore + ',',
    '  "changes": [{"delta": 2, "text": "..."},{"delta": -1, "text": "..."}],',
    '  "ranges": [{"min": 0, "max": 20, "text": "..."}],',
    '  "milestones": [{"threshold": 15, "text": "..."}]',
    '}', '',
    'RULES:',
    '- changes: at least 4 items, mix of positive and negative deltas, specific to this character',
    '- ranges: at least 5 items covering the full 0-' + maxScore + ' scale without gaps',
    '- milestones: at least 5 items, ordered by threshold ascending, spread across the full scale', '',
    'MILESTONE GUIDELINES:',
    '- Cold/reserved character: early milestones very subtle (accidental touch, lingering gaze, one honest word)',
    '- Warm/open character: milestones can be expressive from the start',
    '- No children/marriage in lore: replace with something meaningful for this character instead',
    '- Reflect trauma, backstory or personality traits in how they express closeness',
    '- Descriptions must be concrete actions, not abstract feelings', '',
    '- All descriptions and text fields must be written in ' + langLabel,
    ...(userNotes ? ['', 'SPECIAL USER INSTRUCTIONS — follow these strictly above all else:', userNotes] : [])
  ].join('\n');

  const resp = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }], temperature: 0.7, max_tokens: 2500 })
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP ' + resp.status + ': ' + t.slice(0, 300)); }
  const result = await resp.json();
  const text = result?.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('ИИ вернул пустой ответ');
  return text;
}

function parseAIResponse(raw) {
  try {
    const cleaned = raw.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
    const parsed = JSON.parse(cleaned);
    const changes    = (parsed.changes   || []).filter(x => typeof x.delta === 'number' && x.text).map(x => ({ delta: x.delta, description: String(x.text).trim() }));
    const ranges     = (parsed.ranges    || []).filter(x => typeof x.min === 'number' && typeof x.max === 'number' && x.text).map(x => ({ min: x.min, max: x.max, description: String(x.text).trim() }));
    const milestones = (parsed.milestones|| []).filter(x => typeof x.threshold === 'number' && x.text).sort((a, b) => a.threshold - b.threshold).map(x => ({ threshold: x.threshold, description: String(x.text).trim(), done: false }));
    return { changes, ranges, milestones, suggestedMax: parsed.suggestedMax || null, ok: true };
  } catch(_) {}
  const changes = [], ranges = [];
  const changeRx = /^([+\-]\d+)\s*[\u2014\u2013\-:]+\s*(.+)$/gm; let m;
  while ((m = changeRx.exec(raw)) !== null) { const delta = parseInt(m[1], 10); if (!isNaN(delta) && m[2].trim()) changes.push({ delta, description: m[2].trim() }); }
  const rangeRx = /^(\d+)\s*[\u2013\u2014\-]\s*(\d+)\s*[:\s]+(.+)$/gm;
  while ((m = rangeRx.exec(raw)) !== null) { const mn = parseInt(m[1], 10), mx = parseInt(m[2], 10); if (!isNaN(mn) && !isNaN(mx) && mn < mx && m[3].trim()) ranges.push({ min: mn, max: mx, description: m[3].trim() }); }
  return { changes, ranges, milestones: [], suggestedMax: null, ok: changes.length > 0 || ranges.length > 0 };
}

async function onGenerateClick() {
  const btn = document.getElementById('ls-gen-btn'), status = document.getElementById('ls-gen-status'), sel = document.getElementById('ls-char-select');
  if (!btn || !status) return;
  btn.disabled = true; btn.textContent = 'Генерирую...'; status.textContent = 'Обращаюсь к API...';
  try {
    const char = (sel && sel.value !== '__current__') ? getCharacterByIndex(parseInt(sel.value, 10)) : getCurrentCharacterCard();
    if (!char)            { status.textContent = 'Персонаж не найден. Открой чат с персонажем.'; return; }
    const cardText = buildCharacterCardText(char);
    if (!cardText.trim()) { status.textContent = 'Карточка персонажа пустая.'; return; }
    status.textContent = 'Генерирую для: ' + (char.name || 'персонаж') + '...';
    const raw = await generateLoveScoreWithAI(cardText), parsed = parseAIResponse(raw);
    if (!parsed.ok) { console.warn('[LoveScore] raw AI response:', raw); status.textContent = 'Не удалось распознать ответ. Подробности в консоли (F12).'; return; }
    const d = loveData();
    if (parsed.changes.length   > 0) d.scoreChanges         = parsed.changes;
    if (parsed.ranges.length    > 0) d.scaleInterpretations = parsed.ranges;
    if (parsed.milestones && parsed.milestones.length > 0) d.milestones = parsed.milestones;
    if (parsed.suggestedMax && parsed.suggestedMax !== d.maxScore) {
      d.maxScore = parsed.suggestedMax;
      cfg().maxScore = parsed.suggestedMax;
      toast('info', 'Максимум очков изменён на ' + parsed.suggestedMax);
    }
    saveSettingsDebounced(); updatePromptInjection(); syncUI();
    status.textContent = 'Готово. Правил: ' + parsed.changes.length + ', диапазонов: ' + parsed.ranges.length + ', событий: ' + parsed.milestones.length;
    toast('success', 'Love Score настроен для ' + (char.name || 'персонаж'));
  } catch(e) {
    console.error('[LoveScore] generate error', e);
    status.textContent = 'Ошибка: ' + (e.message || String(e));
    toast('error', e.message || e);
  } finally { btn.disabled = false; btn.textContent = 'Сгенерировать'; }
}

function settingsPanelHTML() {
  const c = cfg(), curModel = escHtml(c.genModel || ''), curEndpoint = escHtml(c.genEndpoint || '');
  const curKey = escHtml(c.genApiKey || ''), lang = c.genLang || 'ru', curNotes = escHtml(c.genUserNotes || '');
  return '<div id="ls-settings-panel" class="extension-settings">'
    + '<div class="inline-drawer">'
    + '<div class="inline-drawer-toggle inline-drawer-header"><b>&#10084;&#65039; Love Score</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>'
    + '<div class="inline-drawer-content">'
    + '<div class="ls-row"><label class="checkbox_label" for="ls-enabled"><input type="checkbox" id="ls-enabled"><span>Включено</span></label></div>'
    + '<div class="ls-row">'
    + '<span style="font-size:12px;opacity:.6;">Очки:</span>'
    + '<input id="ls-val" type="number" min="0" class="ls-num-input" style="width:72px;">'
    + '<span style="opacity:.3;">/</span>'
    + '<input id="ls-max" type="number" min="1" class="ls-num-input" style="width:72px;">'
    + '<button id="ls-reset-btn" class="menu_button">Сбросить</button>'
    + '</div>'
    + '<div class="ls-row" style="align-items:center;gap:8px;">'
    + '<span style="font-size:12px;opacity:.6;white-space:nowrap;">Размер:</span>'
    + '<input type="range" id="ls-size" min="36" max="128" step="4" class="ls-size-slider" style="flex:1;">'
    + '<span id="ls-size-label" style="font-size:12px;min-width:36px;text-align:right;opacity:.5;">64px</span>'
    + '<button id="ls-reset-pos" class="menu_button" title="Вернуть виджет в угол">Позиция</button>'
    + '</div>'
    + '<div id="ls-active-state" style="display:none;"><strong>Сейчас:</strong> <span id="ls-active-text"></span></div>'

    + '<div id="ls-ai-box">'
    + '<div class="ls-section-title">Авто-генерация через ИИ</div>'
    + '<div class="ls-hint">Генерирует правила, диапазоны и романтические события под конкретного персонажа.</div>'
    + '<div class="ls-row" style="margin-bottom:6px;gap:12px;">'
    + '<span style="font-size:12px;opacity:.6;white-space:nowrap;">Язык описаний:</span>'
    + '<label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-ru" value="ru" ' + (lang === 'ru' ? 'checked' : '') + '> <span>Русский</span></label>'
    + '<label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-en" value="en" ' + (lang === 'en' ? 'checked' : '') + '> <span>English</span></label>'
    + '</div>'
    + '<label class="ls-api-label">Особые пожелания <span style="opacity:.35;font-weight:400;">(необязательно)</span></label>'
    + '<textarea id="ls-gen-notes" class="ls-api-field" rows="3" placeholder="Например: не добавляй события про брак, сделай персонажа застенчивее, сосредоточься на физическом контакте..." style="resize:vertical;min-height:56px;font-family:inherit;font-size:12px;line-height:1.5;">' + curNotes + '</textarea>'
    + '<label class="ls-api-label">Endpoint</label>'
    + '<input id="ls-gen-endpoint" class="ls-api-field" type="text" placeholder="https://api.example.com/" value="' + curEndpoint + '">'
    + '<label class="ls-api-label">API Key</label>'
    + '<input id="ls-gen-apikey" class="ls-api-field" type="password" placeholder="sk-..." value="' + curKey + '">'
    + '<label class="ls-api-label">Модель</label>'
    + '<div class="ls-model-row">'
    + '<select id="ls-gen-model-select">' + (curModel ? '<option value="' + curModel + '" selected>' + curModel + '</option>' : '<option value="">-- нажми для загрузки --</option>') + '</select>'
    + '<button id="ls-refresh-models" class="menu_button ls-refresh-btn" title="Загрузить список моделей"><i class="fa-solid fa-sync"></i></button>'
    + '</div>'
    + '<label class="ls-api-label">Персонаж</label>'
    + '<select id="ls-char-select"><option value="__current__">Текущий (из открытого чата)</option></select>'
    + '<div id="ls-char-preview"><img id="ls-char-avatar" class="ls-avatar-hidden" src="" alt=""><span id="ls-char-avatar-name"></span></div>'
    + '<button id="ls-gen-btn" class="menu_button">Сгенерировать</button>'
    + '<div id="ls-gen-status"></div>'
    + '</div>'

    + '<div class="ls-section-title">Правила изменения</div>'
    + '<div class="ls-hint">Укажи на сколько и при каких условиях меняется счёт.</div>'
    + '<div id="ls-changes-container"></div>'
    + '<div class="ls-section-title">Поведение по диапазонам</div>'
    + '<div class="ls-hint">Активный диапазон влияет на инструкцию персонажу.</div>'
    + '<div id="ls-interp-container"></div>'
    + '<div class="ls-section-title">Романтические события</div>'
    + '<div class="ls-hint">При достижении порога персонаж обязан инициировать событие. Отметиться когда произойдет.</div>'
    + '<div class="ls-milestone-reset-row"><button id="ls-milestone-reset-all" class="menu_button">Сбросить все</button></div>'
    + '<div id="ls-milestones-container"></div>'
    + '<div class="ls-row" style="margin-top:10px;"><label class="checkbox_label" for="ls-gradual"><input type="checkbox" id="ls-gradual"><span>Медленное изменение (+1/-1 за ответ)</span></label></div>'
    + '</div></div></div>';
}

function renderChanges() {
  const ct = document.getElementById('ls-changes-container'); if (!ct) return;
  const d = loveData(), arr = d.scoreChanges || [];
  let html = '';
  arr.forEach((c, i) => {
    const pos = c.delta >= 0, cls = pos ? 'ls-card-pos' : 'ls-card-neg';
    const icon = pos ? '&#10084;&#65039;' : '&#128148;', ph = pos ? 'При каких условиях растёт...' : 'При каких условиях падает...';
    html += '<div class="ls-card ' + cls + '" data-idx="' + i + '"><div class="ls-heart-box"><span class="ls-heart-icon">' + icon + '</span><input type="number" class="ls-delta-input ls-num-input" value="' + c.delta + '" data-idx="' + i + '" style="width:56px;font-weight:600;"></div><textarea class="ls-change-desc ls-textarea-field" data-idx="' + i + '" rows="3" placeholder="' + ph + '">' + escHtml(c.description) + '</textarea><button class="ls-del-change menu_button ls-del-btn" data-idx="' + i + '"><i class="fa-solid fa-times"></i></button></div>';
  });
  html += '<button id="ls-add-change" class="menu_button ls-add-btn">+ Добавить правило</button>';
  ct.innerHTML = html; bindChangesEv();
}

function renderInterps() {
  const ct = document.getElementById('ls-interp-container'); if (!ct) return;
  const d = loveData(), arr = d.scaleInterpretations || [];
  let html = '';
  arr.forEach((ip, i) => {
    const act = d.score >= ip.min && d.score <= ip.max, bst = act ? 'border-color:rgba(180,100,120,.6);' : '';
    html += '<div class="ls-card ls-card-neu" data-idx="' + i + '" style="' + bst + '"><div class="ls-range-box"><span class="ls-range-label">' + (act ? '&#9654; активно' : 'диапазон') + '</span><div class="ls-range-inner"><input type="number" class="ls-interp-min ls-range-input" value="' + ip.min + '" data-idx="' + i + '" min="0" placeholder="0"><span class="ls-range-sep">&#8212;</span><input type="number" class="ls-interp-max ls-range-input" value="' + ip.max + '" data-idx="' + i + '" min="0" placeholder="100"></div></div><textarea class="ls-interp-desc ls-textarea-field" data-idx="' + i + '" rows="3" placeholder="Описание поведения персонажа...">' + escHtml(ip.description) + '</textarea><button class="ls-del-interp menu_button ls-del-btn" data-idx="' + i + '"><i class="fa-solid fa-times"></i></button></div>';
  });
  html += '<button id="ls-add-interp" class="menu_button ls-add-btn">+ Добавить диапазон</button>';
  ct.innerHTML = html;
  const act = getActiveInterp(), box = document.getElementById('ls-active-state'), txt = document.getElementById('ls-active-text');
  if (box && txt) { if (act?.description?.trim()) { txt.textContent = act.description.trim(); box.style.display = 'block'; } else box.style.display = 'none'; }
  bindInterpEv();
}

function renderMilestones() {
  const ct = document.getElementById('ls-milestones-container'); if (!ct) return;
  const d = loveData(), arr = d.milestones || [];
  let html = '';
  arr.forEach((m, i) => {
    const reached = d.score >= m.threshold, doneClass = m.done ? ' ls-done' : '', reachedStyle = reached && !m.done ? 'border-color:rgba(200,160,80,.65);' : '';
    const statusText = m.done ? 'выполнено' : (reached ? 'пора!' : 'ждёт'), statusClass = (!m.done && reached) ? ' ls-status-due' : '';
    html += '<div class="ls-card ls-card-milestone' + doneClass + '" data-idx="' + i + '" style="' + reachedStyle + '"><div class="ls-milestone-left"><div class="ls-milestone-threshold-wrap"><span class="ls-milestone-threshold-label">от</span><input type="number" class="ls-milestone-thr-input ls-num-input" value="' + m.threshold + '" data-idx="' + i + '" min="0" style="width:56px;"></div><input type="checkbox" class="ls-milestone-done-cb" data-idx="' + i + '" ' + (m.done ? 'checked' : '') + '><span class="ls-milestone-status' + statusClass + '">' + statusText + '</span></div><textarea class="ls-milestone-desc ls-textarea-field" data-idx="' + i + '" rows="3" placeholder="Что должен сделать персонаж...">' + escHtml(m.description) + '</textarea><button class="ls-del-milestone menu_button ls-del-btn" data-idx="' + i + '"><i class="fa-solid fa-times"></i></button></div>';
  });
  html += '<button id="ls-add-milestone" class="menu_button ls-add-btn">+ Добавить событие</button>';
  ct.innerHTML = html; bindMilestonesEv();
}

function bindChangesEv() {
  $('.ls-delta-input').off('change').on('change', function() { loveData().scoreChanges[+$(this).data('idx')].delta = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderChanges(); });
  $('.ls-change-desc').off('input').on('input',   function() { loveData().scoreChanges[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-del-change').off('click').on('click',    function() { loveData().scoreChanges.splice(+$(this).data('idx'), 1); saveSettingsDebounced(); updatePromptInjection(); renderChanges(); });
  $('#ls-add-change').off('click').on('click', () => { loveData().scoreChanges.push({ delta: 1, description: '' }); saveSettingsDebounced(); renderChanges(); });
}

function bindInterpEv() {
  $('.ls-interp-min').off('change').on('change',  function() { loveData().scaleInterpretations[+$(this).data('idx')].min = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
  $('.ls-interp-max').off('change').on('change',  function() { loveData().scaleInterpretations[+$(this).data('idx')].max = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
  $('.ls-interp-desc').off('input').on('input',   function() { loveData().scaleInterpretations[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-del-interp').off('click').on('click',    function() { loveData().scaleInterpretations.splice(+$(this).data('idx'), 1); saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
  $('#ls-add-interp').off('click').on('click', () => { const a = loveData().scaleInterpretations, lm = a[a.length-1]?.max ?? 0; a.push({ min: lm+1, max: lm+10, description: '' }); saveSettingsDebounced(); renderInterps(); });
}

function bindMilestonesEv() {
  $('.ls-milestone-thr-input').off('change').on('change', function() { loveData().milestones[+$(this).data('idx')].threshold = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
  $('.ls-milestone-done-cb').off('change').on('change',   function() { loveData().milestones[+$(this).data('idx')].done = this.checked; saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
  $('.ls-milestone-desc').off('input').on('input',        function() { loveData().milestones[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-del-milestone').off('click').on('click',         function() { loveData().milestones.splice(+$(this).data('idx'), 1); saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
  $('#ls-add-milestone').off('click').on('click', () => { const a = loveData().milestones, last = a[a.length-1]?.threshold ?? 0; a.push({ threshold: last + 10, description: '', done: false }); saveSettingsDebounced(); renderMilestones(); });
  $('#ls-milestone-reset-all').off('click').on('click', () => { loveData().milestones.forEach(m => m.done = false); saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); toast('info', 'Все события сброшены'); });
}

function buildPrompt() {
  const c = cfg(), d = loveData(); if (!c.isEnabled) return '';
  const changes = (d.scoreChanges || []).filter(x => x.description.trim());
  const interps  = (d.scaleInterpretations || []).filter(x => x.description.trim());
  const active = getActiveInterp(), pending = getPendingMilestones();
  let p = '[OOC - LOVE SCORE SYSTEM]\n\nCurrent love score: ' + d.score + '/' + d.maxScore + '.';
  if (active?.description?.trim()) { p += '\n\nCURRENT BEHAVIOR (score ' + d.score + '):\n' + active.description.trim() + '\n\nPortray the character strictly according to this description.'; }
  if (pending.length > 0) {
    p += '\n\nROMANTIC EVENTS — YOU MUST INITIATE (naturally, within this or the next response):';
    pending.forEach(m => { p += '\n- ' + m.description.trim() + ' (unlocked at score ' + m.threshold + ')'; });
    p += '\nAfter completing an event, include at the very end: <!-- [MILESTONE:' + pending[0].threshold + '] -->';
  }
  if (changes.length) { p += '\n\nLove Score Changes:'; changes.forEach(x => { p += '\n' + (x.delta >= 0 ? '+' : '') + x.delta + ': ' + x.description.trim(); }); }
  if (interps.length) { p += '\n\nLove Scale:'; interps.forEach(x => { p += '\n' + x.min + '-' + x.max + ': ' + x.description.trim() + ((d.score >= x.min && d.score <= x.max) ? ' <- NOW' : ''); }); }
  if (c.gradualProgression) p += '\n\nGradual Progression: change score by +1 or -1 per response unless something major happened.';
  p += '\n\nAt the end of each response include: <!-- [LOVE_SCORE:X] --> replacing X with the updated score (0-' + d.maxScore + ').';
  return p;
}

function updatePromptInjection() {
  try {
    setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.IN_CHAT, 0);
    if (!cfg().isEnabled) return;
    const p = buildPrompt();
    setTimeout(() => setExtensionPrompt(PROMPT_KEY, p, extension_prompt_types.IN_CHAT, 0), 50);
  } catch(e) { console.error('[LoveScore] inject', e); }
}

function onMessageReceived() {
  if (!cfg().isEnabled) return;
  try {
    const chat = typeof SillyTavern?.getContext === 'function' ? SillyTavern.getContext().chat : window.chat;
    if (!chat?.length) return;
    const msg = chat[chat.length - 1]; if (!msg || msg.is_user) return;
    const text = msg.mes || '';
    const scoreMatch = text.match(/<!--\s*\[LOVE_SCORE:(\d+)\]\s*-->/i);
    if (scoreMatch) {
      const d = loveData(), nv = parseInt(scoreMatch[1], 10), ov = d.score;
      d.score = Math.max(0, Math.min(nv, d.maxScore));
      if (ov !== d.score) { pulseWidget(); refreshWidget(); syncUI(); }
    }
    const msMatch = text.match(/<!--\s*\[MILESTONE:(\d+)\]\s*-->/i);
    if (msMatch) {
      const threshold = parseInt(msMatch[1], 10), d = loveData();
      const ms = (d.milestones || []).find(m => m.threshold === threshold && !m.done);
      if (ms) { ms.done = true; toast('success', 'Событие выполнено: ' + ms.description.slice(0, 60) + (ms.description.length > 60 ? '...' : '')); renderMilestones(); }
    }
    saveSettingsDebounced(); updatePromptInjection();
  } catch(e) { console.error('[LoveScore] parse', e); }
}

function syncUI() {
  const c = cfg(), d = loveData(), el = id => document.getElementById(id);
  const cb = el('ls-enabled'); if (cb) cb.checked = c.isEnabled;
  const v  = el('ls-val');     if (v)  v.value  = d.score;
  const m  = el('ls-max');     if (m)  m.value  = d.maxScore;
  const gr = el('ls-gradual'); if (gr) gr.checked = c.gradualProgression ?? true;
  const sz = el('ls-size'), lb = el('ls-size-label');
  if (sz) { sz.value = c.widgetSize || 64; if (lb) lb.textContent = (c.widgetSize || 64) + 'px'; }
  const lang = c.genLang || 'ru';
  const rRu = el('ls-lang-ru'), rEn = el('ls-lang-en');
  if (rRu) rRu.checked = lang === 'ru';
  if (rEn) rEn.checked = lang === 'en';
  const nt = el('ls-gen-notes'); if (nt && document.activeElement !== nt) nt.value = c.genUserNotes || '';
  populateCharSelect();
  const selEl = el('ls-char-select'), selVal = selEl ? selEl.value : '__current__';
  const previewChar = (selVal === '__current__') ? getCurrentCharacterCard() : getCharacterByIndex(parseInt(selVal, 10));
  updateCharPreview(previewChar);
  renderChanges(); renderInterps(); renderMilestones(); refreshWidget();
}

function bindMainEvents() {
  $('#ls-enabled').off('change').on('change', function() { cfg().isEnabled = this.checked; saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); });
  $('#ls-val').off('change').on('change', function() { const d = loveData(); d.score = Math.max(0, Math.min(parseInt(this.value)||0, d.maxScore)); saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); renderInterps(); renderMilestones(); });
  $('#ls-max').off('change').on('change', function() { const d = loveData(), c = cfg(); d.maxScore = Math.max(1, parseInt(this.value)||100); c.maxScore = d.maxScore; if (d.score > d.maxScore) d.score = d.maxScore; saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); });
  $('#ls-reset-btn').off('click').on('click', () => { loveData().score = 0; saveSettingsDebounced(); pulseWidget(); syncUI(); updatePromptInjection(); });
  $('#ls-gradual').off('change').on('change', function() { cfg().gradualProgression = this.checked; saveSettingsDebounced(); updatePromptInjection(); });
  $(document).off('input', '#ls-size').on('input', '#ls-size', function() {
    const sz = parseInt(this.value), lb = document.getElementById('ls-size-label'); if (lb) lb.textContent = sz + 'px';
    applyWidgetSize(sz); cfg().widgetSize = sz; saveSettingsDebounced();
  });
  $(document).off('click', '#ls-reset-pos').on('click', '#ls-reset-pos', () => {
    cfg().widgetPos = null; saveSettingsDebounced();
    const w = document.getElementById('ls-widget');
    if (w) { w.style.top = '100px'; w.style.bottom = 'auto'; w.style.left = '18px'; w.style.right = 'auto'; }
    toast('info', 'Позиция сброшена');
  });
  $(document).off('input',  '#ls-gen-endpoint').on('input',  '#ls-gen-endpoint', function() { cfg().genEndpoint   = this.value; saveSettingsDebounced(); });
  $(document).off('input',  '#ls-gen-apikey').on('input',    '#ls-gen-apikey',   function() { cfg().genApiKey     = this.value; saveSettingsDebounced(); });
  $(document).off('input',  '#ls-gen-notes').on('input',     '#ls-gen-notes',    function() { cfg().genUserNotes  = this.value; saveSettingsDebounced(); });
  $(document).off('change', '#ls-gen-model-select').on('change', '#ls-gen-model-select', function() { cfg().genModel = this.value; saveSettingsDebounced(); });
  $(document).off('change', 'input[name=ls-lang]').on('change', 'input[name=ls-lang]',   function() { cfg().genLang  = this.value; saveSettingsDebounced(); });
  $(document).off('click',  '#ls-refresh-models').on('click', '#ls-refresh-models', onRefreshModels);
  $(document).off('click',  '#ls-gen-btn').on('click',        '#ls-gen-btn',       onGenerateClick);
  $(document).off('focus',  '#ls-char-select').on('focus',    '#ls-char-select',   populateCharSelect);
  $(document).off('change', '#ls-char-select').on('change',   '#ls-char-select',   function() {
    const val = this.value;
    const char = (val === '__current__') ? getCurrentCharacterCard() : getCharacterByIndex(parseInt(val, 10));
    updateCharPreview(char);
  });
}

jQuery(() => {
  try {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = structuredClone(defaultSettings);
    const c = cfg();
    for (const [k, v] of Object.entries(defaultSettings)) if (c[k] === undefined) c[k] = structuredClone(v);
    if (c.isEnabled === false && !c._wasManuallyDisabled) c.isEnabled = true;
    if (c.widgetPos && c.widgetPos.top == null) c.widgetPos = null;
    $('#extensions_settings').append(settingsPanelHTML());
    createWidget(); bindMainEvents(); syncUI(); updatePromptInjection();
    eventSource.on(event_types.MESSAGE_SENT,     () => updatePromptInjection());
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, () => { cfg().lastCheckedMessageId = null; syncUI(); updatePromptInjection(); });
    console.log('[LoveScore] v19 ready');
  } catch(e) {
    console.error('[LoveScore] init failed', e);
    toast('error', 'Love Score: ошибка инициализации');
  }
});
