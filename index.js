import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXT_NAME  = 'love-score';
const PROMPT_KEY = EXT_NAME + '_injection';
const MIN_SCORE  = -100;

const defaultSettings = {
  isEnabled: true, maxScore: 100, gradualProgression: true,
  widgetPos: null, widgetSize: 64, heartStyle: 'svg',
  lastCheckedMessageId: null, chatLoveData: {},
  genEndpoint: '', genApiKey: '', genModel: '', genLang: 'ru', genUserNotes: '',
  genScope: { changes: true, positiveRanges: true, negativeRanges: true, milestones: true, suggestedMax: true },
  chatAnalysisMsgCount: 20,
  presets: [],
  autoSuggestEnabled: false,
  autoSuggestInterval: 20,
  _autoSuggestMsgCounter: 0,
  groupMode: false,
  groupNpcs: [],
  genLorebookEntryIds: [],
  genUseCard: true,
};

// ─── Цветовые хелперы ────────────────────────────────────────────────────────
function _h2r(hex){
  const h=hex.replace('#','');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
function _lerpHex(a,b,t){
  const [r1,g1,b1]=_h2r(a),[r2,g2,b2]=_h2r(b);
  return '#'+[r1+t*(r2-r1),g1+t*(g2-g1),b1+t*(b2-b1)].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}

// ─── Типы отношений ───────────────────────────────────────────────────────────
const RELATION_TYPES = {
  neutral:    { label: 'Нейтрально',  color: '#d0d0d0', deep: '#888888', desc: 'Тип не определён. Отношения только начинаются.' },
  romance:    { label: 'Романтика',   color: '#ff2d55', deep: '#c0002a', desc: 'Влюблённость, страсть, нежность. Особая привязанность.' },
  friendship: { label: 'Дружба',      color: '#ff9d2e', deep: '#b35000', desc: 'Тепло, забота и доверие без романтики.' },
  family:     { label: 'Семья',       color: '#f0c000', deep: '#8a6c00', desc: 'Глубокая привязанность как к близкому человеку.' },
  platonic:   { label: 'Платоника',   color: '#00c49a', deep: '#006655', desc: 'Духовная близость и взаимопонимание без физики.' },
  rival:      { label: 'Соперник',    color: '#2979ff', deep: '#003a99', desc: 'Уважение через конкуренцию. Напряжённая динамика.' },
  obsession:  { label: 'Одержимость', color: '#a855f7', deep: '#5c00b0', desc: 'Всепоглощающая фиксация. Тёмная, болезненная привязанность.' },
  hostile:    { label: 'Ненависть',   color: '#2e8b00', deep: '#050f00', desc: 'Открытая ненависть и враждебность. Перевёрнутое сердце — символ ненависти.' },
};

const mkLoveData = () => ({
  score: 0, maxScore: 100, relationType: 'neutral', scoreLog: [],
  scoreChanges: [
    { delta: 1, description: '' }, { delta: 2,   description: '' },
    { delta: -1, description: '' }, { delta: -2,  description: '' },
    { delta: -5, description: '' }, { delta: -10, description: '' }
  ],
  scaleInterpretations: [
    { min: 0,    max: 10,  description: '' }, { min: 11, max: 30,  description: '' },
    { min: 31,   max: 50,  description: '' }, { min: 51, max: 70,  description: '' },
    { min: 71,   max: 85,  description: '' }, { min: 86, max: 95,  description: '' },
    { min: 96,   max: 100, description: '' },
    { min: -30,  max: -1,  description: '' }, { min: -70, max: -31, description: '' },
    { min: -100, max: -71, description: '' }
  ],
  milestones: [
    { threshold: 15, description: 'Сделай комплимент или небольшой знак внимания.', done: false },
    { threshold: 30, description: 'Предложи встретиться или провести время вместе.', done: false },
    { threshold: 50, description: 'Сделай подарок или особый жест.',                done: false },
    { threshold: 65, description: 'Впервые открыто признайся в чувствах.',          done: false },
    { threshold: 80, description: 'Заговори о серьёзных отношениях.',               done: false },
    { threshold: 90, description: 'Сделай предложение руки и сердца.',              done: false },
    { threshold: 97, description: 'Заговори о совместном будущем.',                 done: false }
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

function ensureLDFields(d) {
  const mk = mkLoveData();
  if (!d.scoreChanges)         d.scoreChanges         = mk.scoreChanges;
  if (!d.scaleInterpretations) d.scaleInterpretations = mk.scaleInterpretations;
  if (!d.milestones)           d.milestones           = mk.milestones;
  if (!d.scoreLog)             d.scoreLog             = [];
  if (d.maxScore == null)      d.maxScore             = mk.maxScore;
  if (!d.relationType)         d.relationType         = 'neutral';
  return d;
}

function chatLoveData() {
  const c = cfg();
  if (!c.chatLoveData) c.chatLoveData = {};
  const id = getChatId();
  if (!c.chatLoveData[id]) c.chatLoveData[id] = mkLoveData();
  return ensureLDFields(c.chatLoveData[id]);
}

function loveData() { return chatLoveData(); }

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getActiveInterp() {
  const d = loveData();
  return (d.scaleInterpretations || []).find(ip => d.score >= ip.min && d.score <= ip.max) ?? null;
}

function getPendingMilestones() {
  const d = loveData();
  return (d.milestones || []).filter(m => !m.done && d.score >= m.threshold);
}

// ─── Цвета сердца (SVG стиль) ─────────────────────────────────────────────────
function heartColor(score, max, rt='neutral') {
  const _t=RELATION_TYPES[rt]||RELATION_TYPES.neutral;
  const r=Math.max(0,Math.min(1,Math.abs(score)/(score>=0?max:100)));
  if (score >= 0) {
    if (r<=0.5) return _lerpHex('#ffffff',_t.color,Math.max(r*2,0.1));
    return _lerpHex(_t.color,_t.deep,(r-0.5)*2);
  } else {
    const negPeak=(rt==='hostile')?'#0a8c3a':'#4ec900';
    const negDeep=(rt==='hostile')?'#041a0a':'#050f00';
    if (r<=0.5) return _lerpHex('#ffffff',negPeak,Math.max(r*2,0.1));
    return _lerpHex(negPeak,negDeep,(r-0.5)*2);
  }
}

function heartStroke(score, rt='neutral') {
  if (score >= 0) {
    const r=Math.max(0,Math.min(1,score/(loveData().maxScore||100)));
    if (r<0.15) return 'rgba(200,200,200,.35)';
    const [r1,g1,b1]=_h2r((RELATION_TYPES[rt]||RELATION_TYPES.romance).color);
    return `rgba(${r1},${g1},${b1},.5)`;
  }
  const r=Math.abs(score)/100;
  if (r>=0.75) return 'rgba(5,25,0,.95)';
  if (r>=0.40) return 'rgba(20,90,0,.85)';
  return 'rgba(80,200,0,.6)';
}

// ─── Цвета сердца (Blur стиль) ────────────────────────────────────────────────
function heartColorRgba(score, max, rt='neutral') {
  const t = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
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

function addToLog(d, delta, reason) {
  if (!d.scoreLog) d.scoreLog = [];
  const sign = delta >= 0 ? '+' : '';
  d.scoreLog.unshift({ delta, sign: sign + delta, reason: reason || '' });
  if (d.scoreLog.length > 10) d.scoreLog.length = 10;
}

// ─── Пресеты ─────────────────────────────────────────────────────────────────
function snapshotCurrentData(name) {
  const d = loveData();
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name,
    createdAt: new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
    maxScore: d.maxScore,
    scoreChanges:         JSON.parse(JSON.stringify(d.scoreChanges         || [])),
    scaleInterpretations: JSON.parse(JSON.stringify(d.scaleInterpretations || [])),
    milestones:           JSON.parse(JSON.stringify((d.milestones || []).map(m => ({ ...m, done: false }))))
  };
}

function savePreset(name) {
  if (!name.trim()) { toast('warning', 'Введи название пресета'); return; }
  const c = cfg();
  if (!c.presets) c.presets = [];
  const existing = c.presets.findIndex(p => p.name === name.trim());
  const snap = snapshotCurrentData(name.trim());
  if (existing >= 0) c.presets[existing] = snap;
  else c.presets.push(snap);
  saveSettingsDebounced();
  toast('success', 'Пресет «' + name.trim() + '» сохранён');
  renderPresets();
}

function applyPresetData(src, mode, sections) {
  const d = loveData();
  if (mode === 'replace') {
    if (sections.changes)    d.scoreChanges         = JSON.parse(JSON.stringify(src.scoreChanges         || []));
    if (sections.ranges)     d.scaleInterpretations = JSON.parse(JSON.stringify(src.scaleInterpretations || []));
    if (sections.milestones) d.milestones           = JSON.parse(JSON.stringify(src.milestones           || []));
    if (sections.maxScore)   { d.maxScore = src.maxScore || d.maxScore; cfg().maxScore = d.maxScore; }
  } else {
    if (sections.changes) {
      const existing = new Set(d.scoreChanges.map(x => x.delta+'|'+x.description));
      (src.scoreChanges||[]).forEach(x => { if(!existing.has(x.delta+'|'+x.description)) d.scoreChanges.push(JSON.parse(JSON.stringify(x))); });
    }
    if (sections.ranges) {
      const existing = new Set(d.scaleInterpretations.map(x => x.min+'|'+x.max));
      (src.scaleInterpretations||[]).forEach(x => { if(!existing.has(x.min+'|'+x.max)) d.scaleInterpretations.push(JSON.parse(JSON.stringify(x))); });
    }
    if (sections.milestones) {
      const existing = new Set(d.milestones.map(x => x.threshold));
      (src.milestones||[]).forEach(x => { if(!existing.has(x.threshold)) d.milestones.push(JSON.parse(JSON.stringify(x))); });
    }
  }
  saveSettingsDebounced(); updatePromptInjection(); syncUI();
}

function loadPresetUI(src) {
  const mode     = document.querySelector('input[name=ls-load-mode]:checked')?.value || 'replace';
  const sections = {
    changes:    document.getElementById('ls-load-changes')?.checked    ?? true,
    ranges:     document.getElementById('ls-load-ranges')?.checked     ?? true,
    milestones: document.getElementById('ls-load-milestones')?.checked ?? true,
    maxScore:   document.getElementById('ls-load-maxscore')?.checked   ?? true
  };
  applyPresetData(src, mode, sections);
  toast('success', 'Пресет «' + src.name + '» применён (' + mode + ')');
}

function deletePreset(id) {
  const c = cfg();
  c.presets = (c.presets || []).filter(p => p.id !== id);
  saveSettingsDebounced();
  renderPresets();
}

function exportPresetJSON(src) {
  const blob = new Blob([JSON.stringify(src, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ls-preset-' + (src.name||'preset').replace(/[^a-zа-яё0-9_-]/gi,'_').slice(0,40) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('success', 'Скачиваю «' + (src.name||'preset') + '.json»');
}

function importPresetFromJSON(json) {
  try {
    const src = JSON.parse(json.trim());
    if (!src.name) src.name = 'Импорт ' + new Date().toLocaleTimeString('ru-RU');
    if (!src.id)   src.id   = Date.now().toString(36);
    if (!src.createdAt) src.createdAt = new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const c = cfg();
    if (!c.presets) c.presets = [];
    c.presets.push(src);
    saveSettingsDebounced(); renderPresets();
    toast('success', 'Пресет «' + src.name + '» импортирован');
  } catch(e) { toast('error', 'Неверный JSON: ' + e.message); }
}

function autoSnapshot(reason) {
  const name = reason + ' ' + new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const c = cfg();
  if (!c.presets) c.presets = [];
  const autoSnaps = c.presets.filter(p => p.name.startsWith('🔄'));
  if (autoSnaps.length >= 5) c.presets.splice(c.presets.indexOf(autoSnaps[0]), 1);
  c.presets.push(snapshotCurrentData('🔄 ' + name));
  saveSettingsDebounced(); renderPresets();
}

// ─── Стили ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('ls-styles')) return;
  const el = document.createElement('style');
  el.id = 'ls-styles';
  el.textContent = `
/* ── Widget ── */
#ls-widget {
  position:fixed;top:100px;left:18px;bottom:auto;right:auto;
  width:64px;height:60px;cursor:grab;z-index:999999;
  user-select:none;touch-action:none;
  filter:var(--ls-glow,drop-shadow(0 4px 14px rgba(200,200,200,.25)));
  transition:filter .3s ease,transform .35s ease;
}
#ls-widget:hover{filter:var(--ls-hover-glow,drop-shadow(0 6px 22px rgba(200,200,200,.5)));}
#ls-widget:active{cursor:grabbing;}
#ls-widget.ls-beat{animation:ls-hb .55s cubic-bezier(.36,1.8,.5,1) forwards;}
#ls-widget.ls-flip{animation:ls-flip-anim .55s ease forwards;}
@keyframes ls-hb{0%{transform:scale(1)}40%{transform:scale(1.30)}70%{transform:scale(.92)}100%{transform:scale(1)}}
@keyframes ls-flip-anim{0%{transform:scaleY(1)}35%{transform:scaleY(0) scale(1.15)}65%{transform:scaleY(0) scale(1.15)}100%{transform:scaleY(1)}}
#ls-heart-fill{transition:y .6s ease,height .6s ease,fill .5s ease;}

/* ── Общий тултип для обоих видов сердца ── */
#ls-status-tip, .ls-tip{
  position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);
  background:rgba(18,18,22,.96);backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.1);border-radius:8px;
  padding:7px 11px;font-size:11px;line-height:1.5;color:rgba(255,255,255,.8);
  pointer-events:none;opacity:0;white-space:normal;text-align:center;
  max-width:210px;min-width:90px;transition:opacity .18s ease;z-index:1000000;
}
#ls-widget:hover #ls-status-tip, #ls-widget:hover .ls-tip{opacity:1;}
.ls-tip-type{font-weight:700;margin-bottom:3px;font-size:12px;}
.ls-tip-desc{font-size:10px;opacity:.75;line-height:1.45;}

/* ── Blur heart widget ── */
.ls-heart-wrap{position:relative;width:100%;height:100%;}
.ls-heart-blur{position:absolute;inset:0;transition:filter .4s ease;}
.ls-heart-blur svg{display:block;width:100%;height:100%;overflow:visible;}
.ls-heart-blur path{transition:fill .5s ease;}
.ls-heart-score{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;pointer-events:none;z-index:2;
}
.ls-heart-num{font-size:16px;font-weight:800;line-height:1;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6),0 0 20px rgba(0,0,0,.3);}
.ls-heart-denom{font-size:9px;line-height:1;margin-top:1px;color:rgba(255,255,255,.6);text-shadow:0 1px 4px rgba(0,0,0,.5);}

/* ── Panel shared ── */
.ls-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.ls-section-title{font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--SmartThemeBodyColor,#aaa);opacity:.55;margin:14px 0 5px;padding-bottom:4px;border-bottom:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-hint{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.4;line-height:1.5;margin-bottom:6px;}
.ls-num-input{background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:4px 6px;text-align:center;font-size:13px;transition:border-color .15s;}
.ls-num-input:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4));}
.ls-range-input{background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:4px 6px;text-align:center;font-size:13px;width:68px;box-sizing:border-box;transition:border-color .15s;}
.ls-range-input:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4));}
.ls-textarea-field{flex:1;resize:vertical;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:6px 8px;font-family:inherit;font-size:12px;line-height:1.55;box-sizing:border-box;min-height:52px;transition:border-color .15s;}
.ls-textarea-field:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35));}

/* ── Cards ── */
.ls-card{display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;padding:8px;border-radius:6px;border:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-card-pos{background:rgba(255,180,200,.04);border-color:rgba(255,150,180,.15);}
.ls-card-neg{background:rgba(40,40,50,.3);border-color:rgba(80,80,100,.2);}
.ls-card-neu{background:var(--input-background-fill,rgba(255,255,255,.02));}
.ls-card-milestone{background:rgba(255,220,160,.04);border-color:rgba(220,180,120,.15);}
.ls-card-milestone.ls-done{opacity:.4;}
.ls-heart-box{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:44px;}
.ls-heart-icon{font-size:18px;line-height:1;display:block;}
.ls-heart-icon.ls-icon-pos{color:rgba(255,100,140,.85);filter:drop-shadow(0 0 4px rgba(255,80,120,.4));}
.ls-heart-icon.ls-icon-neg{color:rgba(110,110,155,.75);}
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

/* ── Relation type buttons ── */
.ls-rel-type-row{display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:4px 0;flex-wrap:nowrap;}
.ls-rel-type-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;cursor:pointer;opacity:.22;transition:opacity .15s,filter .15s;user-select:none;flex-shrink:0;}
.ls-rel-type-btn:hover{opacity:.6;}
.ls-rel-type-btn.ls-rt-active{opacity:1;filter:drop-shadow(0 2px 8px currentColor);}
#ls-type-info{display:none;font-size:11px;line-height:1.55;padding:7px 10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));color:var(--SmartThemeBodyColor,#ccc);margin-bottom:6px;}
.ls-rt-neutral{color:#c0c0c0}.ls-rt-romance{color:#ff2d55}.ls-rt-friendship{color:#ff9d2e}.ls-rt-family{color:#f0c000}.ls-rt-platonic{color:#00c49a}.ls-rt-rival{color:#2979ff}.ls-rt-obsession{color:#a855f7}.ls-rt-hostile{color:#2e8b00}
.ls-rel-type-label{font-size:11px;opacity:.45;color:var(--SmartThemeBodyColor,#aaa);margin-left:4px;min-width:70px;}

/* ── Preset box ── */
.ls-preset-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;padding:7px 9px;border-radius:5px;background:var(--input-background-fill,rgba(255,255,255,.02));border:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-preset-row.ls-preset-snap{border-left:3px solid rgba(100,180,100,.35);opacity:.7;}
.ls-preset-info{flex:1;min-width:0;}
.ls-preset-name{font-size:12px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ls-preset-meta{font-size:10px;opacity:.35;margin-top:1px;}
.ls-preset-actions{display:flex;gap:4px;flex-shrink:0;}
.ls-preset-btn{padding:3px 7px!important;min-width:unset!important;font-size:11px!important;}
#ls-load-mode-box{padding:8px;border-radius:5px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.08));margin-bottom:8px;}
.ls-load-mode-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px;}
.ls-load-checks{display:flex;gap:8px;flex-wrap:wrap;}

/* ── AI box ── */
.ls-api-label{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.45;margin:6px 0 3px;display:block;}
.ls-api-field{width:100%;box-sizing:border-box;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:5px 8px;font-size:12px;transition:border-color .15s;}
.ls-api-field:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35));}
.ls-model-row{display:flex;gap:6px;align-items:center;margin-bottom:2px;}
.ls-model-row select{flex:1;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:5px 8px;font-size:12px;}
.ls-refresh-btn{padding:5px 9px!important;min-width:unset!important;flex-shrink:0;}
.ls-refresh-btn.ls-loading i{animation:ls-spin .7s linear infinite;}
@keyframes ls-spin{to{transform:rotate(360deg)}}
.ls-scope-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-bottom:8px;}
.ls-scope-item{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--SmartThemeBodyColor,#ccc);}
#ls-char-preview{display:flex;align-items:center;gap:10px;padding:8px 10px;margin:8px 0 4px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.08));}
#ls-char-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--border-color,rgba(255,255,255,.2));flex-shrink:0;background:var(--input-background-fill,rgba(255,255,255,.06));transition:opacity .2s;box-shadow:0 2px 10px rgba(0,0,0,.4);}
#ls-char-avatar.ls-avatar-hidden{display:none;}
#ls-char-avatar-name{font-size:13px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;}
#ls-gen-status{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.6;margin-top:5px;min-height:15px;line-height:1.4;}

/* ── Score log ── */
.ls-log-entry{display:flex;align-items:center;gap:8px;padding:4px 8px;margin-bottom:2px;border-radius:4px;font-size:11px;}
.ls-log-delta{font-size:12px;font-weight:800;min-width:36px;white-space:nowrap;}
.ls-log-reason{color:var(--SmartThemeBodyColor,#ccc);opacity:.7;line-height:1.4;}
.ls-log-clear{padding:2px 8px!important;min-width:unset!important;font-size:10px!important;opacity:.4;}
.ls-log-clear:hover{opacity:.8;}

/* ── Analyze ── */
#ls-analyze-result{margin-top:8px;padding:10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.12));display:none;}
.ls-analyze-score{font-size:13px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);margin-bottom:6px;}
.ls-analyze-text{font-size:12px;line-height:1.55;color:var(--SmartThemeBodyColor,#ccc);opacity:.85;margin-bottom:5px;}
.ls-analyze-reason{font-size:11px;line-height:1.4;color:var(--SmartThemeBodyColor,#aaa);opacity:.55;font-style:italic;}
.ls-analyze-reltype{display:flex;align-items:center;padding:6px 0 8px 0;margin-bottom:4px;border-bottom:1px solid var(--border-color,rgba(255,255,255,.08));}

/* ── Auto-suggest box ── */
#ls-autosuggest-result{margin-top:8px;padding:10px;border-radius:6px;background:rgba(255,200,100,.04);border:1px dashed rgba(255,200,100,.25);display:none;font-size:12px;line-height:1.6;color:var(--SmartThemeBodyColor,#ccc);}
#ls-autosuggest-result .ls-as-title{font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.5;margin-bottom:6px;}

/* ── Debug / Отладка ── */
#ls-debug-prompt{width:100%;box-sizing:border-box;min-height:140px;max-height:320px;overflow-y:auto;resize:vertical;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.07);border-radius:6px;color:rgba(180,255,180,.8);font-family:'Courier New',monospace;font-size:10px;line-height:1.6;padding:10px;white-space:pre-wrap;word-break:break-word;outline:none;}
.ls-debug-block{margin-bottom:12px;}
.ls-debug-label{font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;opacity:.35;margin-bottom:4px;display:flex;align-items:center;gap:6px;}
.ls-debug-label i{opacity:.7;}
.ls-debug-copy{padding:2px 8px!important;min-width:unset!important;font-size:10px!important;opacity:.4;margin-left:auto;}
.ls-debug-copy:hover{opacity:.9;}
.ls-debug-npc-state{display:flex;flex-direction:column;gap:4px;}
.ls-debug-npc-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);font-size:11px;}
.ls-debug-npc-name{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ls-debug-npc-score{font-size:12px;font-weight:800;min-width:36px;text-align:right;}
.ls-debug-npc-rt{font-size:10px;opacity:.5;min-width:70px;}
.ls-debug-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
.ls-debug-stat{display:flex;flex-direction:column;padding:6px 10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:5px;}
.ls-debug-stat-val{font-size:14px;font-weight:800;color:var(--SmartThemeBodyColor,#eee);}
.ls-debug-stat-key{font-size:9px;opacity:.35;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;}
.ls-debug-refresh{font-size:11px!important;padding:4px 10px!important;min-width:unset!important;}

.ls-npc-card{position:relative;margin-bottom:8px;border-radius:10px;border:1px solid rgba(255,255,255,.08);overflow:hidden;background:rgba(255,255,255,.015);transition:border-color .2s,box-shadow .2s;}
.ls-npc-card:hover{border-color:rgba(255,255,255,.15);box-shadow:0 4px 20px rgba(0,0,0,.25);}
/* avatar */
.ls-npc-av-wrap{position:relative;width:46px;height:46px;flex-shrink:0;cursor:pointer;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);box-shadow:0 2px 10px rgba(0,0,0,.4);transition:border-color .2s;}
.ls-npc-av-wrap:hover .ls-npc-av-overlay{opacity:1;}
.ls-npc-av-wrap:hover{border-color:rgba(255,255,255,.4);}
.ls-npc-av-img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}
.ls-npc-av-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;color:rgba(255,255,255,.25);}
.ls-npc-av-overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;opacity:0;transition:opacity .15s;border-radius:50%;}
/* top row */
.ls-npc-top{display:flex;align-items:center;gap:10px;padding:10px 10px 8px 12px;}
.ls-npc-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;}
.ls-npc-names{display:flex;gap:6px;align-items:center;}
.ls-npc-name{font-size:13px;font-weight:700;color:var(--SmartThemeBodyColor,#eee);background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.08);outline:none;flex:1;min-width:0;padding:1px 2px;transition:border-color .15s;}
.ls-npc-name:focus{border-bottom-color:rgba(255,255,255,.35);}
.ls-npc-name-en{font-size:10px;color:rgba(255,255,255,.35);background:transparent;border:none;border-bottom:1px dashed rgba(255,255,255,.08);outline:none;width:80px;flex-shrink:0;padding:1px 2px;transition:border-color .15s;font-style:italic;}
.ls-npc-name-en:focus{border-bottom-color:rgba(255,255,255,.25);color:rgba(255,255,255,.6);}
.ls-npc-name-en::placeholder{opacity:.5;}
/* relation + score row */
.ls-npc-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.ls-npc-rt-row{display:flex;gap:3px;align-items:center;}
.ls-npc-rt-btn{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;cursor:pointer;opacity:.18;transition:opacity .15s,filter .15s;flex-shrink:0;border-radius:50%;}
.ls-npc-rt-btn:hover{opacity:.5;}
.ls-npc-rt-btn.ls-rt-active{opacity:1;filter:drop-shadow(0 1px 5px currentColor);}
.ls-npc-rt-label{font-size:10px;font-weight:600;margin-left:3px;opacity:.8;}
.ls-npc-sep{opacity:.15;font-size:10px;}
.ls-npc-score-row{display:flex;align-items:center;gap:3px;margin-left:auto;flex-shrink:0;}
.ls-npc-adj-btn{width:20px;height:20px;padding:0!important;min-width:unset!important;font-size:10px!important;display:flex;align-items:center;justify-content:center;opacity:.6;}
.ls-npc-adj-btn:hover{opacity:1;}
.ls-npc-score-val{font-size:13px;font-weight:800;min-width:26px;text-align:center;}
.ls-npc-score-sep{font-size:10px;opacity:.25;}
.ls-npc-score-max{width:36px;font-size:10px;background:transparent;border:none;border-bottom:1px dashed rgba(255,255,255,.1);color:rgba(255,255,255,.4);outline:none;text-align:center;padding:0;}
.ls-npc-score-max:focus{border-bottom-color:rgba(255,255,255,.3);color:rgba(255,255,255,.7);}
.ls-npc-del-btn{opacity:.2;transition:opacity .15s;padding:3px 6px!important;min-width:unset!important;font-size:11px!important;flex-shrink:0;}
.ls-npc-del-btn:hover{opacity:.8;}
/* bar */
.ls-npc-bar-wrap{height:4px;background:rgba(255,255,255,.05);position:relative;overflow:hidden;}
.ls-npc-bar-fill{height:100%;transition:width .5s cubic-bezier(.4,0,.2,1),background .4s;}
.ls-npc-bar-neg{position:absolute;top:0;right:0;height:100%;transition:width .5s cubic-bezier(.4,0,.2,1);}
/* fields */
.ls-npc-fields{padding:6px 12px 10px;}
.ls-npc-field{width:100%;box-sizing:border-box;resize:vertical;background:transparent;border:none;border-top:1px solid rgba(255,255,255,.05);color:var(--SmartThemeBodyColor,#bbb);font-family:inherit;font-size:11px;line-height:1.55;padding:5px 0 0;min-height:32px;outline:none;opacity:.65;transition:opacity .15s;}
.ls-npc-field:focus{opacity:1;border-top-color:rgba(255,255,255,.18);}
.ls-npc-field+.ls-npc-field{margin-top:6px;}
.ls-npc-lb-toggle{display:flex;align-items:center;gap:5px;padding:4px 0 5px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;user-select:none;}
.ls-npc-lb-toggle input{cursor:pointer;accent-color:#a78bfa;}
.ls-npc-add-row{display:flex;gap:6px;margin-bottom:8px;}
.ls-npc-add-row .menu_button{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px!important;}
/* Lorebook picker */
#ls-lorebook-picker{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;margin-bottom:10px;max-height:320px;overflow-y:auto;}
.ls-lb-header{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;background:rgba(20,15,25,.95);backdrop-filter:blur(8px);z-index:2;}
.ls-lb-group{border-bottom:1px solid rgba(255,255,255,.05);}
.ls-lb-group:last-child{border-bottom:none;}
.ls-lb-group-title{font-size:10px;letter-spacing:.5px;text-transform:uppercase;opacity:.3;padding:6px 10px 4px;font-weight:600;}
.ls-lb-entry{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;gap:1px 8px;padding:7px 10px;cursor:pointer;border-top:1px solid rgba(255,255,255,.04);transition:background .12s;}
.ls-lb-entry:hover{background:rgba(255,255,255,.04);}
.ls-lb-entry-name{font-size:12px;font-weight:600;color:var(--SmartThemeBodyColor,#ddd);grid-row:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ls-lb-entry-preview{font-size:10px;opacity:.35;line-height:1.4;grid-row:2;overflow:hidden;max-height:1.5em;transition:max-height .25s;}
.ls-lb-entry.ls-lb-expanded .ls-lb-entry-preview{max-height:12em;white-space:pre-wrap;opacity:.55;}
.ls-lb-add-btn{grid-row:1/3;align-self:center;width:24px!important;height:24px!important;padding:0!important;min-width:unset!important;font-size:11px!important;opacity:.45;flex-shrink:0;}
.ls-lb-add-btn:hover:not(:disabled){opacity:1;}
.ls-lb-add-btn:disabled{opacity:.2;cursor:default;}
.ls-group-empty{font-size:12px;opacity:.3;padding:16px;text-align:center;font-style:italic;}

/* ── Sub-sections ── */
.ls-sub-acc { margin-left: 6px; }
.ls-sub-acc + .ls-sub-acc { margin-top: 1px; }
.ls-sub-acc-header { padding-left: 10px !important; font-size: 12px !important; opacity: .78; }
.ls-sub-acc-header:hover { opacity: 1; }
/* ── Gen Lorebook Picker ── */
.ls-gen-lb-entry{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-top:1px solid rgba(255,255,255,.04);transition:background .12s;}
.ls-gen-lb-entry:hover{background:rgba(255,255,255,.04);}
.ls-gen-lb-entry input[type=checkbox]{cursor:pointer;accent-color:#a78bfa;flex-shrink:0;width:13px;height:13px;}
.ls-gen-lb-info{flex:1;min-width:0;}
/* ── Source cards ── */
.ls-source-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:6px 0 4px;}
.ls-source-card{position:relative;display:flex;flex-direction:column;border:1.5px solid rgba(255,255,255,.07);border-radius:10px;padding:11px 10px 10px 12px;cursor:pointer;transition:border-color .2s,background .2s,box-shadow .2s;background:rgba(255,255,255,.02);overflow:hidden;user-select:none;}
.ls-source-card:hover{border-color:rgba(255,68,102,.22);background:rgba(255,68,102,.03);}
.ls-source-card input[type=checkbox]{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}
.ls-source-card.ls-src-active{border-color:rgba(255,68,102,.45);background:rgba(255,68,102,.05);box-shadow:0 0 14px rgba(255,68,102,.08) inset;}
.ls-source-card.ls-src-active .ls-source-icon{color:#ff4466;opacity:.9;}
.ls-source-card.ls-src-active .ls-source-check{opacity:1;transform:scale(1);}
.ls-source-card.ls-src-active .ls-source-card-title{color:#ff7a94;}
.ls-source-card-inner{display:flex;flex-direction:column;gap:3px;}
.ls-source-icon{font-size:16px;color:var(--SmartThemeBodyColor,#ccc);opacity:.25;margin-bottom:4px;transition:color .2s,opacity .2s;}
.ls-source-card-title{font-size:11px;font-weight:700;color:var(--SmartThemeBodyColor,#ddd);line-height:1.3;transition:color .2s;}
.ls-source-card-sub{font-size:10px;opacity:.35;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:13px;}
.ls-source-check{position:absolute;top:7px;right:8px;width:16px;height:16px;border-radius:50%;background:#ff4466;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;opacity:0;transform:scale(.5);transition:opacity .18s,transform .18s;}
.ls-source-card-open{border-color:rgba(255,68,102,.4)!important;background:rgba(255,68,102,.05)!important;}
.ls-source-card-open .ls-source-icon{color:#ff4466!important;opacity:.8!important;}
/* source summary bar */
.ls-source-summary{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);margin:4px 0 10px;min-height:32px;flex-wrap:wrap;}
.ls-source-summary-empty{font-size:11px;opacity:.28;font-style:italic;width:100%;text-align:center;}
.ls-src-tag{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:600;white-space:nowrap;}
.ls-src-tag-card{background:rgba(255,68,102,.1);border:1px solid rgba(255,68,102,.25);color:#ff7a94;}
.ls-src-tag-lb{background:rgba(255,157,46,.08);border:1px solid rgba(255,157,46,.22);color:#ffb566;}
.ls-src-plus{font-size:13px;opacity:.3;font-weight:300;line-height:1;}
/* ── Lorebook panel ── */
.ls-gen-lb-panel-header{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;background:rgba(12,8,18,.97);backdrop-filter:blur(10px);z-index:2;}
.ls-gen-lb-panel-title{font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;opacity:.45;display:flex;align-items:center;}
.ls-gen-lb-hbtn{padding:2px 7px!important;font-size:10px!important;opacity:.45;transition:opacity .15s;}
.ls-gen-lb-hbtn:hover{opacity:.9;}
/* lorebook entries */
.ls-gen-lb-entry{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-top:1px solid rgba(255,255,255,.04);transition:background .12s;}
.ls-gen-lb-entry:hover{background:rgba(255,255,255,.04);}
.ls-gen-lb-entry input[type=checkbox]{display:none;}
.ls-gen-lb-info{flex:1;min-width:0;}
.ls-gen-lb-checked{background:rgba(255,68,102,.05);}
.ls-gen-lb-check-icon{flex-shrink:0;width:16px;display:flex;align-items:center;justify-content:center;}
`;
  document.head.appendChild(el);
}

// ─── Построение SVG сердца ────────────────────────────────────────────────────
const HEART_P = 'M50,85 C50,85 8,58 8,32 C8,16 20,6 34,6 C43,6 49,11 50,16 C51,11 57,6 66,6 C80,6 92,16 92,32 C92,58 50,85 50,85 Z';

function buildHeartSVG(score, max, rt='neutral') {
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
    + '</svg>' + buildTipHTML(rt) + '';
}

// ─── Единый тултип для обоих сердец ──────────────────────────────────────────
function buildTipHTML(rt) {
  const rtInfo = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
  const interp = getActiveInterp();
  const descText = interp?.description?.trim() || '';
  return '<div id="ls-status-tip">'
    + '<div class="ls-tip-type" style="color:' + rtInfo.color + ';">' + escHtml(rtInfo.label) + '</div>'
    + (descText ? '<div class="ls-tip-desc">' + escHtml(descText) + '</div>' : '')
    + '</div>';
}

// ─── Построение Blur сердца ───────────────────────────────────────────────────
const BLUR_HEART_P = 'M50 88 C50 88 6 56 6 30 C6 14 18 4 32 4 C42 4 48 10 50 15 C52 10 58 4 68 4 C82 4 94 14 94 30 C94 56 50 88 50 88 Z';

function buildBlurHeart(score, max, rt='neutral') {
  const isNeg = score < 0, isHostile = rt === 'hostile';
  const shouldFlip = isNeg || isHostile;
  const color = heartColorRgba(score, max, rt);
  const rtInfo = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
  const sz = cfg().widgetSize || 64;
  const blur = Math.max(3, Math.min(7, Math.round(sz * 0.06)));
  const tr = shouldFlip ? ` transform="rotate(180,50,46)"` : '';
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

function applyWidgetSize(sz) {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.style.width = sz + 'px'; w.style.height = Math.round(sz * 0.94) + 'px';
}

function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

function updateWidgetGlow(rt, isNeg) {
  const _tc = isNeg ? [60,220,60] : _h2r((RELATION_TYPES[rt]||RELATION_TYPES.neutral).color);
  const [r,g,b] = _tc;
  document.documentElement.style.setProperty('--ls-glow',        `drop-shadow(0 4px 14px rgba(${r},${g},${b},.3))`);
  document.documentElement.style.setProperty('--ls-hover-glow',  `drop-shadow(0 6px 22px rgba(${r},${g},${b},.55))`);
}

function createWidget() {
  if (document.getElementById('ls-widget')) return;
  injectStyles();
  const d = loveData(), c = cfg();
  const w = document.createElement('div'); w.id = 'ls-widget';
  _renderWidgetContent(w);
  document.body.appendChild(w);
  const sz = c.widgetSize || 64; applyWidgetSize(sz);
  updateWidgetGlow(d.relationType||'neutral', d.score<0);
  if (c.widgetPos?.top != null) {
    const st = parseFloat(c.widgetPos.top), sl = parseFloat(c.widgetPos.left);
    w.style.top  = clamp(isNaN(st)?100:st, 8, window.innerHeight - Math.round(sz*.94) - 8) + 'px';
    w.style.left = clamp(isNaN(sl)?18:sl,  8, window.innerWidth  - sz - 8) + 'px';
    w.style.bottom = 'auto'; w.style.right = 'auto';
  }
  makeDraggable(w);
}

function _renderWidgetContent(w) {
  if (!w) return;
  const d = loveData(), c = cfg();
  const style = c.heartStyle || 'svg';
  if (style === 'blur') {
    w.innerHTML = buildBlurHeart(d.score, d.maxScore, d.relationType||'neutral');
    // blur heart manages its own glow via tip
    w.style.filter = '';
  } else {
    w.innerHTML = buildHeartSVG(d.score, d.maxScore, d.relationType||'neutral');
    updateWidgetGlow(d.relationType||'neutral', d.score<0);
  }
}

function makeDraggable(w) {
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
    w.style.left = clamp(e.clientX-grabX,8,window.innerWidth-w.offsetWidth-8)+'px'; w.style.right='auto';
    w.style.top  = clamp(e.clientY-grabY,8,window.innerHeight-w.offsetHeight-8)+'px'; w.style.bottom='auto';
    e.preventDefault();
  });
  w.addEventListener('pointerup', () => {
    if (!drag) return; drag = false;
    w.style.transition = 'filter .2s ease,transform .35s ease'; w.style.filter = '';
    if (moved) { cfg().widgetPos = { top:w.style.top, left:w.style.left }; saveSettingsDebounced(); }
  });
}

function refreshWidget() {
  const c = cfg(), w = document.getElementById('ls-widget'); if (!w) return;
  w.style.display = c.isEnabled ? 'block' : 'none';
  _renderWidgetContent(w);
}

function pulseWidget() {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.classList.remove('ls-beat','ls-flip'); void w.offsetWidth;
  w.classList.add('ls-beat');
  w.addEventListener('animationend', () => w.classList.remove('ls-beat'), { once: true });
}

function flipWidget() {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.classList.remove('ls-beat','ls-flip'); void w.offsetWidth;
  w.classList.add('ls-flip');
  w.addEventListener('animationend', () => { w.classList.remove('ls-flip'); refreshWidget(); }, { once: true });
}

// ─── Персонажи ───────────────────────────────────────────────────────────────
function getCurrentCharacterCard() {
  try { const ctx=SillyTavern?.getContext?.(); if(!ctx) return null; if(ctx.characterId!==undefined&&Array.isArray(ctx.characters)) return ctx.characters[ctx.characterId]??null; if(Array.isArray(ctx.characters)&&ctx.characters.length>0) return ctx.characters[0]; } catch {} return null;
}
function getCharacterAvatarUrl(char) {
  if(!char) return null; const av=char.avatar||(char.data&&char.data.avatar); if(!av||av==='none') return null; return '/characters/'+av;
}
function updateCharPreview(char) {
  const img=document.getElementById('ls-char-avatar'),name=document.getElementById('ls-char-avatar-name'); if(!img||!name) return;
  const url=getCharacterAvatarUrl(char);
  if(url){img.src=url;img.classList.remove('ls-avatar-hidden');img.onerror=()=>img.classList.add('ls-avatar-hidden');}
  else{img.classList.add('ls-avatar-hidden');img.src='';}
  name.textContent=char?.name||'';
}
function buildCharacterCardText(char) {
  if(!char) return ''; const parts=[],s=v=>(typeof v==='string'&&v.trim())?v.trim():null;
  if(s(char.name))        parts.push('Name: '+char.name.trim());
  if(s(char.description)) parts.push('Description:\n'+char.description.trim());
  if(s(char.personality)) parts.push('Personality:\n'+char.personality.trim());
  if(s(char.scenario))    parts.push('Scenario:\n'+char.scenario.trim());
  if(s(char.mes_example)) parts.push('Example dialogue:\n'+char.mes_example.trim());
  const d=char.data; if(d){
    if(s(d.description)&&d.description!==char.description) parts.push('Description:\n'+d.description.trim());
    if(s(d.personality)&&d.personality!==char.personality) parts.push('Personality:\n'+d.personality.trim());
    if(s(d.scenario)   &&d.scenario   !==char.scenario)    parts.push('Scenario:\n'   +d.scenario.trim());
    if(s(d.character_note)) parts.push('Creator notes:\n'+d.character_note.trim());
    if(Array.isArray(d.tags)&&d.tags.length) parts.push('Tags: '+d.tags.join(', '));
  }
  return parts.join('\n\n');
}
function getBaseUrl() { return (cfg().genEndpoint||'').trim().replace(/\/+$/,'').replace(/\/chat\/completions$/,'').replace(/\/v1$/,''); }
function getScopeFromUI() {
  const el = id => document.getElementById(id);
  return {
    changes:        el('ls-scope-changes')?.checked        ?? true,
    positiveRanges: el('ls-scope-pos-ranges')?.checked     ?? true,
    negativeRanges: el('ls-scope-neg-ranges')?.checked     ?? true,
    milestones:     el('ls-scope-milestones')?.checked     ?? true,
    suggestedMax:   el('ls-scope-max')?.checked            ?? true
  };
}

// ─── AI генерация ─────────────────────────────────────────────────────────────
async function fetchModelsForSelect() {
  const base=getBaseUrl(),apiKey=(cfg().genApiKey||'').trim();
  if(!base||!apiKey){toast('warning','Укажи Endpoint и API Key');return [];}
  const resp=await fetch(base+'/v1/models',{method:'GET',headers:{'Authorization':'Bearer '+apiKey}});
  if(!resp.ok) throw new Error('HTTP '+resp.status);
  const data=await resp.json();
  return (data.data||data.models||[]).map(m=>(typeof m==='string'?m:m.id)).filter(Boolean).sort();
}

async function onRefreshModels() {
  const btn=document.getElementById('ls-refresh-models'),sel=document.getElementById('ls-gen-model-select');
  if(!btn||!sel) return; btn.classList.add('ls-loading');
  try {
    const models=await fetchModelsForSelect(),current=cfg().genModel;
    sel.innerHTML='<option value="">-- выбери модель --</option>';
    models.forEach(id=>{ const opt=document.createElement('option'); opt.value=id; opt.textContent=id; if(id===current) opt.selected=true; sel.appendChild(opt); });
    if(!models.length) toast('warning','Список моделей пуст'); else toast('success','Загружено: '+models.length);
  } catch(e){ toast('error','Ошибка: '+e.message); } finally { btn.classList.remove('ls-loading'); }
}

async function generateLoveScoreWithAI(charCard, scope, chatHistory='') {
  const c=cfg(),base=getBaseUrl(),apiKey=(c.genApiKey||'').trim(),model=(c.genModel||'').trim()||'gpt-4o';
  if(!base)   throw new Error('Укажи Endpoint');
  if(!apiKey) throw new Error('Укажи API Key');
  const d=loveData(),maxScore=d.maxScore||100;
  const lang=c.genLang||'ru',langLabel=lang==='ru'?'Russian':'English';
  const userNotes=(c.genUserNotes||'').trim();
  const systemMsg='You are configuring a Love Score system for a text-based RPG. Reply with ONLY valid JSON — no explanations, no markdown, no code blocks.';
  const wantChanges=scope.changes, wantPosRange=scope.positiveRanges, wantNegRange=scope.negativeRanges, wantMs=scope.milestones, wantMax=scope.suggestedMax;
  let schemaLines=['{'];
  if(wantMax)                        schemaLines.push('  "suggestedMax": '+maxScore+',');
  if(wantChanges)                    schemaLines.push('  "changes": [{"delta": 2, "text": "..."},{"delta": -10, "text": "..."}],');
  if(wantPosRange||wantNegRange) {
    const ex=[];
    if(wantNegRange) ex.push('{"min": -100, "max": -1, "text": "..."}');
    if(wantPosRange) ex.push('{"min": 0, "max": 20, "text": "..."}');
    schemaLines.push('  "ranges": ['+ex.join(',')+'],');
  }
  if(wantMs) schemaLines.push('  "milestones": [{"threshold": 15, "text": "..."}]');
  schemaLines.push('}');
  let rulesLines=['RULES:'];
  if(wantChanges)  rulesLines.push('- changes: at least 6 items with varied positive and negative deltas');
  if(wantNegRange) rulesLines.push('- negative ranges (min:'+MIN_SCORE+' to max:-1): describe hostility, hatred, fear — no gaps');
  if(wantPosRange) rulesLines.push('- positive ranges (min:0 to max:'+maxScore+'): describe attraction and love — no gaps');
  if(wantMs)       rulesLines.push('- milestones: at least 5 POSITIVE thresholds only, ordered ascending');
  if(wantMax)      rulesLines.push('- suggestedMax: suggest higher max (200-300) for cold/distant characters');
  rulesLines.push('- All text in '+langLabel);
  if(userNotes)    rulesLines.push('','SPECIAL USER INSTRUCTIONS (priority):', userNotes);
  const omitNote = (!wantChanges||!wantPosRange||!wantNegRange||!wantMs) ? 'NOTE: Only generate the fields listed in the schema.' : '';
  const hasHistory=chatHistory.trim().length>0;
  const userMsg=[
    hasHistory?'Analyze the character card AND the real chat history to generate accurate love score rules.':'Analyze the character card and generate love score rules.',
    'Score range: '+MIN_SCORE+' to '+maxScore+'. Negative = hostility/hatred. Positive = love/affection.',
    '','CHARACTER CARD:',charCard,'',
    ...(hasHistory?['RECENT CHAT HISTORY (use this to ground all descriptions in the real dynamic):',chatHistory,'']:[]),
    ...(hasHistory?['IMPORTANT: Base all change descriptions, ranges and milestones on what actually happens in this chat.']:[]),
    omitNote,
    'Reply with STRICTLY valid JSON matching this schema exactly:',...schemaLines,'',
    ...rulesLines
  ].filter(Boolean).join('\n');
  const resp=await fetch(base+'/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
    body:JSON.stringify({model,messages:[{role:'system',content:systemMsg},{role:'user',content:userMsg}],temperature:0.7,max_tokens:2800})
  });
  if(!resp.ok){const t=await resp.text();throw new Error('HTTP '+resp.status+': '+t.slice(0,300));}
  const result=await resp.json();
  const text=result?.choices?.[0]?.message?.content??'';
  if(!text.trim()) throw new Error('ИИ вернул пустой ответ');
  return text;
}

function parseAIResponse(raw) {
  try {
    let cleaned=raw.replace(/^```[\w]*\n?/gm,'').replace(/```$/gm,'').trim();
    const _js=cleaned.indexOf('{'),_je=cleaned.lastIndexOf('}');
    if(_js!==-1&&_je>_js) cleaned=cleaned.slice(_js,_je+1);
    const p=JSON.parse(cleaned);
    const changes   =(p.changes   ||[]).filter(x=>typeof x.delta==='number'&&x.text).map(x=>({delta:x.delta,description:String(x.text).trim()}));
    const ranges    =(p.ranges    ||[]).filter(x=>typeof x.min==='number'&&typeof x.max==='number'&&x.text).map(x=>({min:x.min,max:x.max,description:String(x.text).trim()}));
    const milestones=(p.milestones||[]).filter(x=>typeof x.threshold==='number'&&x.text).sort((a,b)=>a.threshold-b.threshold).map(x=>({threshold:x.threshold,description:String(x.text).trim(),done:false}));
    return {changes,ranges,milestones,suggestedMax:p.suggestedMax||null,ok:true};
  } catch { return {changes:[],ranges:[],milestones:[],suggestedMax:null,ok:false}; }
}

function getChatHistory(n) {
  try {
    const ctx=SillyTavern?.getContext?.();
    if(!ctx?.chat?.length) return '';
    const msgs=n>0?ctx.chat.slice(-n):ctx.chat;
    const charName=getCurrentCharacterCard()?.name||'Персонаж';
    return msgs.map(m=>{ const who=m.is_user?'Игрок':charName; return who+': '+(m.mes||'').trim().slice(0,500); }).join('\n\n');
  } catch{return '';}
}

// ─── AI-анализ отношений ──────────────────────────────────────────────────────
async function analyzeWithAI(charCard,chatHistory) {
  const c=cfg(),base=getBaseUrl(),apiKey=(c.genApiKey||'').trim(),model=(c.genModel||'').trim()||'gpt-4o';
  if(!base) throw new Error('Не указан Endpoint');
  if(!apiKey) throw new Error('Не указан API Key');
  const d=loveData(),lang=c.genLang==='ru';
  const systemMsg='You are an expert analyst for a text-based RPG relationship tracker. Reply ONLY with valid JSON, no markdown.';
  const userMsg=[
    'Analyze the relationship between the player and the character based on the chat history.',
    'Current love score: '+d.score+' (range: '+MIN_SCORE+' to '+d.maxScore+'). Negative=hostility, positive=affection.',
    '','CHARACTER CARD:',charCard,'','RECENT CHAT HISTORY:',chatHistory,'',
    'Reply in '+(lang?'Russian':'English')+' with STRICTLY valid JSON:',
    '{"suggestedScore":<integer>,"relationType":"<one of: romance|friendship|family|obsession|rival|platonic>","analysis":"<2-3 sentences>","reasoning":"<why this score>"}',
    'RULES: suggestedScore must be integer between '+MIN_SCORE+' and '+d.maxScore+'.',
  ].join('\n');
  const resp=await fetch(base+'/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
    body:JSON.stringify({model,messages:[{role:'system',content:systemMsg},{role:'user',content:userMsg}],temperature:0.5,max_tokens:600})
  });
  if(!resp.ok){const t=await resp.text();throw new Error('HTTP '+resp.status+': '+t.slice(0,200));}
  const result=await resp.json();
  const text=result?.choices?.[0]?.message?.content??'';
  if(!text.trim()) throw new Error('Пустой ответ от AI');
  return text;
}

function parseAnalyzeResponse(raw) {
  try {
    const cleaned=raw.replace(/```json\n?/gm,'').replace(/```\n?/gm,'').trim();
    const p=JSON.parse(cleaned);
    const validRT=Object.keys(RELATION_TYPES);
    return {suggestedScore:typeof p.suggestedScore==='number'?Math.round(p.suggestedScore):null,relationType:validRT.includes(p.relationType)?p.relationType:null,analysis:String(p.analysis||''),reasoning:String(p.reasoning||''),ok:true};
  } catch{return {suggestedScore:null,analysis:'',reasoning:'',ok:false};}
}

// ─── Авто-регенерация правил ──────────────────────────────────────────────────
async function autoRegenAll() {
  const c=cfg();
  const base=getBaseUrl(),apiKey=(c.genApiKey||'').trim();
  if(!base||!apiKey) return;

  const allScope={changes:true,positiveRanges:true,negativeRanges:true,milestones:true,suggestedMax:true};
  const msgN=Math.max(0,parseInt(c.chatAnalysisMsgCount??20));
  const history=msgN>0?getChatHistory(msgN):'';

  const useCard = c.genUseCard !== false;
  const lbText  = getLorebookTextForGen();
  const hasLb   = lbText.trim().length > 0;

  if (!useCard && !hasLb) return; // нет источника — пропускаем

  let cardText = '';
  if (useCard) {
    const char = getCurrentCharacterCard();
    if (char) { const ct = buildCharacterCardText(char); if (ct.trim()) cardText += ct; }
  }
  if (hasLb) {
    if (cardText.trim()) cardText += '\n\n═══ LOREBOOK ═══\n\n';
    cardText += lbText;
  }
  if (!cardText.trim()) return;

  showAutoRegenStatus('⏳ Авто-обновление правил...');

  try {
    autoSnapshot('Авто-реген');
    const raw=await generateLoveScoreWithAI(cardText,allScope,history);
    const parsed=parseAIResponse(raw);
    if(!parsed.ok) { showAutoRegenStatus('⚠️ Не удалось обновить правила'); return; }
    const d=loveData();
    if(parsed.changes.length)     d.scoreChanges=parsed.changes;
    if(parsed.ranges.length)      d.scaleInterpretations=parsed.ranges;
    if(parsed.milestones.length)  d.milestones=parsed.milestones;
    if(parsed.suggestedMax&&parsed.suggestedMax!==d.maxScore){ d.maxScore=parsed.suggestedMax; c.maxScore=parsed.suggestedMax; }
    saveSettingsDebounced(); updatePromptInjection(); syncUI();
    const srcParts = [];
    if (useCard && cardText.trim()) { try { srcParts.push(getCurrentCharacterCard()?.name||'персонаж'); } catch{} }
    if (hasLb) srcParts.push(_getValidLbIds().length+' запис. лорбука');
    showAutoRegenStatus('✅ Правила обновлены: '+escHtml(srcParts.join(' + ')));
    toast('info','💫 Авто-реген: правила обновлены');
  } catch(e) {
    showAutoRegenStatus('⚠️ Ошибка авто-регена: '+e.message);
  }
}

function showAutoRegenStatus(text) {
  const box=document.getElementById('ls-autosuggest-result'); if(!box) return;
  box.style.display='block';
  box.innerHTML='<div class="ls-as-title"><i class="fa-solid fa-rotate"></i>&nbsp;Авто-регенерация <button id="ls-as-close" class="menu_button ls-del-btn" style="float:right">✕</button></div>'
    +'<div style="font-size:12px;line-height:1.6;">'+text+'</div>';
  document.getElementById('ls-as-close')?.addEventListener('click',()=>{ box.style.display='none'; });
}

async function onAnalyzeClick() {
  const btn=document.getElementById('ls-analyze-btn'),status=document.getElementById('ls-analyze-status'),result=document.getElementById('ls-analyze-result');
  if(!btn||!status) return;
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Анализирую...';
  status.textContent='Запрос к API...'; if(result) result.style.display='none';
  try {
    const useCard = cfg().genUseCard !== false;
    const lbText  = getLorebookTextForGen();
    const hasLb   = lbText.trim().length > 0;

    if (!useCard && !hasLb) { status.textContent='Выбери хотя бы один источник (карточка или лорбук).'; return; }

    let cardText = '';
    if (useCard) {
      const char = getCurrentCharacterCard();
      if (char) { const ct = buildCharacterCardText(char); if (ct.trim()) cardText += ct; }
    }
    if (hasLb) {
      if (cardText.trim()) cardText += '\n\n═══ LOREBOOK ═══\n\n';
      cardText += lbText;
    }
    if (!cardText.trim()) { status.textContent='Нет данных для анализа.'; return; }

    const n=parseInt(cfg().chatAnalysisMsgCount??20);
    const history=getChatHistory(n); if(!history.trim()){status.textContent='Нет сообщений в чате.';return;}
    status.textContent='Анализирую '+n+' сообщений...';
    const raw=await analyzeWithAI(cardText,history);
    const parsed=parseAnalyzeResponse(raw);
    if(!parsed.ok||parsed.suggestedScore===null){status.textContent=raw.slice(0,150);return;}
    status.textContent='';
    if(result){
      const d=loveData(),diff=parsed.suggestedScore-d.score,diffStr=diff>0?'+'+diff:String(diff);
      const _rtInfo=parsed.relationType?RELATION_TYPES[parsed.relationType]:null;
      result.style.display='block';
      result.innerHTML=
        '<div class="ls-analyze-score">Рекомендуемый счёт: <strong>'+parsed.suggestedScore+'</strong>'
        +'<span style="opacity:.5;font-size:11px;margin-left:6px">(сейчас '+d.score+', '+(diff!==0?diffStr:'без изменений')+')</span></div>'
        +(_rtInfo?'<div class="ls-analyze-reltype">'
          +'<span style="color:'+_rtInfo.color+';font-size:18px;">&#10084;</span>'
          +'<span style="font-size:12px;margin-left:6px;opacity:.8;">'+escHtml(_rtInfo.label)+'</span>'
          +'<button class="menu_button" data-rt="'+parsed.relationType+'" id="ls-rt-confirm-btn" style="margin-left:8px;padding:2px 8px;font-size:11px;">Применить тип</button>'
          +'</div>':'')
        +(parsed.analysis?'<div class="ls-analyze-text">'+escHtml(parsed.analysis)+'</div>':'')
        +(parsed.reasoning?'<div class="ls-analyze-reason">'+escHtml(parsed.reasoning)+'</div>':'')
        +'<button id="ls-analyze-apply" class="menu_button" style="margin-top:8px;width:100%"><i class="fa-solid fa-check"></i> Применить счёт '+parsed.suggestedScore+'</button>';
      document.getElementById('ls-rt-confirm-btn')?.addEventListener('click',function(){
        loveData().relationType=this.dataset.rt||'neutral';
        saveSettingsDebounced();syncUI();pulseWidget();
        toast('success','Тип: '+(RELATION_TYPES[this.dataset.rt]?.label||''));
      });
      document.getElementById('ls-analyze-apply')?.addEventListener('click',()=>{
        const d=loveData(),prev=d.score;
        d.score=Math.max(MIN_SCORE,Math.min(parsed.suggestedScore,d.maxScore));
        const delta=d.score-prev; if(delta!==0) addToLog(d,delta,'AI анализ чата');
        saveSettingsDebounced();updatePromptInjection();syncUI();pulseWidget();renderScoreLog();
        toast('success','Счёт установлен: '+d.score);
      });
    }
    toast('success','Анализ готов → '+parsed.suggestedScore);
  } catch(e){ status.textContent=e.message; toast('error',e.message); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-chart-line"></i> Анализировать чат'; }
}

// ─── Лорбук-пикер для AI генерации ───────────────────────────────────────────
function renderGenLorebookPicker() {
  const ct = document.getElementById('ls-gen-lb-list'); if (!ct) return;
  const entries = getLorebooks();
  const selected = new Set(cfg().genLorebookEntryIds || []);

  if (!entries.length) {
    ct.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 12px;opacity:.35;text-align:center;">
      <i class="fa-solid fa-book-open" style="font-size:22px;"></i>
      <div style="font-size:11px;font-style:italic;line-height:1.5;">Нет записей — подключи лорбук к персонажу</div>
    </div>`;
    return;
  }

  // Группируем по источнику
  const groups = {};
  entries.forEach(e => { (groups[e.source] || (groups[e.source] = [])).push(e); });

  ct.innerHTML = Object.entries(groups).map(([src, ents]) => {
    const srcLabel = src === 'embedded' ? 'Встроенный лорбук' : src;
    const allChecked = ents.every(e => selected.has(e.id));
    return `<div class="ls-lb-group">
      <div class="ls-lb-group-title" style="display:flex;align-items:center;gap:0;">
        <i class="fa-solid fa-layer-group" style="margin-right:5px;font-size:9px;opacity:.4;"></i>${escHtml(srcLabel)}
        <div style="margin-left:auto;display:flex;gap:3px;">
          <button class="menu_button ls-gen-lb-sel-all ls-gen-lb-hbtn" data-src="${escHtml(src)}" title="Выбрать все в группе" style="${allChecked?'opacity:.3;':''}"><i class="fa-solid fa-check-double"></i></button>
          <button class="menu_button ls-gen-lb-sel-none ls-gen-lb-hbtn ls-del-btn" data-src="${escHtml(src)}" title="Снять все в группе"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      ${ents.map(e => {
        const isChecked = selected.has(e.id);
        const preview = (e.content || '').slice(0, 80).replace(/\n/g,' ');
        return `<label class="ls-gen-lb-entry${isChecked?' ls-gen-lb-checked':''}" title="${escHtml((e.keys||[]).join(', '))}">
          <input type="checkbox" class="ls-gen-lb-cb" data-lbid="${escHtml(e.id)}" data-src="${escHtml(src)}"${isChecked?' checked':''}>
          <div class="ls-gen-lb-check-icon"><i class="fa-solid fa-${isChecked?'square-check':'square'}" style="color:${isChecked?'#ff4466':'rgba(255,255,255,.15)'};font-size:13px;"></i></div>
          <div class="ls-gen-lb-info">
            <div style="font-size:11px;font-weight:600;color:var(--SmartThemeBodyColor,#ddd);display:flex;align-items:center;gap:4px;">
              <i class="fa-solid fa-feather-pointed" style="font-size:9px;opacity:.35;"></i>${escHtml(e.label)}
            </div>
            ${preview?`<div style="font-size:10px;opacity:.3;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-top:1px;">${escHtml(preview)}${(e.content||'').length>80?'…':''}</div>`:''}
          </div>
        </label>`;
      }).join('')}
    </div>`;
  }).join('');

  _updateGenLbCounter();

  // Чекбоксы
  $(ct).off('change', '.ls-gen-lb-cb').on('change', '.ls-gen-lb-cb', function () {
    const id = this.dataset.lbid;
    const ids = new Set(cfg().genLorebookEntryIds || []);
    if (this.checked) ids.add(id); else ids.delete(id);
    cfg().genLorebookEntryIds = [...ids];
    saveSettingsDebounced();
    _updateGenLbCounter();
    // обновить иконку чекбокса без полного ре-рендера
    const icon = this.closest('.ls-gen-lb-entry')?.querySelector('.ls-gen-lb-check-icon i');
    if (icon) {
      icon.className = `fa-solid fa-${this.checked?'square-check':'square'}`;
      icon.style.color = this.checked ? '#ff4466' : 'rgba(255,255,255,.15)';
    }
    this.closest('.ls-gen-lb-entry')?.classList.toggle('ls-gen-lb-checked', this.checked);
  });

  // Выбрать все / ничего в группе
  $(ct).off('click', '.ls-gen-lb-sel-all').on('click', '.ls-gen-lb-sel-all', function (ev) {
    ev.preventDefault();
    const src = this.dataset.src;
    const ids = new Set(cfg().genLorebookEntryIds || []);
    ct.querySelectorAll(`.ls-gen-lb-cb[data-src="${src}"]`).forEach(cb => { ids.add(cb.dataset.lbid); cb.checked = true; });
    cfg().genLorebookEntryIds = [...ids]; saveSettingsDebounced(); renderGenLorebookPicker();
  });
  $(ct).off('click', '.ls-gen-lb-sel-none').on('click', '.ls-gen-lb-sel-none', function (ev) {
    ev.preventDefault();
    const src = this.dataset.src;
    const ids = new Set(cfg().genLorebookEntryIds || []);
    ct.querySelectorAll(`.ls-gen-lb-cb[data-src="${src}"]`).forEach(cb => { ids.delete(cb.dataset.lbid); cb.checked = false; });
    cfg().genLorebookEntryIds = [...ids]; saveSettingsDebounced(); renderGenLorebookPicker();
  });
}

function _getValidLbIds() {
  const saved = cfg().genLorebookEntryIds || [];
  if (!saved.length) return [];
  try {
    const available = new Set(getLorebooks().map(e => e.id));
    return saved.filter(id => available.has(id));
  } catch { return saved; }
}

function _updateGenLbCounter() {
  const ids = _getValidLbIds();
  const lbl = document.getElementById('ls-gen-lb-count');
  if (lbl) lbl.textContent = ids.length ? `${ids.length} ${ids.length===1?'запись':ids.length<5?'записи':'записей'} выбрано` : '';

  const lbCard = document.getElementById('ls-src-lb-label');
  const lbCb   = document.getElementById('ls-gen-use-lb');
  if (lbCard && lbCb) {
    lbCard.classList.toggle('ls-src-active', ids.length > 0);
    lbCb.checked = ids.length > 0;
  }
  _syncSourceCards();
}

function _syncSourceCards() {
  const useCard = document.getElementById('ls-gen-use-card');
  const cardLbl = document.getElementById('ls-src-card-label');
  if (useCard && cardLbl) cardLbl.classList.toggle('ls-src-active', useCard.checked);

  const ids = _getValidLbIds();
  const lbLbl = document.getElementById('ls-src-lb-label');
  if (lbLbl) lbLbl.classList.toggle('ls-src-active', ids.length > 0);

  // Имя персонажа в подписи карточки
  const nameEl = document.getElementById('ls-src-card-name');
  if (nameEl) {
    try { const ch = getCurrentCharacterCard(); nameEl.textContent = ch?.name || '—'; } catch { nameEl.textContent = '—'; }
  }

  // Подсказка на лорбук-карточке
  const lbSub = document.getElementById('ls-src-lb-sub');
  if (lbSub) {
    if (ids.length > 0) lbSub.textContent = `${ids.length} ${ids.length===1?'запись':ids.length<5?'записи':'записей'}`;
    else lbSub.textContent = '—';
  }

  // Строка активных источников
  const summary = document.getElementById('ls-source-summary');
  if (summary) {
    const cardOn = useCard?.checked;
    const lbOn   = ids.length > 0;
    if (!cardOn && !lbOn) {
      summary.innerHTML = '<span class="ls-source-summary-empty"><i class="fa-solid fa-triangle-exclamation" style="margin-right:5px;color:#f59e0b;opacity:.7;"></i>Выбери хотя бы один источник</span>';
    } else {
      let parts = [];
      if (cardOn) {
        try { const ch = getCurrentCharacterCard(); parts.push(`<span class="ls-src-tag ls-src-tag-card"><i class="fa-solid fa-address-card"></i>${escHtml(ch?.name||'Карточка')}</span>`); }
        catch { parts.push(`<span class="ls-src-tag ls-src-tag-card"><i class="fa-solid fa-address-card"></i>Карточка</span>`); }
      }
      if (lbOn) parts.push(`<span class="ls-src-tag ls-src-tag-lb"><i class="fa-solid fa-book-bookmark"></i>${ids.length} ${ids.length===1?'запись':ids.length<5?'записи':'записей'}</span>`);
      summary.innerHTML = parts.length === 2
        ? parts[0] + '<span class="ls-src-plus">+</span>' + parts[1]
        : parts[0];
    }
  }
}

function getLorebookTextForGen() {
  const ids = _getValidLbIds();
  if (!ids.length) return '';
  const entries = getLorebooks();
  const selected = entries.filter(e => ids.includes(e.id));
  if (!selected.length) return '';
  return selected.map(e => `[${e.label}]\n${e.content || ''}`).join('\n\n---\n\n');
}

async function onGenerateClick() {
  const btn=document.getElementById('ls-gen-btn'),status=document.getElementById('ls-gen-status');
  if(!btn||!status) return;
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Генерирую...'; status.textContent='Обращаюсь к API...';
  try {
    const scope=getScopeFromUI();
    if(!scope.changes&&!scope.positiveRanges&&!scope.negativeRanges&&!scope.milestones){ status.textContent='Выбери хотя бы одну секцию.'; return; }
    autoSnapshot('До генерации');

    const useCard = cfg().genUseCard !== false;
    const lbText  = getLorebookTextForGen();
    const hasLb   = lbText.trim().length > 0;

    if (!useCard && !hasLb) { status.textContent='Выбери хотя бы один источник (карточка или лорбук).'; return; }

    let cardText = '';
    let sourceNames = [];

    if (useCard) {
      const char = getCurrentCharacterCard();
      if (char) {
        const ct = buildCharacterCardText(char);
        if (ct.trim()) { cardText += ct; sourceNames.push(char.name || 'персонаж'); }
      }
    }

    if (hasLb) {
      if (cardText.trim()) cardText += '\n\n═══ LOREBOOK ═══\n\n';
      cardText += lbText;
      sourceNames.push(_getValidLbIds().length + ' запис. лорбука');
    }

    if (!cardText.trim()) { status.textContent='Нет данных для генерации.'; return; }

    const _genMsgN=parseInt(cfg().chatAnalysisMsgCount??0);
    const _genHistory=_genMsgN>0?getChatHistory(_genMsgN):'';
    status.textContent=_genHistory?'Читаю '+_genMsgN+' сообщ. + источник...':'Читаю источник...';
    const raw=await generateLoveScoreWithAI(cardText,scope,_genHistory),parsed=parseAIResponse(raw);
    if(!parsed.ok){status.textContent='Ошибка разбора: '+raw.slice(0,120);return;}
    const d=loveData();
    if(parsed.changes.length>0&&scope.changes)                          d.scoreChanges=parsed.changes;
    if(parsed.ranges.length>0&&(scope.positiveRanges||scope.negativeRanges)) {
      if(scope.positiveRanges&&scope.negativeRanges) d.scaleInterpretations=parsed.ranges;
      else if(scope.positiveRanges) d.scaleInterpretations=[...d.scaleInterpretations.filter(x=>x.max<0),...parsed.ranges.filter(x=>x.min>=0)];
      else d.scaleInterpretations=[...parsed.ranges.filter(x=>x.max<0),...d.scaleInterpretations.filter(x=>x.min>=0)];
    }
    if(parsed.milestones?.length>0&&scope.milestones) d.milestones=parsed.milestones;
    if(parsed.suggestedMax&&scope.suggestedMax&&parsed.suggestedMax!==d.maxScore){ d.maxScore=parsed.suggestedMax; cfg().maxScore=parsed.suggestedMax; toast('info','Максимум изменён на '+parsed.suggestedMax); }
    saveSettingsDebounced(); updatePromptInjection(); syncUI();
    status.textContent='Готово. Правил: '+parsed.changes.length+', диапазонов: '+parsed.ranges.length+', событий: '+parsed.milestones.length;
    toast('success','Сгенерировано: '+sourceNames.join(' + '));
  } catch(e){ status.textContent='Ошибка: '+(e.message||e); toast('error',e.message||e); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать'; }
}

// ─── Score Log ───────────────────────────────────────────────────────────────
function renderScoreLog() {
  const ct=document.getElementById('ls-score-log'); if(!ct) return;
  const log=(loveData().scoreLog||[]);
  if(!log.length){ct.innerHTML='<div style="font-size:11px;opacity:.3;padding:5px 6px;">Пока пусто</div>';return;}
  ct.innerHTML=log.map(e=>{
    const pos=e.delta>0,neg=e.delta<0;
    const dc=pos?'#6ee86e':neg?'#ff6b6b':'#b0b0b0',bg=pos?'rgba(80,200,80,.06)':neg?'rgba(220,60,60,.06)':'rgba(180,180,180,.03)';
    const arr=pos?'↑':neg?'↓':'→',sig=e.sign||(e.delta>=0?'+'+e.delta:String(e.delta));
    return '<div class="ls-log-entry" style="background:'+bg+';">'
      +'<span class="ls-log-delta" style="color:'+dc+';">'+arr+'&thinsp;'+escHtml(sig)+'</span>'
      +((e.reason||'').trim()
        ?'<span class="ls-log-reason">'+escHtml(e.reason)+'</span>'
        :'<span style="font-size:11px;opacity:.25;font-style:italic;">—</span>')
      +'</div>';
  }).join('');
}

// ─── Пресеты UI ──────────────────────────────────────────────────────────────
function renderPresets() {
  const ct=document.getElementById('ls-preset-list'); if(!ct) return;
  const presets=cfg().presets||[];
  if(!presets.length){ct.innerHTML='<div style="font-size:11px;opacity:.3;padding:5px;">Нет сохранённых пресетов</div>';return;}
  ct.innerHTML=[...presets].reverse().map(p=>{
    const isSnap=p.name.startsWith('🔄');
    return '<div class="ls-preset-row'+(isSnap?' ls-preset-snap':'')+'">'
      +'<div class="ls-preset-info"><div class="ls-preset-name">'+escHtml(p.name)+'</div><div class="ls-preset-meta">'+escHtml(p.createdAt||'')+(p.maxScore?' · макс '+p.maxScore:'')+'</div></div>'
      +'<div class="ls-preset-actions">'
      +'<button class="menu_button ls-preset-btn ls-preset-load" data-id="'+p.id+'">Загрузить</button>'
      +'<button class="menu_button ls-preset-btn ls-preset-export" data-id="'+p.id+'">JSON</button>'
      +'<button class="menu_button ls-preset-btn ls-del-btn ls-preset-del" data-id="'+p.id+'">✕</button>'
      +'</div></div>';
  }).join('');
  $(ct).off('click','.ls-preset-load').on('click','.ls-preset-load',function(){
    const id=$(this).data('id'),p=(cfg().presets||[]).find(x=>x.id===String(id)); if(p) loadPresetUI(p);
  });
  $(ct).off('click','.ls-preset-export').on('click','.ls-preset-export',function(){
    const id=$(this).data('id'),p=(cfg().presets||[]).find(x=>x.id===String(id)); if(p) exportPresetJSON(p);
  });
  $(ct).off('click','.ls-preset-del').on('click','.ls-preset-del',function(){ deletePreset(String($(this).data('id'))); });
}

// ─── Окружение (группа NPC) ──────────────────────────────────────────────────
function mkNpc(overrides={}) {
  return {
    id: Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    name: 'NPC',
    nameEn: '',
    relationType: 'neutral',
    score: 0,
    maxScore: 100,
    avatarUrl: '',
    description: '',
    ...overrides
  };
}

// NPC хранятся PER-CHAT внутри chatLoveData
function groupNpcs() {
  const d=chatLoveData(); if(!d.groupNpcs) d.groupNpcs=[]; return d.groupNpcs;
}

function saveGroupNpcs() {
  saveSettingsDebounced(); updatePromptInjection();
}


function renderGroupNpcs() {
  const ct=document.getElementById('ls-group-list'); if(!ct) return;
  const npcs=groupNpcs();
  if(!npcs.length){
    ct.innerHTML='<div class="ls-group-empty"><i class="fa-solid fa-user-slash" style="margin-right:6px;"></i>Окружение пустое</div>';
    return;
  }
  ct.innerHTML=npcs.map(npc=>{
    const rt=RELATION_TYPES[npc.relationType||'neutral']||RELATION_TYPES.neutral;
    const [r,g,b]=_h2r(rt.color);
    const scoreColor=npc.score<0?'#4ec900':rt.color;

    const avInner=npc.avatarUrl
      ?`<img class="ls-npc-av-img" src="${escHtml(npc.avatarUrl)}" alt="" onerror="this.outerHTML='<div class=\\'ls-npc-av-ph\\'><i class=\\'fa-solid fa-user\\'></i></div>'">`
      :`<div class="ls-npc-av-ph"><i class="fa-solid fa-user"></i></div>`;

    const rtBtns=Object.entries(RELATION_TYPES).map(([k,v])=>{
      const isHostile=k==='hostile';
      const svg=`<svg viewBox="0 0 16 13" width="12" height="10" style="display:block;fill:currentColor;${isHostile?'transform:rotate(180deg);':''}"><path d="M8,12 C8,12 1,7.5 1,3.5 C1,1.5 2.5,0.5 4,0.5 C6,0.5 7.5,1.8 8,3 C8.5,1.8 10,0.5 12,0.5 C13.5,0.5 15,1.5 15,3.5 C15,7.5 8,12 8,12Z"/></svg>`;
      return `<span class="ls-npc-rt-btn ls-rt-${k}${npc.relationType===k?' ls-rt-active':''}" data-nid="${npc.id}" data-rt="${k}" title="${v.label}" style="color:${v.color}">${svg}</span>`;
    }).join('');

    // Полоса
    let barHTML;
    const isNeg=npc.score<0;
    const barBaseColor=isNeg?'#4ec900':rt.color;
    const barDeepColor=isNeg?'#1a5500':rt.deep;
    const [br,bg,bb]=_h2r(barBaseColor);
    const [dr,dg,db]=_h2r(barDeepColor);
    if(!isNeg){
      const pct=Math.max(0,Math.min(100,(npc.score/Math.max(1,npc.maxScore))*100)).toFixed(1);
      barHTML=`<div class="ls-npc-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(${br},${bg},${bb},.12) 0%,rgba(${br},${bg},${bb},.82) 65%,rgba(${dr},${dg},${db},1) 100%);box-shadow:0 0 6px rgba(${br},${bg},${bb},.4);"></div>`;
    } else {
      const pct=Math.max(0,Math.min(100,(Math.abs(npc.score)/100)*100)).toFixed(1);
      barHTML=`<div class="ls-npc-bar-neg" style="width:${pct}%;background:linear-gradient(270deg,rgba(${br},${bg},${bb},.12) 0%,rgba(${br},${bg},${bb},.82) 65%,rgba(${dr},${dg},${db},1) 100%);box-shadow:0 0 6px rgba(${br},${bg},${bb},.4);"></div>`;
    }

    return `<div class="ls-npc-card" data-nid="${npc.id}" style="border-color:rgba(${r},${g},${b},.15);">
      <div class="ls-npc-top">
        <div class="ls-npc-av-wrap ls-npc-av-click" data-nid="${npc.id}" title="Нажми чтобы сменить аватар" style="border-color:rgba(${r},${g},${b},.35);">
          ${avInner}
          <div class="ls-npc-av-overlay"><i class="fa-solid fa-camera"></i></div>
        </div>
        <div class="ls-npc-body">
          <div class="ls-npc-names">
            <input class="ls-npc-name" type="text" value="${escHtml(npc.name)}" data-nid="${npc.id}" placeholder="Имя...">
            <input class="ls-npc-name-en" type="text" value="${escHtml(npc.nameEn||npc.name)}" data-nid="${npc.id}" placeholder="EN name" title="Имя для инжекта в промпт (англ.)">
          </div>
          <div class="ls-npc-meta">
            <div class="ls-npc-rt-row">${rtBtns}</div>
            <span class="ls-npc-rt-label" style="color:${rt.color};">${escHtml(rt.label)}</span>
            <span class="ls-npc-sep">·</span>
            <div class="ls-npc-score-row">
              <button class="menu_button ls-npc-adj-btn ls-npc-dec" data-nid="${npc.id}"><i class="fa-solid fa-minus"></i></button>
              <span class="ls-npc-score-val" style="color:${scoreColor};">${npc.score}</span>
              <span class="ls-npc-score-sep">/</span>
              <input class="ls-npc-score-max" type="number" value="${npc.maxScore}" data-nid="${npc.id}" min="1" max="999" title="Макс. очки">
              <button class="menu_button ls-npc-adj-btn ls-npc-inc" data-nid="${npc.id}"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
        </div>
        <button class="menu_button ls-npc-del-btn" data-nid="${npc.id}" title="Убрать из окружения"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="ls-npc-bar-wrap">${barHTML}</div>
      <div class="ls-npc-fields">
        ${npc.fromLorebook ? `<label class="ls-npc-lb-toggle" title="Описание уже есть в лорбуке — повторный инжект не нужен">
          <input type="checkbox" class="ls-npc-skip-desc" data-nid="${npc.id}" ${npc.skipDescInject?'checked':''}>
          <span style="font-size:10px;opacity:.55;"><i class="fa-solid fa-book" style="margin-right:3px;color:#a78bfa;"></i>Описание из лорбука — не дублировать в промпт</span>
        </label>` : ''}
        <textarea class="ls-npc-field ls-npc-desc" data-nid="${npc.id}" rows="2" placeholder="Описание / характер для промпта…" ${npc.skipDescInject?'style="opacity:.3;pointer-events:none;"':''}>${escHtml(npc.description||'')}</textarea>
      </div>
    </div>`;
  }).join('');
  bindGroupNpcEvents();
}

function bindGroupNpcEvents() {
  const ct=document.getElementById('ls-group-list'); if(!ct) return;
  const save=()=>saveGroupNpcs();
  const npc=id=>groupNpcs().find(n=>n.id===id);

  $(ct).off('input','.ls-npc-name').on('input','.ls-npc-name',function(){
    const n=npc(this.dataset.nid); if(n){n.name=this.value;save();}
  });
  $(ct).off('input','.ls-npc-name-en').on('input','.ls-npc-name-en',function(){
    const n=npc(this.dataset.nid); if(n){n.nameEn=this.value;save();}
  });
  $(ct).off('input','.ls-npc-desc').on('input','.ls-npc-desc',function(){
    const n=npc(this.dataset.nid); if(n){n.description=this.value;save();}
  });
  $(ct).off('change','.ls-npc-skip-desc').on('change','.ls-npc-skip-desc',function(){
    const n=npc(this.dataset.nid); if(!n) return;
    n.skipDescInject=this.checked;
    save();
    // dim/undim the textarea
    const card=ct.querySelector(`.ls-npc-card[data-nid="${this.dataset.nid}"]`);
    const ta=card?.querySelector('.ls-npc-desc');
    if(ta) ta.style.cssText=this.checked?'opacity:.3;pointer-events:none;':'';
    toast('info', this.checked ? 'Описание не будет дублироваться в промпт' : 'Описание включено в промпт');
  });
  $(ct).off('change','.ls-npc-score-max').on('change','.ls-npc-score-max',function(){
    const n=npc(this.dataset.nid); if(n){n.maxScore=Math.max(1,parseInt(this.value)||100);save();renderGroupNpcs();}
  });
  $(ct).off('click','.ls-npc-rt-btn').on('click','.ls-npc-rt-btn',function(){
    const n=npc(this.dataset.nid); if(!n) return;
    n.relationType=this.dataset.rt; save(); renderGroupNpcs();
  });
  $(ct).off('click','.ls-npc-inc').on('click','.ls-npc-inc',function(){
    const n=npc(this.dataset.nid); if(!n) return;
    n.score=Math.min(n.score+1,n.maxScore); save(); renderGroupNpcs();
  });
  $(ct).off('click','.ls-npc-dec').on('click','.ls-npc-dec',function(){
    const n=npc(this.dataset.nid); if(!n) return;
    n.score=Math.max(n.score-1,MIN_SCORE); save(); renderGroupNpcs();
  });
  $(ct).off('click','.ls-npc-del-btn').on('click','.ls-npc-del-btn',function(){
    const d=chatLoveData(); d.groupNpcs=(d.groupNpcs||[]).filter(n=>n.id!==this.dataset.nid);
    save(); renderGroupNpcs();
  });
  // Клик по аватарке → выбор файла
  $(ct).off('click','.ls-npc-av-click').on('click','.ls-npc-av-click',function(){
    const nid=this.dataset.nid;
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=()=>{
      const file=inp.files?.[0]; if(!file) return;
      const reader=new FileReader();
      reader.onload=e=>{
        const n=groupNpcs().find(x=>x.id===nid); if(!n) return;
        n.avatarUrl=e.target.result; save(); renderGroupNpcs();
      };
      reader.readAsDataURL(file);
    };
    inp.click();
  });
}

// ─── Лорбук пикер ────────────────────────────────────────────────────────────
function getLorebooks() {
  // Собираем записи из всех доступных лорбуков текущего персонажа
  const entries = [];
  try {
    const ctx = SillyTavern?.getContext?.(); if (!ctx) return entries;
    const charIdx = ctx.characterId;
    const char = Array.isArray(ctx.characters) ? ctx.characters[charIdx] : null;

    // 1. Встроенный лорбук персонажа (character_book)
    const embedded = char?.data?.character_book?.entries || char?.character_book?.entries || [];
    embedded.forEach((e,i) => {
      const label = e.comment?.trim() || (e.keys||[]).filter(Boolean).join(', ') || ('Запись '+(i+1));
      entries.push({ source: 'embedded', label, content: e.content||'', keys: e.keys||[], id: 'emb_'+i });
    });

    // 2. Привязанные глобальные лорбуки (world_names / worldInfo)
    const linked = char?.data?.extensions?.world || char?.world || null;
    const worldInfoNames = ctx.worldInfoNames || ctx.worldNames || [];

    // Все загруженные книги через ctx.worldInfo (если доступно)
    const wi = ctx.worldInfo;
    if (wi) {
      // worldInfo может быть объект { entries: [...] } или Map
      const wiEntries = wi.entries ? Object.values(wi.entries) : (Array.isArray(wi) ? wi : []);
      wiEntries.forEach((e,i) => {
        const label = e.comment?.trim() || (e.key||e.keys||[]).join?.(', ') || ('WI '+(i+1));
        const src = e.world || e.book || 'worldinfo';
        entries.push({ source: src, label, content: e.content||'', keys: e.key||e.keys||[], id: 'wi_'+i });
      });
    }

    // 3. Попытка через getWorldInfo если есть
    if (typeof ctx.getWorldInfo === 'function') {
      try {
        const wData = ctx.getWorldInfo();
        if (wData?.entries) {
          Object.values(wData.entries).forEach((e,i) => {
            const label = e.comment?.trim() || (e.key||[]).join(', ') || ('WI2 '+(i+1));
            if (!entries.find(x=>x.content===e.content))
              entries.push({ source: e.world||'worldinfo', label, content: e.content||'', keys: e.key||[], id: 'wi2_'+i });
          });
        }
      } catch {}
    }
  } catch {}
  return entries;
}

function renderLorebookPicker() {
  const ct = document.getElementById('ls-lorebook-picker-list'); if (!ct) return;
  const entries = getLorebooks();
  if (!entries.length) {
    ct.innerHTML = '<div class="ls-group-empty" style="padding:10px;"><i class="fa-solid fa-book-open" style="margin-right:6px;opacity:.4;"></i>Нет записей — убедись что у персонажа есть лорбук</div>';
    return;
  }
  // Группируем по источнику
  const groups = {};
  entries.forEach(e => { (groups[e.source]||(groups[e.source]=[])).push(e); });

  ct.innerHTML = Object.entries(groups).map(([src, ents]) =>
    `<div class="ls-lb-group">
      <div class="ls-lb-group-title"><i class="fa-solid fa-book" style="margin-right:5px;opacity:.5;"></i>${escHtml(src==='embedded'?'Встроенный лорбук':src)}</div>
      ${ents.map(e=>`<div class="ls-lb-entry" data-lbid="${escHtml(e.id)}" title="${escHtml((e.keys||[]).join(', '))}">
        <div class="ls-lb-entry-name"><i class="fa-solid fa-feather" style="margin-right:5px;opacity:.35;font-size:10px;"></i>${escHtml(e.label)}</div>
        <div class="ls-lb-entry-preview">${escHtml((e.content||'').slice(0,80))}${(e.content||'').length>80?'…':''}</div>
        <button class="menu_button ls-lb-add-btn" data-lbid="${escHtml(e.id)}" title="Добавить в окружение"><i class="fa-solid fa-plus"></i></button>
      </div>`).join('')}
    </div>`
  ).join('');

  // Клик «Добавить»
  $(ct).off('click','.ls-lb-add-btn').on('click','.ls-lb-add-btn',function(ev){
    ev.stopPropagation();
    const id = this.dataset.lbid;
    const entry = getLorebooks().find(e=>e.id===id); if (!entry) return;
    const firstName = (entry.keys||[]).find(k=>k.trim()) || entry.label || 'NPC';
    const npc = mkNpc({ name: firstName, nameEn: firstName, description: entry.content, fromLorebook: true, skipDescInject: true });
    const ld = chatLoveData(); if (!ld.groupNpcs) ld.groupNpcs = [];
    ld.groupNpcs.push(npc);
    saveGroupNpcs(); renderGroupNpcs();
    // Подсветить добавленную запись
    const el = ct.querySelector(`[data-lbid="${id}"]`);
    if (el) { el.style.opacity='.4'; this.innerHTML='<i class="fa-solid fa-check"></i>'; this.disabled=true; }
    toast('success', escHtml(firstName)+' добавлен из лорбука');
  });

  // Клик по строке тоже открывает превью
  $(ct).off('click','.ls-lb-entry').on('click','.ls-lb-entry',function(e){
    if ($(e.target).closest('button').length) return;
    $(this).toggleClass('ls-lb-expanded');
  });
}

// ─── Сканирование чата на NPC из лорбука ────────────────────────────────────
// Эвристика: насколько запись лорбука похожа на персонажа (а не место/организацию)
function _lbEntryPersonScore(entry) {
  const text = ((entry.content||'') + ' ' + (entry.label||'')).toLowerCase();
  const label = (entry.label||'').trim();

  // ── Сигналы НЕ-персонажа (места, организации, предметы) ──
  const nonPersonWords = [
    // RU
    'город','улица','район','здание','страна','регион','область','посёлок','деревня','столица',
    'агентство','организация','компания','корпорация','завод','предприятие','учреждение',
    'военная часть','подразделение','спецслужба','ведомство','министерство','штаб',
    'оружие','предмет','артефакт','место','локация','объект',
    // EN
    'city','town','village','country','region','district','building','location','place',
    'agency','organization','company','corporation','institution','facility','headquarters',
    'military unit','department','ministry','weapon','item','artifact','object',
  ];
  for (const w of nonPersonWords) { if (text.includes(w)) return -10; }

  // Аббревиатуры (ГРУ, ФСБ, ЦРУ, CIA, FBI, KGB — всё caps, 2-5 букв) → не персонаж
  if (/^[А-ЯA-Z]{2,5}$/.test(label)) return -10;

  let score = 0;

  // ── Сигналы персонажа ──
  // Личные местоимения RU
  const ruPronouns = ['он ','она ','его ','её ','ему ','ей ','им ','ним ','него ','неё '];
  for (const p of ruPronouns) { if (text.includes(p)) { score += 3; break; } }
  // Личные местоимения EN
  const enPronouns = [' he ',' she ',' his ',' her ',' him '];
  for (const p of enPronouns) { if (text.includes(p)) { score += 3; break; } }

  // Роли/профессии людей RU
  const ruRoles = ['врач','доктор','офицер','агент','детектив','генерал','майор','капитан',
    'директор','владелец','хозяин','сотрудник','боец','охранник','телохранитель',
    'персонаж','мужчина','женщина','девушка','парень','мужик','старик','старуха','ребёнок'];
  for (const r of ruRoles) { if (text.includes(r)) { score += 4; break; } }
  // Роли EN
  const enRoles = ['doctor','officer','agent','detective','general','major','captain',
    'director','owner','staff','guard','bodyguard','character','man','woman','girl','guy'];
  for (const r of enRoles) { if (text.includes(r)) { score += 4; break; } }

  // Паттерн "Имя Фамилия" (два+ слова с большой буквы, кириллица или латиница)
  const isNamePattern = /^[А-ЯЁA-Z][а-яёa-z]+ [А-ЯЁA-Z][а-яёa-z]+/.test(label);
  if (isNamePattern) score += 5;

  // Упоминание возраста, внешности, характера
  const personalDetails = ['лет','года','лет,','возраст','внешность','характер','личность',
    'years old','appearance','personality','trait','born'];
  for (const d of personalDetails) { if (text.includes(d)) { score += 2; break; } }

  return score;
}

function scanChatForNpcs() {
  const box = document.getElementById('ls-scan-result'); if (!box) return;
  const ld = chatLoveData();
  const existingNames = new Set((ld.groupNpcs||[]).map(n=>(n.name||'').toLowerCase().trim()));
  const entries = getLorebooks();
  if (!entries.length) {
    box.style.display='block';
    box.innerHTML='<i class="fa-solid fa-circle-info" style="margin-right:5px;opacity:.5;"></i>Нет записей в лорбуке.';
    return;
  }

  // Собираем текст чата
  let chatText = '';
  try {
    const ctx = SillyTavern?.getContext?.();
    if (ctx?.chat?.length) chatText = ctx.chat.map(m=>(m.mes||'')).join('\n').toLowerCase();
  } catch {}

  if (!chatText.trim()) {
    box.style.display='block';
    box.innerHTML='<i class="fa-solid fa-circle-info" style="margin-right:5px;opacity:.5;"></i>Нет сообщений в чате для поиска.';
    return;
  }

  // Ищем только персонажей (personScore > 0), упомянутых в чате
  const found = entries
    .filter(e => {
      const name = ((e.keys||[]).find(k=>k.trim()) || e.label || '').toLowerCase().trim();
      if (!name || existingNames.has(name)) return false;
      const mentionedInChat = (e.keys||[e.label]).some(k => k.trim() && chatText.includes(k.trim().toLowerCase()));
      if (!mentionedInChat) return false;
      return _lbEntryPersonScore(e) > 0;
    })
    .sort((a, b) => _lbEntryPersonScore(b) - _lbEntryPersonScore(a)); // самые "персонажные" — первыми

  box.style.display = 'block';
  if (!found.length) {
    box.innerHTML='<i class="fa-solid fa-check" style="margin-right:5px;color:#6ee86e;"></i>Персонажей из лорбука в чате не найдено (или все уже добавлены).';
    return;
  }

  box.innerHTML = '<div style="font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.45;margin-bottom:6px;"><i class="fa-solid fa-user-group" style="margin-right:4px;"></i>Персонажи в чате — добавить в окружение?</div>'
    + found.map(e => {
      const name = (e.keys||[]).find(k=>k.trim()) || e.label || 'NPC';
      const preview = (e.content||'').slice(0,60).trim();
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid rgba(255,255,255,.05);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);">${escHtml(name)}</div>
          ${preview?`<div style="font-size:10px;opacity:.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escHtml(preview)}…</div>`:''}
        </div>
        <button class="menu_button ls-scan-add-btn" data-lbid="${escHtml(e.id)}" style="flex-shrink:0;padding:3px 9px!important;font-size:11px!important;"><i class="fa-solid fa-plus"></i> Добавить</button>
      </div>`;
    }).join('');

  $(box).off('click','.ls-scan-add-btn').on('click','.ls-scan-add-btn',function(){
    const id = this.dataset.lbid;
    const entry = getLorebooks().find(e=>e.id===id); if (!entry) return;
    const firstName = (entry.keys||[]).find(k=>k.trim()) || entry.label || 'NPC';
    const npc = mkNpc({ name: firstName, nameEn: firstName, description: entry.content, fromLorebook: true, skipDescInject: true });
    const ld2 = chatLoveData(); if (!ld2.groupNpcs) ld2.groupNpcs = [];
    ld2.groupNpcs.push(npc);
    saveGroupNpcs(); renderGroupNpcs();
    this.closest('div[style]').remove();
    toast('success', escHtml(firstName)+' добавлен из лорбука');
    if (!box.querySelector('.ls-scan-add-btn')) {
      box.innerHTML='<i class="fa-solid fa-check" style="margin-right:5px;color:#6ee86e;"></i>Все найденные персонажи добавлены!';
    }
  });
}


function acc(id, title, content, open=false) {
  return `<div class="inline-drawer ls-sub-acc" id="${id}">
    <div class="inline-drawer-toggle inline-drawer-header ls-sub-acc-header"><b>${title}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
    <div class="inline-drawer-content"${open?'':' style="display:none"'}>${content}</div>
  </div>`;
}

function heartSvgMini(rt) {
  const rot = rt==='hostile' ? 'transform:rotate(180deg);' : '';
  return `<svg viewBox="0 0 20 16" width="20" height="16" style="display:block;fill:currentColor;${rot}"><path d="M10,15.5 C10,15.5 1,9.5 1,4.5 C1,2 3,0.5 5.5,0.5 C7.5,0.5 9.2,2 10,3.5 C10.8,2 12.5,0.5 14.5,0.5 C17,0.5 19,2 19,4.5 C19,9.5 10,15.5 10,15.5Z"/></svg>`;
}

function settingsPanelHTML() {
  const c=cfg(), curModel=escHtml(c.genModel||''), curEndpoint=escHtml(c.genEndpoint||'');
  const curKey=escHtml(c.genApiKey||''), lang=c.genLang||'ru', curNotes=escHtml(c.genUserNotes||'');
  const sc=c.genScope||defaultSettings.genScope;
  const chk=(id,val,label)=>`<label class="ls-scope-item"><input type="checkbox" id="${id}"${val?' checked':''}> ${label}</label>`;

  const heartStyleSvgChecked = (c.heartStyle||'svg')==='svg' ? ' checked' : '';
  const heartStyleBlurChecked = (c.heartStyle||'svg')==='blur' ? ' checked' : '';

  // ── Окружение ──
  const groupContent = `
    <div class="ls-hint">Отслеживай отношения с несколькими персонажами. Тяни записи из лорбука главного героя или создавай вручную. Данные хранятся отдельно для каждого чата.</div>
    <div class="ls-row">
      <label class="checkbox_label" for="ls-group-enabled"><input type="checkbox" id="ls-group-enabled"${c.groupMode?' checked':''}><span>Включить режим окружения</span></label>
    </div>
    <div id="ls-group-body" style="${c.groupMode?'':'display:none'}">
      <div class="ls-npc-add-row">
        <button id="ls-npc-from-lorebook" class="menu_button"><i class="fa-solid fa-book-open"></i> Из лорбука</button>
        <button id="ls-npc-add-manual" class="menu_button"><i class="fa-solid fa-pen-to-square"></i> Создать вручную</button>
      </div>
      <div class="ls-npc-add-row" style="margin-top:0;margin-bottom:6px;">
        <button id="ls-npc-scan-chat" class="menu_button" style="flex:1;" title="Найти упомянутых NPC из лорбука в истории чата"><i class="fa-solid fa-magnifying-glass"></i> Найти NPC в чате</button>
      </div>
      <div id="ls-scan-result" style="display:none;margin-bottom:8px;padding:8px;border-radius:6px;background:rgba(167,139,250,.05);border:1px dashed rgba(167,139,250,.25);font-size:11px;line-height:1.6;color:var(--SmartThemeBodyColor,#ccc);"></div>
      <div id="ls-lorebook-picker" style="display:none;">
        <div class="ls-lb-header">
          <span style="font-size:11px;opacity:.5;"><i class="fa-solid fa-book-open" style="margin-right:4px;"></i>Выбери записи для добавления</span>
          <button id="ls-lb-close" class="menu_button" style="padding:2px 8px!important;font-size:11px!important;opacity:.5;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="ls-lorebook-picker-list"></div>
      </div>
      <div id="ls-group-list"></div>
    </div>`;

  // ── Основное ──
  const mainContent = `
    <div class="ls-row"><label class="checkbox_label" for="ls-enabled"><input type="checkbox" id="ls-enabled"><span>Включено</span></label></div>
    <div class="ls-row">
      <span style="font-size:12px;opacity:.6;">Очки:</span>
      <input id="ls-val" type="number" class="ls-num-input" style="width:72px;">
      <span style="opacity:.3;">/</span>
      <input id="ls-max" type="number" min="1" class="ls-num-input" style="width:72px;">
      <button id="ls-reset-btn" class="menu_button">Сбросить</button>
    </div>
    <div class="ls-rel-type-row">
      ${Object.entries(RELATION_TYPES).map(([k,v])=>`<span class="ls-rel-type-btn ls-rt-${k}" data-rt="${k}" title="${v.label}">${heartSvgMini(k)}</span>`).join('')}
      <span class="ls-rel-type-label" id="ls-rt-label"></span>
    </div>
    <div id="ls-type-info"></div>
    <div class="ls-row">
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">Размер:</span>
      <input type="range" id="ls-size" min="36" max="128" step="4" class="ls-size-slider" style="flex:1;">
      <span id="ls-size-label" style="font-size:12px;min-width:36px;text-align:right;opacity:.5;">64px</span>
      <button id="ls-reset-pos" class="menu_button" title="Вернуть в угол">Позиция</button>
    </div>
    <div class="ls-row">
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">Сердечко:</span>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-heart-style" value="svg"${heartStyleSvgChecked}> <span>Заливка</span></label>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-heart-style" value="blur"${heartStyleBlurChecked}> <span>Размытое</span></label>
    </div>
    <div class="ls-row"><label class="checkbox_label" for="ls-gradual"><input type="checkbox" id="ls-gradual"><span>SlowBurn (±2 макс за ответ)</span></label></div>
    <div id="ls-active-state" style="display:none;"><strong>Сейчас:</strong> <span id="ls-active-text"></span></div>
    <div class="ls-section-title" style="display:flex;align-items:center;justify-content:space-between;">История <button id="ls-log-clear" class="menu_button ls-log-clear">очистить</button></div>
    <div id="ls-score-log"></div>`;

  // ── Правила ──
  const rulesContent = `
    <div class="ls-section-title" style="margin-top:0;">Правила изменения</div>
    <div class="ls-hint">За что растут и падают очки.</div>
    <div id="ls-changes-container"></div>
    <div class="ls-section-title">Поведение по диапазонам</div>
    <div class="ls-hint">Описывай поведение для позитивных и негативных значений.</div>
    <div id="ls-interp-container"></div>
    <div class="ls-section-title">Романтические события</div>
    <div class="ls-hint">При достижении порога персонаж инициирует событие.</div>
    <div class="ls-milestone-reset-row"><button id="ls-milestone-reset-all" class="menu_button">Сбросить все</button></div>
    <div id="ls-milestones-container"></div>`;

  // ── AI ──
  const aiContent = `
    <div class="ls-hint">Выбери что генерировать, подключи API и нажми кнопку.</div>
    <div style="font-size:11px;opacity:.5;font-weight:600;letter-spacing:.4px;text-transform:uppercase;margin-bottom:5px;">Что генерировать</div>
    <div class="ls-scope-grid">
      ${chk('ls-scope-changes',sc.changes,'Правила изменений')}
      ${chk('ls-scope-pos-ranges',sc.positiveRanges,'Диапазоны позитив')}
      ${chk('ls-scope-neg-ranges',sc.negativeRanges,'Диапазоны негатив (-100…-1)')}
      ${chk('ls-scope-milestones',sc.milestones,'Романтические события')}
      ${chk('ls-scope-max',sc.suggestedMax,'Предложить макс. очки')}
    </div>
    <div class="ls-row" style="margin-bottom:6px;gap:12px;"><span style="font-size:12px;opacity:.6;white-space:nowrap;">Язык:</span>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-ru" value="ru"${lang==='ru'?' checked':''}> <span>Русский</span></label>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-en" value="en"${lang==='en'?' checked':''}> <span>English</span></label>
    </div>
    <label class="ls-api-label">Особые пожелания</label>
    <textarea id="ls-gen-notes" class="ls-api-field" rows="2" placeholder="Например: не добавляй события про брак..." style="resize:vertical;font-family:inherit;font-size:12px;line-height:1.5;">${curNotes}</textarea>
    <label class="ls-api-label">Endpoint</label>
    <input id="ls-gen-endpoint" class="ls-api-field" type="text" placeholder="https://api.example.com/v1" value="${curEndpoint}">
    <label class="ls-api-label">API Key</label>
    <input id="ls-gen-apikey" class="ls-api-field" type="password" placeholder="sk-..." value="${curKey}">
    <label class="ls-api-label">Модель</label>
    <div class="ls-model-row">
      <select id="ls-gen-model-select">${curModel?`<option value="${curModel}" selected>${curModel}</option>`:'<option value="">-- нажми обновить --</option>'}</select>
      <button id="ls-refresh-models" class="menu_button ls-refresh-btn" title="Загрузить модели"><i class="fa-solid fa-sync"></i></button>
    </div>
    <div class="ls-section-title" style="margin-top:10px;"><i class="fa-solid fa-database" style="margin-right:6px;opacity:.7;"></i>Источник данных</div>
    <div class="ls-hint">Выбери один или оба — ИИ получит всю инфу вместе.</div>
    <div class="ls-source-grid">
      <label class="ls-source-card" id="ls-src-card-label">
        <input type="checkbox" id="ls-gen-use-card"${c.genUseCard!==false?' checked':''}>
        <div class="ls-source-card-inner">
          <i class="fa-solid fa-address-card ls-source-icon"></i>
          <div class="ls-source-card-title">Карточка</div>
          <div class="ls-source-card-sub" id="ls-src-card-name">&nbsp;</div>
        </div>
        <div class="ls-source-check"><i class="fa-solid fa-check"></i></div>
      </label>
      <label class="ls-source-card" id="ls-src-lb-label">
        <input type="checkbox" id="ls-gen-use-lb"${(cfg().genLorebookEntryIds||[]).length>0?' checked':''} style="display:none">
        <div class="ls-source-card-inner">
          <i class="fa-solid fa-book-bookmark ls-source-icon"></i>
          <div class="ls-source-card-title">Лорбук</div>
          <div class="ls-source-card-sub" id="ls-src-lb-sub">&nbsp;</div>
        </div>
        <div class="ls-source-check"><i class="fa-solid fa-check"></i></div>
      </label>
    </div>
    <div id="ls-gen-lb-panel" style="display:none;border:1px solid rgba(255,68,102,.15);border-radius:10px;overflow:hidden;margin:4px 0 6px;max-height:300px;overflow-y:auto;background:rgba(10,4,8,.4);backdrop-filter:blur(6px);">
      <div class="ls-gen-lb-panel-header">
        <span class="ls-gen-lb-panel-title"><i class="fa-solid fa-book-open" style="margin-right:6px;color:#ff4466;opacity:.7;"></i>Записи лорбука &nbsp;<span id="ls-gen-lb-count" style="font-weight:400;opacity:.5;text-transform:none;letter-spacing:0;"></span></span>
        <div style="display:flex;gap:4px;align-items:center;">
          <button id="ls-gen-lb-refresh" class="menu_button ls-gen-lb-hbtn" title="Обновить список"><i class="fa-solid fa-arrows-rotate"></i></button>
          <button id="ls-gen-lb-close" class="menu_button ls-gen-lb-hbtn" title="Свернуть"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
      </div>
      <div id="ls-gen-lb-list"></div>
    </div>
    <div id="ls-source-summary" class="ls-source-summary"></div>
    <div id="ls-char-preview" style="margin-bottom:6px;"><img id="ls-char-avatar" class="ls-avatar-hidden" src="" alt=""><span id="ls-char-avatar-name" style="font-size:12px;opacity:.6;"></span></div>
    <div class="ls-row" style="margin-bottom:6px;gap:6px;">
      <span style="font-size:12px;opacity:.6;white-space:nowrap">Сообщений из чата:&nbsp;</span>
      <input type="number" id="ls-gen-msg-count" class="ls-num-input" min="0" max="200" style="width:60px" value="${c.chatAnalysisMsgCount||20}">
      <span style="font-size:10px;opacity:.35;margin-left:2px">0 = без истории</span>
    </div>
    <button id="ls-gen-btn" class="menu_button" style="width:100%;display:flex;align-items:center;justify-content:center;gap:7px;"><i class="fa-solid fa-wand-magic-sparkles"></i>Сгенерировать</button>
    <div id="ls-gen-status"></div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color,rgba(255,255,255,.08));">
      <div class="ls-section-title" style="margin-top:0;">Анализ чата</div>
      <div class="ls-hint">ИИ читает историю чата + карту персонажа и предлагает счёт отношений</div>
      <button id="ls-analyze-btn" class="menu_button" style="width:100%"><i class="fa-solid fa-chart-line"></i> Анализировать чат</button>
      <div id="ls-analyze-status" style="font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.6;margin-top:5px;min-height:14px;"></div>
      <div id="ls-analyze-result"></div>
    </div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color,rgba(255,255,255,.08));">
      <div class="ls-section-title" style="margin-top:0;"><i class="fa-solid fa-rotate" style="margin-right:5px;"></i>Авто-регенерация</div>
      <div class="ls-hint">Каждые N сообщений ИИ полностью пересоздаёт правила изменений, диапазоны и события — чтобы они оставались актуальными по ходу чата.</div>
      <div class="ls-row">
        <label class="checkbox_label" for="ls-autosuggest-enabled"><input type="checkbox" id="ls-autosuggest-enabled"${c.autoSuggestEnabled?' checked':''}><span>Включить авто-регенерацию</span></label>
      </div>
      <div class="ls-row" style="gap:8px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Каждые</span>
        <input type="number" id="ls-autosuggest-interval" class="ls-num-input" min="5" max="100" style="width:60px;" value="${c.autoSuggestInterval||20}">
        <span style="font-size:12px;opacity:.6;">сообщений</span>
        <button id="ls-autosuggest-now" class="menu_button" title="Регенерировать прямо сейчас"><i class="fa-solid fa-rotate"></i></button>
      </div>
      <div id="ls-autosuggest-result"></div>
    </div>`;

  // ── Пресеты ──
  const presetsContent = `
    <div class="ls-hint">Сохраняй и загружай наборы правил. Авто-снапшот делается перед каждой генерацией.</div>
    <div id="ls-load-mode-box">
      <div style="font-size:11px;opacity:.5;margin-bottom:5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">Режим применения</div>
      <div class="ls-load-mode-row">
        <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-load-mode" value="replace" checked> <span>Заменить</span></label>
        <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-load-mode" value="merge"> <span>Дополнить</span></label>
      </div>
      <div class="ls-load-checks">
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-changes" checked> Правила</label>
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-ranges" checked> Диапазоны</label>
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-milestones" checked> События</label>
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-maxscore" checked> Макс. очки</label>
      </div>
    </div>
    <div class="ls-row" style="margin-top:8px;">
      <input type="text" id="ls-preset-name-input" class="ls-api-field" style="flex:1;" placeholder="Название пресета...">
      <button id="ls-preset-save" class="menu_button" style="white-space:nowrap;">Сохранить</button>
    </div>
    <div class="ls-row">
      <button id="ls-preset-import-file-btn" class="menu_button"><i class="fa-solid fa-folder-open"></i> Импорт из файла</button>
      <input type="file" id="ls-preset-file-input" accept=".json,application/json" style="display:none;">
    </div>
    <div id="ls-preset-list"></div>`;

  const debugContent = `
    <div class="ls-hint">Просмотр текущего состояния системы, активных инжектов и как они работают.</div>
    <div class="ls-row" style="justify-content:space-between;">
      <span style="font-size:12px;opacity:.5;"><i class="fa-solid fa-circle-info" style="margin-right:5px;"></i>Данные обновляются при открытии вкладки</span>
      <button id="ls-debug-refresh-btn" class="menu_button ls-debug-refresh"><i class="fa-solid fa-rotate"></i> Обновить</button>
    </div>
    <div id="ls-debug-content"></div>`;

  return `<div id="ls-settings-panel" class="extension-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b><i class="fa-solid fa-heart" style="color:#ff4466;margin-right:6px;"></i>Love Score</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content">
        ${acc('ls-acc-main',   'Основное',       mainContent,    true)}
        ${acc('ls-acc-rules',  'Правила',        rulesContent,   false)}
        ${acc('ls-acc-ai',     'AI генерация',   aiContent,      false)}
        ${acc('ls-acc-presets','Пресеты',        presetsContent, false)}
        ${acc('ls-acc-group',  'Окружение',      groupContent,   false)}
        ${acc('ls-acc-debug',  'Отладка',        debugContent,   false)}
      </div>
    </div>
  </div>`;
}

// ─── Рендер секций ────────────────────────────────────────────────────────────
function renderChanges() {
  const ct=document.getElementById('ls-changes-container'); if(!ct) return;
  const arr=loveData().scoreChanges||[]; let html='';
  arr.forEach((c,i)=>{
    const pos=c.delta>=0,cls=pos?'ls-card-pos':'ls-card-neg';
    const icon=pos?'<i class="fa-solid fa-heart ls-heart-icon ls-icon-pos"></i>':'<i class="fa-solid fa-heart-crack ls-heart-icon ls-icon-neg"></i>';
    const ph=pos?'При каких условиях растёт...':'При каких условиях падает...';
    html+=`<div class="ls-card ${cls}" data-idx="${i}">
      <div class="ls-heart-box">${icon}<input type="number" class="ls-delta-input ls-num-input" value="${c.delta}" data-idx="${i}" style="width:56px;font-weight:600;"></div>
      <textarea class="ls-change-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="${ph}">${escHtml(c.description)}</textarea>
      <button class="ls-del-change menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
    </div>`;
  });
  html+='<button id="ls-add-change" class="menu_button ls-add-btn"><i class="fa-solid fa-plus"></i> Добавить правило</button>';
  ct.innerHTML=html; bindChangesEv();
}

function renderInterps() {
  const ct=document.getElementById('ls-interp-container'); if(!ct) return;
  const d=loveData(),arr=d.scaleInterpretations||[]; let html='';
  arr.forEach((ip,i)=>{
    const act=d.score>=ip.min&&d.score<=ip.max,isNeg=ip.max<0;
    const bst=act?(isNeg?'border-color:rgba(80,200,0,.7);':'border-color:rgba(180,100,120,.6);'):'';
    const cls=isNeg?'ls-card-neg':'ls-card-neu';
    const lbl=act?'▶ активно':(isNeg?'<i class="fa-solid fa-skull"></i> негатив':'диапазон');
    html+=`<div class="ls-card ${cls}" data-idx="${i}" style="${bst}">
      <div class="ls-range-box"><span class="ls-range-label">${lbl}</span>
        <div class="ls-range-inner">
          <input type="number" class="ls-interp-min ls-range-input" value="${ip.min}" data-idx="${i}">
          <span class="ls-range-sep">—</span>
          <input type="number" class="ls-interp-max ls-range-input" value="${ip.max}" data-idx="${i}">
        </div>
      </div>
      <textarea class="ls-interp-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="Описание поведения...">${escHtml(ip.description)}</textarea>
      <button class="ls-del-interp menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
    </div>`;
  });
  html+='<button id="ls-add-interp" class="menu_button ls-add-btn"><i class="fa-solid fa-plus"></i> Добавить диапазон</button>';
  ct.innerHTML=html;
  const act=getActiveInterp(),box=document.getElementById('ls-active-state'),txt=document.getElementById('ls-active-text');
  if(box&&txt){if(act?.description?.trim()){txt.textContent=act.description.trim();box.style.display='block';}else box.style.display='none';}
  bindInterpEv();
}

function renderMilestones() {
  const ct=document.getElementById('ls-milestones-container'); if(!ct) return;
  const d=loveData(),arr=d.milestones||[]; let html='';
  arr.forEach((m,i)=>{
    const reached=d.score>=m.threshold,dc=m.done?' ls-done':'';
    const rs=reached&&!m.done?'border-color:rgba(200,160,80,.65);':'';
    const st=m.done?'выполнено':(reached?'пора!':'ждёт'),sc=(!m.done&&reached)?' ls-status-due':'';
    html+=`<div class="ls-card ls-card-milestone${dc}" data-idx="${i}" style="${rs}">
      <div class="ls-milestone-left">
        <div class="ls-milestone-threshold-wrap">
          <span class="ls-milestone-threshold-label">от</span>
          <input type="number" class="ls-milestone-thr-input ls-num-input" value="${m.threshold}" data-idx="${i}" min="0" style="width:56px;">
        </div>
        <input type="checkbox" class="ls-milestone-done-cb" data-idx="${i}" ${m.done?'checked':''}>
        <span class="ls-milestone-status${sc}">${st}</span>
      </div>
      <textarea class="ls-milestone-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="Что должен сделать персонаж...">${escHtml(m.description)}</textarea>
      <button class="ls-del-milestone menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
    </div>`;
  });
  html+='<button id="ls-add-milestone" class="menu_button ls-add-btn"><i class="fa-solid fa-plus"></i> Добавить событие</button>';
  ct.innerHTML=html; bindMilestonesEv();
}

function bindChangesEv() {
  $('.ls-delta-input').off('change').on('change',function(){loveData().scoreChanges[+$(this).data('idx')].delta=parseInt(this.value)||0;saveSettingsDebounced();updatePromptInjection();renderChanges();});
  $('.ls-change-desc').off('input').on('input',function(){loveData().scoreChanges[+$(this).data('idx')].description=this.value;saveSettingsDebounced();updatePromptInjection();});
  $('.ls-del-change').off('click').on('click',function(){loveData().scoreChanges.splice(+$(this).data('idx'),1);saveSettingsDebounced();updatePromptInjection();renderChanges();});
  $('#ls-add-change').off('click').on('click',()=>{loveData().scoreChanges.push({delta:1,description:''});saveSettingsDebounced();renderChanges();});
}
function bindInterpEv() {
  $('.ls-interp-min').off('change').on('change',function(){loveData().scaleInterpretations[+$(this).data('idx')].min=parseInt(this.value)||0;saveSettingsDebounced();updatePromptInjection();renderInterps();});
  $('.ls-interp-max').off('change').on('change',function(){loveData().scaleInterpretations[+$(this).data('idx')].max=parseInt(this.value)||0;saveSettingsDebounced();updatePromptInjection();renderInterps();});
  $('.ls-interp-desc').off('input').on('input',function(){loveData().scaleInterpretations[+$(this).data('idx')].description=this.value;saveSettingsDebounced();updatePromptInjection();});
  $('.ls-del-interp').off('click').on('click',function(){loveData().scaleInterpretations.splice(+$(this).data('idx'),1);saveSettingsDebounced();updatePromptInjection();renderInterps();});
  $('#ls-add-interp').off('click').on('click',()=>{const a=loveData().scaleInterpretations,lm=a[a.length-1]?.max??0;a.push({min:lm+1,max:lm+10,description:''});saveSettingsDebounced();renderInterps();});
}
function bindMilestonesEv() {
  $('.ls-milestone-thr-input').off('change').on('change',function(){loveData().milestones[+$(this).data('idx')].threshold=parseInt(this.value)||0;saveSettingsDebounced();updatePromptInjection();renderMilestones();});
  $('.ls-milestone-done-cb').off('change').on('change',function(){loveData().milestones[+$(this).data('idx')].done=this.checked;saveSettingsDebounced();updatePromptInjection();renderMilestones();});
  $('.ls-milestone-desc').off('input').on('input',function(){loveData().milestones[+$(this).data('idx')].description=this.value;saveSettingsDebounced();updatePromptInjection();});
  $('.ls-del-milestone').off('click').on('click',function(){loveData().milestones.splice(+$(this).data('idx'),1);saveSettingsDebounced();updatePromptInjection();renderMilestones();});
  $('#ls-add-milestone').off('click').on('click',()=>{const a=loveData().milestones,l=a[a.length-1]?.threshold??0;a.push({threshold:l+10,description:'',done:false});saveSettingsDebounced();renderMilestones();});
  $('#ls-milestone-reset-all').off('click').on('click',()=>{loveData().milestones.forEach(m=>m.done=false);saveSettingsDebounced();updatePromptInjection();renderMilestones();toast('info','Все события сброшены');});
}

// ─── Промпт ───────────────────────────────────────────────────────────────────
function buildPrompt() {
  const c=cfg(),d=chatLoveData(); if(!c.isEnabled) return '';
  const changes=(d.scoreChanges||[]).filter(x=>x.description.trim());
  const interps=(d.scaleInterpretations||[]).filter(x=>x.description.trim());
  const active=getActiveInterp(),pending=getPendingMilestones();
  let p='[OOC - LOVE SCORE SYSTEM]\n\nCurrent love score: '+d.score+' (range: '+MIN_SCORE+' to '+d.maxScore+').';
  if(d.score<0) p+='\nNEGATIVE ZONE: character feels hostility, distrust or hatred toward the player.';
  if(active?.description?.trim()) p+='\n\nCURRENT BEHAVIOR (score '+d.score+'):\n'+active.description.trim()+'\n\nPortray the character strictly according to this description.';
  if(pending.length>0){
    p+='\n\nROMANTIC EVENTS — YOU MUST INITIATE ALL OF THESE (naturally, within this or the next response):';
    pending.forEach(m=>{p+='\n- '+m.description.trim()+' (unlocked at score '+m.threshold+')';});
    p+='\nAfter completing each event, include at the very end: <!-- [MILESTONE:threshold] --> for each completed one.';
  }
  if(changes.length){p+='\n\nLove Score Changes:';changes.forEach(x=>{p+='\n'+(x.delta>=0?'+':'')+x.delta+': '+x.description.trim();});}
  if(interps.length){p+='\n\nLove Scale:';interps.forEach(x=>{p+='\n'+x.min+' to '+x.max+': '+x.description.trim()+((d.score>=x.min&&d.score<=x.max)?' <- NOW':'');});}
  if(c.gradualProgression) p+='\n\nSlowBurn RULE: Allowed score changes per response: -2, -1, 0, +1, +2. Default is 0. EXCEPTION: If the change delta matches a configured Score Change rule, its full delta is applied.';
  const _rtKeys=Object.keys(RELATION_TYPES).join('|');
  if(d.relationType==='neutral'||!d.relationType)
    p+='\n\nOnce the relationship type becomes evident, add once: <!-- [RELATION_TYPE:key] --> where key is one of: '+_rtKeys+'.';
  else
    p+='\n\nIf relationship type changes, update with: <!-- [RELATION_TYPE:key] --> ('+_rtKeys+').';
  p+='\n\nAt the end of each response include: <!-- [LOVE_SCORE:X] --> replacing X with the updated score ('+MIN_SCORE+' to '+d.maxScore+').';

  // ── Групповой режим ──
  const gc=cfg();
  if(gc.groupMode&&(chatLoveData().groupNpcs||[]).length>0){
    const active=chatLoveData().groupNpcs.filter(n=>n.name?.trim());
    if(active.length){
      const rtKeys=Object.keys(RELATION_TYPES).join('|');
      p+='\n\n═══════════════════════════════════════';
      p+='\n[SURROUNDING CHARACTERS — NPC RELATIONSHIP SYSTEM]';
      p+='\n';
      p+='\nThe following characters are present in this scene. You MUST track each one\'s';
      p+='\nrelationship score with the player independently, just like the main character.';
      p+='\n';

      active.forEach(n=>{
        const rt=RELATION_TYPES[n.relationType||'neutral']||RELATION_TYPES.neutral;
        const injName=(n.nameEn?.trim())||n.name.trim();
        p+='\n── '+n.name.trim()+(injName!==n.name.trim()?' / '+injName:'');
        p+='\n   Relationship: '+rt.label+' | Score: '+n.score+' / '+n.maxScore;
        if(n.score<0) p+='\n   ⚠ NEGATIVE ZONE — hostile, distrustful or antagonistic toward the player';
        if(n.description?.trim()&&!n.skipDescInject) p+='\n   Character: '+n.description.trim().slice(0,250);
      });

      p+='\n';
      p+='\nBEHAVIOR RULES FOR EACH NPC:';
      p+='\n• Portray each NPC according to their current relationship score and type';
      p+='\n• Scores rise with warmth, help, shared moments, trust, humor, vulnerability';
      p+='\n• Scores fall with rudeness, betrayal, lies, ignoring, cruelty, rejection';
      p+='\n• Hostile NPCs (score < 0) are cold, suspicious, unfriendly — portray accordingly';
      p+='\n• If SlowBurn is on, limit per-response change to ±2 per NPC (unless a strong story beat justifies more)';
      p+='\n• Only update scores for NPCs who actually interact in the scene';
      p+='\n';
      p+='\nAT THE END OF EACH RESPONSE (only for NPCs whose values changed):';
      p+='\n  <!-- [NPC_SCORE:EnglishName:X] -->   (X = new score, range: '+MIN_SCORE+' to max)';
      p+='\n  <!-- [NPC_TYPE:EnglishName:key] -->   (key: '+rtKeys+', only when type becomes clear)';
      p+='\nUse the EN name in tags. Do NOT include tags for NPCs not featured in this response.';
      p+='\n═══════════════════════════════════════';
    }
  }

  return p;
}

function updatePromptInjection() {
  try { setExtensionPrompt(PROMPT_KEY,cfg().isEnabled?buildPrompt():'',extension_prompt_types.IN_CHAT,0); }
  catch(e){ toast('error','Ошибка промпта: '+e.message); }
}

// ─── Обработчик сообщений ─────────────────────────────────────────────────────
function onMessageReceived() {
  if(!cfg().isEnabled) return;
  try {
    const chat=typeof SillyTavern?.getContext==='function'?SillyTavern.getContext().chat:window.chat;
    if(!chat?.length) return;
    const msg=chat[chat.length-1]; if(!msg||msg.is_user) return;
    const text=msg.mes||'';
    const d=chatLoveData();

    // Счёт
    const sm=text.match(/<!--\s*\[LOVE_SCORE:(-?\d+)\]\s*-->/i);
    if(sm){
      const c=cfg(); let nv=parseInt(sm[1],10),ov=d.score;
      if(c.gradualProgression){const _sbDelta=nv-ov;const _sbRule=(d.scoreChanges||[]).find(r=>r.delta===_sbDelta&&r.description.trim());if(!_sbRule){const md=2;nv=Math.max(ov-md,Math.min(ov+md,nv));}}
      d.score=Math.max(MIN_SCORE,Math.min(nv,d.maxScore));
      const delta=d.score-ov;
      if(delta!==0){
        const mr=(d.scoreChanges||[]).find(r=>r.delta===delta&&r.description.trim());
        addToLog(d,delta,mr?.description?.slice(0,35)||'');
        const crossed=(ov>=0&&d.score<0)||(ov<0&&d.score>=0);
        if(crossed) flipWidget(); else pulseWidget();
      }
      refreshWidget();syncUI();renderScoreLog();
    }

    // Майлстоны
    const msm=[...text.matchAll(/<!--\s*\[MILESTONE:(\d+)\]\s*-->/gi)];
    msm.forEach(mm=>{
      const thr=parseInt(mm[1],10);
      const ms=(d.milestones||[]).find(m=>m.threshold===thr&&!m.done);
      if(ms){ms.done=true;toast('success','Событие: '+ms.description.slice(0,55));renderMilestones();}
    });

    // Тип отношений
    const rtm=text.match(/<!--\s*\[RELATION_TYPE:([\w]+)\]\s*-->/i);
    if(rtm){
      const key=rtm[1].toLowerCase();
      if(RELATION_TYPES[key]&&key!==d.relationType){
        d.relationType=key;
        toast('info','Тип отношений: '+RELATION_TYPES[key].label);
        syncUI();
      }
    }

    saveSettingsDebounced();updatePromptInjection();

    // Авто-регенерация правил
    const c=cfg();
    if(c.autoSuggestEnabled){
      c._autoSuggestMsgCounter=(c._autoSuggestMsgCounter||0)+1;
      const interval=Math.max(5,parseInt(c.autoSuggestInterval)||20);
      if(c._autoSuggestMsgCounter>=interval){
        c._autoSuggestMsgCounter=0;
        saveSettingsDebounced();
        autoRegenAll();
      }
    }

    // Групповой режим — парсинг NPC счётов и типов отношений
    const gc=cfg();
    if(gc.groupMode&&(chatLoveData().groupNpcs||[]).length>0){
      const allNpcs=chatLoveData().groupNpcs;
      let npcChanged=false;

      // Счёт: <!-- [NPC_SCORE:Name:X] -->
      const npcScoreMatches=[...text.matchAll(/<!--\s*\[NPC_SCORE:([^\]:]+):(-?\d+)\]\s*-->/gi)];
      npcScoreMatches.forEach(m=>{
        const name=m[1].trim(),newScore=parseInt(m[2],10);
        const npc=allNpcs.find(n=>(n.nameEn||n.name).trim().toLowerCase()===name.toLowerCase()||n.name.trim().toLowerCase()===name.toLowerCase());
        if(npc){
          const old=npc.score;
          npc.score=Math.max(MIN_SCORE,Math.min(newScore,npc.maxScore));
          if(npc.score!==old){
            const delta=npc.score-old;
            toast('info',(npc.name||name)+': '+(delta>0?'+':'')+delta+' → '+npc.score);
            npcChanged=true;
          }
        }
      });

      // Тип: <!-- [NPC_TYPE:Name:key] -->
      const npcTypeMatches=[...text.matchAll(/<!--\s*\[NPC_TYPE:([^\]:]+):([\w]+)\]\s*-->/gi)];
      npcTypeMatches.forEach(m=>{
        const name=m[1].trim(),key=m[2].toLowerCase();
        const npc=allNpcs.find(n=>(n.nameEn||n.name).trim().toLowerCase()===name.toLowerCase()||n.name.trim().toLowerCase()===name.toLowerCase());
        if(npc&&RELATION_TYPES[key]&&key!==npc.relationType){
          npc.relationType=key;
          toast('info',(npc.name||name)+' → '+RELATION_TYPES[key].label);
          npcChanged=true;
        }
      });

      if(npcChanged){saveSettingsDebounced();renderGroupNpcs();}
    }
  } catch(e){toast('error','Ошибка: '+e.message);}
}


// ─── Отладка ──────────────────────────────────────────────────────────────────
function renderDebug() {
  const ct=document.getElementById('ls-debug-content'); if(!ct) return;
  const c=cfg(), d=chatLoveData();
  const npcs=d.groupNpcs||[];
  const rt=RELATION_TYPES[d.relationType||'neutral']||RELATION_TYPES.neutral;
  const interp=getActiveInterp();
  const pending=getPendingMilestones();
  const prompt=cfg().isEnabled?buildPrompt():'(расширение отключено)';
  const msgCtr=c._autoSuggestMsgCounter||0;
  const interval=c.autoSuggestInterval||20;

  // Блок 1 — текущее состояние
  const statHTML=`
    <div class="ls-debug-block">
      <div class="ls-debug-label"><i class="fa-solid fa-gauge-high"></i> Текущее состояние</div>
      <div class="ls-debug-stat-grid">
        <div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:${rt.color};">${d.score} / ${d.maxScore}</span><span class="ls-debug-stat-key">Love Score</span></div>
        <div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:${rt.color};">${escHtml(rt.label)}</span><span class="ls-debug-stat-key">Тип отношений</span></div>
        <div class="ls-debug-stat"><span class="ls-debug-stat-val">${escHtml(interp?.description?.slice(0,30)||'—')}</span><span class="ls-debug-stat-key">Активный диапазон</span></div>
        <div class="ls-debug-stat"><span class="ls-debug-stat-val">${pending.length}</span><span class="ls-debug-stat-key">Событий в очереди</span></div>
        <div class="ls-debug-stat"><span class="ls-debug-stat-val">${c.autoSuggestEnabled?msgCtr+' / '+interval:'выкл'}</span><span class="ls-debug-stat-key">Авто-реген</span></div>
        <div class="ls-debug-stat"><span class="ls-debug-stat-val">${c.gradualProgression?'±2':'без огр.'}</span><span class="ls-debug-stat-key">SlowBurn</span></div>
      </div>
    </div>`;

  // Блок 2 — NPC окружение
  let npcHTML='';
  if(c.groupMode&&npcs.length){
    const rows=npcs.map(n=>{
      const nrt=RELATION_TYPES[n.relationType||'neutral']||RELATION_TYPES.neutral;
      return `<div class="ls-debug-npc-row">
        <span class="ls-debug-npc-name">${escHtml(n.name)}${n.nameEn&&n.nameEn!==n.name?' <span style="opacity:.4;font-size:10px;">('+escHtml(n.nameEn)+')</span>':''}</span>
        <span class="ls-debug-npc-rt" style="color:${nrt.color};">${escHtml(nrt.label)}</span>
        <span class="ls-debug-npc-score" style="color:${n.score<0?'#4ec900':nrt.color};">${n.score}/${n.maxScore}</span>
      </div>`;
    }).join('');
    npcHTML=`<div class="ls-debug-block">
      <div class="ls-debug-label"><i class="fa-solid fa-users"></i> Окружение (${npcs.length} NPC)</div>
      <div class="ls-debug-npc-state">${rows}</div>
    </div>`;
  } else if(c.groupMode){
    npcHTML=`<div class="ls-debug-block"><div class="ls-debug-label"><i class="fa-solid fa-users"></i> Окружение</div><div style="font-size:11px;opacity:.3;padding:4px;">Нет NPC в текущем чате</div></div>`;
  }

  // Блок 3 — теги для AI
  const tagsHTML=`<div class="ls-debug-block">
    <div class="ls-debug-label"><i class="fa-solid fa-tags"></i> Теги в ответах AI <button class="menu_button ls-debug-copy" id="ls-debug-copy-tags" title="Скопировать"><i class="fa-solid fa-copy"></i></button></div>
    <pre id="ls-debug-tags-text" style="font-size:10px;line-height:1.8;padding:8px;background:rgba(0,0,0,.3);border-radius:5px;border:1px solid rgba(255,255,255,.06);overflow-x:auto;color:rgba(160,220,255,.85);">${escHtml(
      '<!-- [LOVE_SCORE:X] -->              — обновить счёт главного героя\n'
      +'<!-- [RELATION_TYPE:key] -->          — установить тип отношений\n'
      +'<!-- [MILESTONE:threshold] -->        — отметить романтическое событие выполненным\n'
      +(c.groupMode&&npcs.length
        ?'\n=== NPC Окружение ===\n'
          +'<!-- [NPC_SCORE:EnName:X] -->         — обновить счёт NPC\n'
          +'<!-- [NPC_TYPE:EnName:key] -->         — установить тип отношений NPC\n'
          +'\nДоступные типы: '+Object.keys(RELATION_TYPES).join(' | ')
        :'')
    )}</pre>
  </div>`;

  // Блок 4 — полный промпт инжект
  const promptHTML=`<div class="ls-debug-block">
    <div class="ls-debug-label"><i class="fa-solid fa-code"></i> Текущий промпт-инжект <button class="menu_button ls-debug-copy" id="ls-debug-copy-prompt" title="Скопировать всё"><i class="fa-solid fa-copy"></i></button></div>
    <textarea id="ls-debug-prompt" readonly>${escHtml(prompt)}</textarea>
  </div>`;

  ct.innerHTML=statHTML+npcHTML+tagsHTML+promptHTML;

  document.getElementById('ls-debug-copy-prompt')?.addEventListener('click',()=>{
    navigator.clipboard?.writeText(prompt).then(()=>toast('success','Промпт скопирован')).catch(()=>{});
  });
  document.getElementById('ls-debug-copy-tags')?.addEventListener('click',()=>{
    const tagsEl=document.getElementById('ls-debug-tags-text');
    navigator.clipboard?.writeText(tagsEl?.textContent||'').then(()=>toast('success','Теги скопированы')).catch(()=>{});
  });
}

// ─── Sync UI ──────────────────────────────────────────────────────────────────
function syncUI() {
  const c=cfg(),d=loveData(),el=id=>document.getElementById(id);
  const cb=el('ls-enabled');if(cb) cb.checked=c.isEnabled;
  const v=el('ls-val');if(v) v.value=d.score;
  const m=el('ls-max');if(m) m.value=d.maxScore;
  const gr=el('ls-gradual');if(gr) gr.checked=c.gradualProgression??true;
  const sz=el('ls-size'),lb=el('ls-size-label');if(sz){sz.value=c.widgetSize||64;if(lb) lb.textContent=(c.widgetSize||64)+'px';}
  const rRu=el('ls-lang-ru'),rEn=el('ls-lang-en'),lang=c.genLang||'ru';
  if(rRu) rRu.checked=lang==='ru';if(rEn) rEn.checked=lang==='en';
  const nt=el('ls-gen-notes');if(nt&&document.activeElement!==nt) nt.value=c.genUserNotes||'';
  // Скоуп
  const sc=c.genScope||defaultSettings.genScope;
  const scMap={'ls-scope-changes':'changes','ls-scope-pos-ranges':'positiveRanges','ls-scope-neg-ranges':'negativeRanges','ls-scope-milestones':'milestones','ls-scope-max':'suggestedMax'};
  Object.entries(scMap).forEach(([id,key])=>{const e=el(id);if(e) e.checked=sc[key]??true;});
  // Тип отношений
  const _rtd=d.relationType||'neutral';
  document.querySelectorAll('.ls-rel-type-btn').forEach(b=>b.classList.toggle('ls-rt-active',b.dataset.rt===_rtd));
  const _rtlbl=el('ls-rt-label');if(_rtlbl) _rtlbl.textContent=RELATION_TYPES[_rtd]?.label||'';
  // Стиль сердца
  const hsStyle=c.heartStyle||'svg';
  document.querySelectorAll('input[name="ls-heart-style"]').forEach(r=>r.checked=(r.value===hsStyle));
  // Авто-подсказки
  const asEn=el('ls-autosuggest-enabled');if(asEn) asEn.checked=c.autoSuggestEnabled||false;
  const asInt=el('ls-autosuggest-interval');if(asInt) asInt.value=c.autoSuggestInterval||20;
  updateCharPreview(getCurrentCharacterCard());
  renderChanges();renderInterps();renderMilestones();renderScoreLog();renderPresets();
  if(cfg().groupMode) renderGroupNpcs();
  _updateGenLbCounter();
  _syncSourceCards();
  refreshWidget();
}

// ─── Основные события ─────────────────────────────────────────────────────────
function bindMainEvents() {
  $('#ls-enabled').off('change').on('change',function(){
    cfg().isEnabled=this.checked;
    cfg()._savedEnabled=this.checked; // явный флаг — не теряется при сериализации
    saveSettingsDebounced();updatePromptInjection();refreshWidget();
  });
  $('#ls-val').off('change').on('change',function(){
    const d=loveData(),prev=d.score;
    d.score=Math.max(MIN_SCORE,Math.min(parseInt(this.value)||0,d.maxScore));
    const delta=d.score-prev;if(delta!==0){addToLog(d,delta,'вручную');renderScoreLog();}
    saveSettingsDebounced();updatePromptInjection();refreshWidget();renderInterps();renderMilestones();
  });
  $('#ls-max').off('change').on('change',function(){
    const d=loveData(),c=cfg();d.maxScore=Math.max(1,parseInt(this.value)||100);c.maxScore=d.maxScore;
    if(d.score>d.maxScore) d.score=d.maxScore;saveSettingsDebounced();updatePromptInjection();refreshWidget();
  });
  $('#ls-reset-btn').off('click').on('click',()=>{loveData().score=0;saveSettingsDebounced();pulseWidget();syncUI();updatePromptInjection();});
  $('#ls-gradual').off('change').on('change',function(){cfg().gradualProgression=this.checked;saveSettingsDebounced();updatePromptInjection();});
  $(document).off('click','#ls-log-clear').on('click','#ls-log-clear',()=>{loveData().scoreLog=[];saveSettingsDebounced();renderScoreLog();});
  $(document).off('input','#ls-size').on('input','#ls-size',function(){
    const sz=parseInt(this.value),lb=document.getElementById('ls-size-label');if(lb) lb.textContent=sz+'px';
    applyWidgetSize(sz);cfg().widgetSize=sz;saveSettingsDebounced();refreshWidget();
  });
  $(document).off('click','#ls-reset-pos').on('click','#ls-reset-pos',()=>{
    cfg().widgetPos=null;saveSettingsDebounced();
    const w=document.getElementById('ls-widget');if(w){w.style.top='100px';w.style.bottom='auto';w.style.left='18px';w.style.right='auto';}
    toast('info','Позиция сброшена');
  });

  // Стиль сердца
  $(document).off('change','input[name="ls-heart-style"]').on('change','input[name="ls-heart-style"]',function(){
    cfg().heartStyle=this.value;saveSettingsDebounced();refreshWidget();
    toast('info', this.value==='blur' ? 'Размытое сердце' : 'SVG сердце с заливкой');
  });

  // Тип отношений — клик = инфо + кнопка Применить
  $(document).off('click','.ls-rel-type-btn').on('click','.ls-rel-type-btn',function(){
    const k=this.dataset.rt,t=RELATION_TYPES[k],info=document.getElementById('ls-type-info');
    if(!info||!t) return;
    if(info.dataset.showing===k){info.style.display='none';info.dataset.showing='';return;}
    info.dataset.showing=k;
    const isActive=loveData().relationType===k;
    info.innerHTML=`<span style="color:${t.color};font-weight:600;">${escHtml(t.label)}</span> — <span style="opacity:.7;">${escHtml(t.desc)}</span>`
      +(isActive
        ?'<div style="font-size:10px;opacity:.4;margin-top:4px;">Текущий тип</div>'
        :`<button class="menu_button" style="margin-top:6px;width:100%;font-size:11px;" id="ls-set-rt" data-rt="${k}"><i class="fa-solid fa-check" style="margin-right:4px;"></i>Применить</button>`);
    info.style.display='block';
    document.getElementById('ls-set-rt')?.addEventListener('click',function(){
      const d=loveData(),wasHostile=d.relationType==='hostile';
      d.relationType=this.dataset.rt;
      saveSettingsDebounced();updatePromptInjection();
      const isHostile=this.dataset.rt==='hostile';
      if(wasHostile!==isHostile) flipWidget(); else pulseWidget();
      syncUI();
      toast('success','Тип: '+RELATION_TYPES[this.dataset.rt]?.label);
    });
  });

  // AI
  $(document).off('input','#ls-gen-endpoint').on('input','#ls-gen-endpoint',function(){cfg().genEndpoint=this.value;saveSettingsDebounced();});
  $(document).off('input','#ls-gen-apikey').on('input','#ls-gen-apikey',function(){cfg().genApiKey=this.value;saveSettingsDebounced();});
  $(document).off('input','#ls-gen-notes').on('input','#ls-gen-notes',function(){cfg().genUserNotes=this.value;saveSettingsDebounced();});
  $(document).off('change','#ls-gen-model-select').on('change','#ls-gen-model-select',function(){cfg().genModel=this.value;saveSettingsDebounced();});
  $(document).off('change','input[name=ls-lang]').on('change','input[name=ls-lang]',function(){cfg().genLang=this.value;saveSettingsDebounced();});
  const scMap={'#ls-scope-changes':'changes','#ls-scope-pos-ranges':'positiveRanges','#ls-scope-neg-ranges':'negativeRanges','#ls-scope-milestones':'milestones','#ls-scope-max':'suggestedMax'};
  Object.entries(scMap).forEach(([sel,key])=>{
    $(document).off('change',sel).on('change',sel,function(){
      if(!cfg().genScope) cfg().genScope={...defaultSettings.genScope};
      cfg().genScope[key]=this.checked;saveSettingsDebounced();
    });
  });
  $(document).off('click','#ls-refresh-models').on('click','#ls-refresh-models',onRefreshModels);
  $(document).off('click','#ls-gen-btn').on('click','#ls-gen-btn',onGenerateClick);
  $(document).off('change','#ls-gen-msg-count').on('change','#ls-gen-msg-count',function(){cfg().chatAnalysisMsgCount=parseInt(this.value)||0;saveSettingsDebounced();});
  $(document).off('click','#ls-analyze-btn').on('click','#ls-analyze-btn',onAnalyzeClick);

  // ── Источник данных: карточка ──
  $(document).off('change','#ls-gen-use-card').on('change','#ls-gen-use-card',function(){
    cfg().genUseCard=this.checked; saveSettingsDebounced(); _syncSourceCards();
    toast('info', this.checked ? 'Карточка включена' : 'Карточка отключена');
  });

  // ── Источник данных: лорбук-карточка (клик открывает пикер) ──
  $(document).off('click','#ls-src-lb-label').on('click','#ls-src-lb-label',function(ev){
    ev.preventDefault();
    const panel = document.getElementById('ls-gen-lb-panel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
      panel.style.display = 'none';
      this.classList.remove('ls-source-card-open');
    } else {
      panel.style.display = 'block';
      this.classList.add('ls-source-card-open');
      renderGenLorebookPicker();
    }
  });

  // ── Кнопки внутри пикера ──
  $(document).off('click','#ls-gen-lb-close').on('click','#ls-gen-lb-close',function(){
    const panel=document.getElementById('ls-gen-lb-panel');
    const lbLbl=document.getElementById('ls-src-lb-label');
    if(panel) panel.style.display='none';
    if(lbLbl) lbLbl.classList.remove('ls-source-card-open');
  });
  $(document).off('click','#ls-gen-lb-refresh').on('click','#ls-gen-lb-refresh',function(){
    renderGenLorebookPicker(); toast('info','Список обновлён');
  });

  // Авто-подсказки
  $(document).off('change','#ls-autosuggest-enabled').on('change','#ls-autosuggest-enabled',function(){
    cfg().autoSuggestEnabled=this.checked; cfg()._autoSuggestMsgCounter=0; saveSettingsDebounced();
    toast('info', this.checked?'Авто-регенерация включена':'Авто-регенерация выключена');
  });
  $(document).off('change','#ls-autosuggest-interval').on('change','#ls-autosuggest-interval',function(){
    cfg().autoSuggestInterval=Math.max(5,parseInt(this.value)||20); saveSettingsDebounced();
  });
  $(document).off('click','#ls-autosuggest-now').on('click','#ls-autosuggest-now',()=>{
    const btn=document.getElementById('ls-autosuggest-now');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>';}
    autoRegenAll().finally(()=>{if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-rotate"></i>';}});
  });

  // Пресеты
  $(document).off('click','#ls-preset-save').on('click','#ls-preset-save',()=>{
    const inp=document.getElementById('ls-preset-name-input');savePreset(inp?.value||'');if(inp) inp.value='';
  });
  $(document).off('click','#ls-preset-import-file-btn').on('click','#ls-preset-import-file-btn',()=>{
    document.getElementById('ls-preset-file-input')?.click();
  });
  $(document).off('change','#ls-preset-file-input').on('change','#ls-preset-file-input',function(){
    const file=this.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{ importPresetFromJSON(e.target.result); this.value=''; };
    reader.readAsText(file,'utf-8');
  });

  // Окружение NPC
  $(document).off('change','#ls-group-enabled').on('change','#ls-group-enabled',function(){
    cfg().groupMode=this.checked;
    saveSettingsDebounced();updatePromptInjection();
    const body=document.getElementById('ls-group-body');
    if(body){body.style.display=this.checked?'':'none';}
    if(this.checked) renderGroupNpcs();
    toast('info',this.checked?'Режим окружения включён':'Режим окружения выключен');
  });
  $(document).off('click','#ls-npc-from-lorebook').on('click','#ls-npc-from-lorebook',function(){
    const panel=document.getElementById('ls-lorebook-picker');
    if(!panel) return;
    const isOpen=panel.style.display!=='none';
    if(isOpen){ panel.style.display='none'; return; }
    panel.style.display='block';
    renderLorebookPicker();
  });
  $(document).off('click','#ls-lb-close').on('click','#ls-lb-close',function(){
    const panel=document.getElementById('ls-lorebook-picker');
    if(panel) panel.style.display='none';
  });
  $(document).off('click','#ls-npc-add-manual').on('click','#ls-npc-add-manual',function(){
    const d=chatLoveData(); if(!d.groupNpcs) d.groupNpcs=[];
    d.groupNpcs.push(mkNpc({name:'Новый NPC'}));
    saveGroupNpcs();renderGroupNpcs();
  });
  $(document).off('click','#ls-npc-scan-chat').on('click','#ls-npc-scan-chat',function(){
    scanChatForNpcs();
  });
  // Открытие аккордеона группы
  $(document).off('click','#ls-acc-group .inline-drawer-toggle').on('click','#ls-acc-group .inline-drawer-toggle',function(){
    setTimeout(()=>{ if(cfg().groupMode) renderGroupNpcs(); },50);
  });
  // Открытие отладки — рендерим содержимое
  $(document).off('click','#ls-acc-debug .inline-drawer-toggle').on('click','#ls-acc-debug .inline-drawer-toggle',function(){
    setTimeout(renderDebug, 80);
  });
  $(document).off('click','#ls-debug-refresh-btn').on('click','#ls-debug-refresh-btn',renderDebug);
}

// ─── Инициализация ────────────────────────────────────────────────────────────
jQuery(()=>{
  try {
    if(!extension_settings[EXT_NAME]) extension_settings[EXT_NAME]=structuredClone(defaultSettings);
    const c=cfg();
    const _savedEnabled = c.isEnabled; // сохраняем ДО того как цикл может затронуть
    for(const [k,v] of Object.entries(defaultSettings)) if(k!=='isEnabled'&&c[k]===undefined) c[k]=structuredClone(v);
    // isEnabled: если было явно сохранено false — оставляем false, иначе true по умолчанию
    c.isEnabled = (_savedEnabled===false) ? false : true;
    if(c.widgetPos&&c.widgetPos.top==null) c.widgetPos=null;
    if(!c.presets) c.presets=[];
    if(!c.genScope) c.genScope={...defaultSettings.genScope};
    if(!c.heartStyle) c.heartStyle='svg';
    if(!c.groupNpcs) c.groupNpcs=[];
    if(c.groupMode==null) c.groupMode=false;
    if(!c.genLorebookEntryIds) c.genLorebookEntryIds=[];
    if(c.genUseCard==null) c.genUseCard=true;

    $('#extensions_settings').append(settingsPanelHTML());
    createWidget(); bindMainEvents(); syncUI(); updatePromptInjection();

    eventSource.on(event_types.MESSAGE_SENT,()=>updatePromptInjection());
    eventSource.on(event_types.MESSAGE_RECEIVED,onMessageReceived);

    if(event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED,()=>{
      cfg().lastCheckedMessageId=null;
      cfg()._autoSuggestMsgCounter=0;
      const _ar=document.getElementById('ls-analyze-result');
      if(_ar){_ar.style.display='none';_ar.innerHTML='';}
      const _as=document.getElementById('ls-analyze-status');
      if(_as) _as.textContent='';
      const _ti=document.getElementById('ls-type-info');
      if(_ti){_ti.style.display='none';_ti.dataset.showing='';}
      const _sug=document.getElementById('ls-autosuggest-result');
      if(_sug){_sug.style.display='none';_sug.innerHTML='';}
      syncUI();updatePromptInjection();
    });
  } catch(e){ toast('error','Love Score: ошибка инициализации — '+e.message); }
});
