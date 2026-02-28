import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXT_NAME  = 'love-score';
const PROMPT_KEY = EXT_NAME + '_injection';
const MIN_SCORE  = -100;

const defaultSettings = {
  isEnabled: true, maxScore: 100, gradualProgression: true,
  widgetPos: null, widgetSize: 64,
  lastCheckedMessageId: null, chatLoveData: {},
  genEndpoint: '', genApiKey: '', genModel: '', genLang: 'ru', genUserNotes: '',
  genScope: { changes: true, positiveRanges: true, negativeRanges: true, milestones: true, suggestedMax: true },
  presets: []
};

const mkLoveData = () => ({
  score: 0, maxScore: 100, scoreLog: [],
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
  return d;
}

// Всегда текущий чат — для промпта и виджета
function chatLoveData() {
  const c = cfg();
  if (!c.chatLoveData) c.chatLoveData = {};
  const id = getChatId();
  if (!c.chatLoveData[id]) c.chatLoveData[id] = mkLoveData();
  return ensureLDFields(c.chatLoveData[id]);
}

function loveData() {
  return chatLoveData();
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
  if (score >= 0) {
    const r = score / max;
    if (r >= 0.85) return '#e8003d';
    if (r >= 0.65) return '#ff2d55';
    if (r >= 0.45) return '#ff6b8a';
    if (r >= 0.25) return '#ff9eb5';
    if (r > 0)     return '#ffc8d5';
    return 'transparent';
  } else {
    const r = Math.abs(score) / 100;
    if (r >= 0.90) return '#050f00';
    if (r >= 0.75) return '#0d2200';
    if (r >= 0.55) return '#1a4a00';
    if (r >= 0.35) return '#2e8b00';
    if (r >= 0.15) return '#4ec900';
    return '#7fff00';
  }
}

function heartStroke(score) {
  if (score >= 0) return 'rgba(255,90,120,.45)';
  const r = Math.abs(score) / 100;
  if (r >= 0.75) return 'rgba(5,25,0,.95)';
  if (r >= 0.40) return 'rgba(20,90,0,.85)';
  return 'rgba(80,200,0,.6)';
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
    if (sections.changes)  d.scoreChanges         = JSON.parse(JSON.stringify(src.scoreChanges         || []));
    if (sections.ranges)   d.scaleInterpretations = JSON.parse(JSON.stringify(src.scaleInterpretations || []));
    if (sections.milestones) d.milestones         = JSON.parse(JSON.stringify(src.milestones           || []));
    if (sections.maxScore) { d.maxScore = src.maxScore || d.maxScore; cfg().maxScore = d.maxScore; }
  } else {
    if (sections.changes) {
      const existing = new Set(d.scoreChanges.map(x => x.delta + '|' + x.description));
      (src.scoreChanges || []).forEach(x => { if (!existing.has(x.delta + '|' + x.description)) d.scoreChanges.push(JSON.parse(JSON.stringify(x))); });
    }
    if (sections.ranges) {
      const existing = new Set(d.scaleInterpretations.map(x => x.min + '|' + x.max));
      (src.scaleInterpretations || []).forEach(x => { if (!existing.has(x.min + '|' + x.max)) d.scaleInterpretations.push(JSON.parse(JSON.stringify(x))); });
    }
    if (sections.milestones) {
      const existing = new Set(d.milestones.map(x => x.threshold));
      (src.milestones || []).forEach(x => { if (!existing.has(x.threshold)) d.milestones.push(JSON.parse(JSON.stringify(x))); });
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
  const json = JSON.stringify(src, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'ls-preset-' + (src.name || 'preset').replace(/[^a-zа-яё0-9_-]/gi, '_').slice(0, 40) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('success', 'Скачиваю «' + (src.name || 'preset') + '.json»');
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
    saveSettingsDebounced();
    renderPresets();
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
  saveSettingsDebounced();
  renderPresets();
}

function injectStyles() {
  if (document.getElementById('ls-styles')) return;
  const el = document.createElement('style');
  el.id = 'ls-styles';
  el.textContent = `
#ls-widget {
  position:fixed;top:100px;left:18px;bottom:auto;right:auto;
  width:64px;height:60px;cursor:grab;z-index:999999;
  user-select:none;touch-action:none;
  filter:drop-shadow(0 4px 14px rgba(255,60,100,.35));
  transition:filter .2s ease,transform .35s ease;
}
#ls-widget:hover{filter:drop-shadow(0 6px 22px rgba(255,60,100,.6));}
#ls-widget.ls-neg{filter:drop-shadow(0 4px 14px rgba(60,220,60,.4));}
#ls-widget.ls-neg:hover{filter:drop-shadow(0 6px 22px rgba(60,255,60,.75));}
#ls-widget:active{cursor:grabbing;}
#ls-widget.ls-beat{animation:ls-hb .55s cubic-bezier(.36,1.8,.5,1) forwards;}
#ls-widget.ls-flip{animation:ls-flip-anim .55s ease forwards;}
@keyframes ls-hb{0%{transform:scale(1)}40%{transform:scale(1.30)}70%{transform:scale(.92)}100%{transform:scale(1)}}
@keyframes ls-flip-anim{0%{transform:scaleY(1)}35%{transform:scaleY(0) scale(1.15)}65%{transform:scaleY(0) scale(1.15)}100%{transform:scaleY(1)}}
#ls-heart-fill{transition:y .6s ease,height .6s ease,fill .5s ease;}
#ls-status-tip{
  position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);
  background:var(--black-tint-5,rgba(18,18,22,.97));
  border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:6px;
  padding:6px 10px;font-size:11px;color:var(--SmartThemeBodyColor,#ccc);
  pointer-events:none;opacity:0;white-space:normal;text-align:center;
  max-width:190px;min-width:90px;transition:opacity .18s ease;z-index:1000000;line-height:1.5;
}
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
/* Preset box */
#ls-preset-box{margin-top:10px;padding:10px;border-radius:6px;border:1px solid var(--border-color,rgba(255,255,255,.1));}
#ls-preset-box .ls-section-title{margin-top:0;margin-bottom:8px;}
.ls-preset-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;padding:7px 9px;border-radius:5px;background:var(--input-background-fill,rgba(255,255,255,.02));border:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-preset-row.ls-preset-snap{border-left:3px solid rgba(100,180,100,.35);opacity:.7;}
.ls-preset-info{flex:1;min-width:0;}
.ls-preset-name{font-size:12px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ls-preset-meta{font-size:10px;opacity:.35;margin-top:1px;}
.ls-preset-actions{display:flex;gap:4px;flex-shrink:0;}
.ls-preset-btn{padding:3px 7px!important;min-width:unset!important;font-size:11px!important;}
/* Load mode */
#ls-load-mode-box{padding:8px;border-radius:5px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.08));margin-bottom:8px;}
.ls-load-mode-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px;}
.ls-load-checks{display:flex;gap:8px;flex-wrap:wrap;}
/* AI box */
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
.ls-scope-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-bottom:8px;}
.ls-scope-item{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--SmartThemeBodyColor,#ccc);}
#ls-char-preview{display:flex;align-items:center;gap:10px;padding:8px 10px;margin:8px 0 4px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.08));}
#ls-char-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--border-color,rgba(255,255,255,.2));flex-shrink:0;background:var(--input-background-fill,rgba(255,255,255,.06));transition:opacity .2s;box-shadow:0 2px 10px rgba(0,0,0,.4);}
#ls-char-avatar.ls-avatar-hidden{display:none;}
#ls-char-avatar-name{font-size:13px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;}
#ls-gen-btn{width:100%;margin-top:4px;}
#ls-gen-status{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.6;margin-top:5px;min-height:15px;line-height:1.4;}
#ls-score-log{margin-top:4px;}
.ls-log-clear{padding:2px 8px!important;min-width:unset!important;font-size:10px!important;opacity:.4;}
.ls-log-clear:hover{opacity:.8;}
`;
  document.head.appendChild(el);
}

function buildHeartSVG(score, max) {
  const isNeg = score < 0;
  const P = 'M50,85 C50,85 8,58 8,32 C8,16 20,6 34,6 C43,6 49,11 50,16 C51,11 57,6 66,6 C80,6 92,16 92,32 C92,58 50,85 50,85 Z';
  const col = heartColor(score, max), stroke = heartStroke(score);
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
    + '<defs><clipPath id="ls-hclip"><path ' + tr + ' d="' + P + '"/></clipPath></defs>'
    + '<path ' + tr + ' d="' + P + '" fill="rgba(22,10,16,.88)" stroke="' + stroke + '" stroke-width="2.5"/>'
    + '<rect id="ls-heart-fill" x="0" y="' + fillY + '" width="100" height="' + fillH + '" clip-path="url(#ls-hclip)" fill="' + col + '" opacity="0.92"/>'
    + '<text id="ls-score-main" x="50" y="43" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="' + fs + '" font-weight="700" font-family="system-ui,sans-serif">' + escHtml(String(score)) + '</text>'
    + '<text id="ls-score-denom" x="50" y="62" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,.6)" font-size="10" font-family="system-ui,sans-serif">/' + escHtml(String(max)) + '</text>'
    + '</svg><div id="ls-status-tip"></div>';
}

function applyWidgetSize(sz) {
  const w = document.getElementById('ls-widget'); if (!w) return;
  w.style.width = sz + 'px'; w.style.height = Math.round(sz * 0.94) + 'px';
}

function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

function setWidgetSign(isNeg) {
  const w = document.getElementById('ls-widget'); if (!w) return;
  if (isNeg) w.classList.add('ls-neg'); else w.classList.remove('ls-neg');
}

function createWidget() {
  if (document.getElementById('ls-widget')) return;
  injectStyles();
  const d = loveData(), c = cfg();
  const w = document.createElement('div'); w.id = 'ls-widget';
  w.innerHTML = buildHeartSVG(d.score, d.maxScore);
  document.body.appendChild(w);
  const sz = c.widgetSize || 64; applyWidgetSize(sz); setWidgetSign(d.score < 0);
  if (c.widgetPos?.top != null) {
    const st = parseFloat(c.widgetPos.top), sl = parseFloat(c.widgetPos.left);
    w.style.top  = clamp(isNaN(st) ? 100 : st, 8, window.innerHeight - Math.round(sz*.94) - 8) + 'px';
    w.style.left = clamp(isNaN(sl) ?  18 : sl, 8, window.innerWidth  - sz - 8) + 'px';
    w.style.bottom = 'auto'; w.style.right = 'auto';
  }
  makeDraggable(w);
}

function makeDraggable(w) {
  let drag = false, moved = false, grabX = 0, grabY = 0;
  w.addEventListener('pointerdown', e => {
    const r = w.getBoundingClientRect(); grabX = e.clientX-r.left; grabY = e.clientY-r.top;
    drag = true; moved = false; w.setPointerCapture(e.pointerId);
    w.style.transition = 'none';
    w.style.filter = loveData().score < 0
      ? 'drop-shadow(0 8px 28px rgba(60,255,60,.8))'
      : 'drop-shadow(0 8px 28px rgba(255,60,100,.7))';
    e.preventDefault();
  });
  w.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = Math.abs(e.clientX - (w.getBoundingClientRect().left + grabX));
    const dy = Math.abs(e.clientY - (w.getBoundingClientRect().top  + grabY));
    if (!moved && (dx > 4 || dy > 4)) moved = true;
    if (!moved) return;
    w.style.left = clamp(e.clientX-grabX, 8, window.innerWidth -w.offsetWidth -8) + 'px'; w.style.right  = 'auto';
    w.style.top  = clamp(e.clientY-grabY, 8, window.innerHeight-w.offsetHeight-8) + 'px'; w.style.bottom = 'auto';
    e.preventDefault();
  });
  w.addEventListener('pointerup', () => {
    if (!drag) return; drag = false;
    w.style.transition = 'filter .2s ease,transform .35s ease'; w.style.filter = '';
    if (moved) { cfg().widgetPos = { top: w.style.top, left: w.style.left }; saveSettingsDebounced(); }
  });
}

function refreshWidget() {
  const c = cfg(), d = chatLoveData(), w = document.getElementById('ls-widget'); if (!w) return;
  w.style.display = c.isEnabled ? 'block' : 'none';
  setWidgetSign(d.score < 0);
  const fill = document.getElementById('ls-heart-fill');
  const main = document.getElementById('ls-score-main');
  const denom= document.getElementById('ls-score-denom');
  if (fill && main && denom) {
    const isNeg = d.score < 0;
    let fillY, fillH;
    if (!isNeg) { const r = Math.max(0,Math.min(1,d.score/d.maxScore)); fillY=(95*(1-r)).toFixed(2); fillH=(95*r).toFixed(2); }
    else { const r=Math.max(0,Math.min(1,Math.abs(d.score)/100)); fillY='0'; fillH=(95*r).toFixed(2); }
    fill.setAttribute('y', fillY); fill.setAttribute('height', fillH);
    fill.setAttribute('fill', heartColor(d.score, d.maxScore));
    main.textContent = String(d.score); main.setAttribute('font-size', Math.abs(d.score)>=100?'13':'17');
    denom.textContent = '/' + d.maxScore;
    // Пересборка SVG если знак изменился
    const path = w.querySelector('path');
    const isRotated = path?.getAttribute('transform')?.includes('rotate') ?? false;
    if ((isNeg && !isRotated) || (!isNeg && isRotated)) w.innerHTML = buildHeartSVG(d.score, d.maxScore);
  } else {
    w.innerHTML = buildHeartSVG(d.score, d.maxScore);
  }
  const tip = document.getElementById('ls-status-tip');
  if (tip) tip.textContent = getActiveInterp()?.description?.trim() || (d.score + ' / ' + d.maxScore);
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
function getCharacterList() {
  try { const ctx=SillyTavern?.getContext?.(); if(!ctx||!Array.isArray(ctx.characters)) return []; return ctx.characters.map((ch,i)=>({index:i,name:ch.name||('Персонаж '+i)})); } catch { return []; }
}
function getCurrentCharacterCard() {
  try { const ctx=SillyTavern?.getContext?.(); if(!ctx) return null; if(ctx.characterId!==undefined&&Array.isArray(ctx.characters)) return ctx.characters[ctx.characterId]??null; if(Array.isArray(ctx.characters)&&ctx.characters.length>0) return ctx.characters[0]; } catch {} return null;
}
function getCharacterByIndex(idx) {
  try { const ctx=SillyTavern?.getContext?.(); if(!ctx||!Array.isArray(ctx.characters)) return null; return ctx.characters[idx]??null; } catch { return null; }
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

// ─── Получение скоупа из UI ───────────────────────────────────────────────────
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

async function generateLoveScoreWithAI(charCard, scope) {
  const c=cfg(),base=getBaseUrl(),apiKey=(c.genApiKey||'').trim(),model=(c.genModel||'').trim()||'gpt-4o';
  if(!base)   throw new Error('Укажи Endpoint');
  if(!apiKey) throw new Error('Укажи API Key');
  const d=loveData(),maxScore=d.maxScore||100;
  const lang=c.genLang||'ru',langLabel=lang==='ru'?'Russian':'English';
  const userNotes=(c.genUserNotes||'').trim();
  const systemMsg='You are configuring a Love Score system for a text-based RPG. Reply with ONLY valid JSON — no explanations, no markdown, no code blocks.';

  // Формируем только нужные секции в ответе
  const wantChanges  = scope.changes;
  const wantPosRange = scope.positiveRanges;
  const wantNegRange = scope.negativeRanges;
  const wantMs       = scope.milestones;
  const wantMax      = scope.suggestedMax;

  let schemaLines = ['{'];
  if(wantMax)                         schemaLines.push('  "suggestedMax": '+maxScore+',');
  if(wantChanges)                     schemaLines.push('  "changes": [{"delta": 2, "text": "..."},{"delta": -10, "text": "..."}],');
  if(wantPosRange||wantNegRange) {
    const ex=[];
    if(wantNegRange) ex.push('{"min": -100, "max": -1, "text": "..."}');
    if(wantPosRange) ex.push('{"min": 0, "max": 20, "text": "..."}');
    schemaLines.push('  "ranges": ['+ex.join(',')+'],');
  }
  if(wantMs)                          schemaLines.push('  "milestones": [{"threshold": 15, "text": "..."}]');
  schemaLines.push('}');

  let rulesLines = ['RULES:'];
  if(wantChanges)  rulesLines.push('- changes: at least 6 items with varied positive and negative deltas');
  if(wantNegRange) rulesLines.push('- negative ranges (min:'+MIN_SCORE+' to max:-1): describe hostility, hatred, fear — no gaps');
  if(wantPosRange) rulesLines.push('- positive ranges (min:0 to max:'+maxScore+'): describe attraction and love — no gaps');
  if(wantMs)       rulesLines.push('- milestones: at least 5 POSITIVE thresholds only, ordered ascending');
  if(wantMax)      rulesLines.push('- suggestedMax: suggest higher max (200-300) for cold/distant characters');
  rulesLines.push('- All text in '+langLabel);
  if(userNotes)    rulesLines.push('','SPECIAL USER INSTRUCTIONS (priority):', userNotes);

  const omitNote = (!wantChanges||!wantPosRange||!wantNegRange||!wantMs)
    ? 'NOTE: Only generate the fields listed in the schema. Omit everything else.' : '';

  const userMsg=[
    'Analyze the character card and generate love score rules.',
    'Score range: '+MIN_SCORE+' to '+maxScore+'. Negative = hostility/hatred. Positive = love/affection.',
    '','CHARACTER CARD:',charCard,'',
    omitNote,
    'Reply with STRICTLY valid JSON matching this schema exactly:',
    ...schemaLines,'',
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
    const cleaned=raw.replace(/^```[\w]*\n?/gm,'').replace(/```$/gm,'').trim();
    const p=JSON.parse(cleaned);
    const changes   =(p.changes   ||[]).filter(x=>typeof x.delta==='number'&&x.text).map(x=>({delta:x.delta,description:String(x.text).trim()}));
    const ranges    =(p.ranges    ||[]).filter(x=>typeof x.min==='number'&&typeof x.max==='number'&&x.text).map(x=>({min:x.min,max:x.max,description:String(x.text).trim()}));
    const milestones=(p.milestones||[]).filter(x=>typeof x.threshold==='number'&&x.text).sort((a,b)=>a.threshold-b.threshold).map(x=>({threshold:x.threshold,description:String(x.text).trim(),done:false}));
    return {changes,ranges,milestones,suggestedMax:p.suggestedMax||null,ok:true};
  } catch { return {changes:[],ranges:[],milestones:[],suggestedMax:null,ok:false}; }
}

async function onGenerateClick() {
  const btn=document.getElementById('ls-gen-btn'),status=document.getElementById('ls-gen-status');
  if(!btn||!status) return;
  btn.disabled=true; btn.textContent='Генерирую...'; status.textContent='Обращаюсь к API...';
  try {
    const scope=getScopeFromUI();
    if(!scope.changes&&!scope.positiveRanges&&!scope.negativeRanges&&!scope.milestones){
      status.textContent='Выбери хотя бы одну секцию для генерации.'; return;
    }
    // Авто-снапшот
    autoSnapshot('До генерации');
    const char=getCurrentCharacterCard();
    if(!char){status.textContent='Персонаж не найден. Открой чат с персонажем.';return;}
    const cardText=buildCharacterCardText(char);
    if(!cardText.trim()){status.textContent='Карточка персонажа пустая.';return;}
    status.textContent='Генерирую для: '+(char.name||'персонаж')+'...';
    const raw=await generateLoveScoreWithAI(cardText,scope),parsed=parseAIResponse(raw);
    if(!parsed.ok){status.textContent='Ошибка разбора: '+raw.slice(0,120);return;}
    const d=loveData();
    if(parsed.changes.length>0   &&scope.changes)                     d.scoreChanges=parsed.changes;
    if(parsed.ranges.length>0    &&(scope.positiveRanges||scope.negativeRanges)) {
      if(scope.positiveRanges&&scope.negativeRanges) {
        d.scaleInterpretations=parsed.ranges;
      } else if(scope.positiveRanges) {
        d.scaleInterpretations=[...d.scaleInterpretations.filter(x=>x.max<0),...parsed.ranges.filter(x=>x.min>=0)];
      } else {
        d.scaleInterpretations=[...parsed.ranges.filter(x=>x.max<0),...d.scaleInterpretations.filter(x=>x.min>=0)];
      }
    }
    if(parsed.milestones?.length>0&&scope.milestones) d.milestones=parsed.milestones;
    if(parsed.suggestedMax&&scope.suggestedMax&&parsed.suggestedMax!==d.maxScore){
      d.maxScore=parsed.suggestedMax; cfg().maxScore=parsed.suggestedMax;
      toast('info','Максимум изменён на '+parsed.suggestedMax);
    }
    saveSettingsDebounced(); updatePromptInjection(); syncUI();
    status.textContent='Готово. Правил: '+parsed.changes.length+', диапазонов: '+parsed.ranges.length+', событий: '+parsed.milestones.length;
    toast('success','Сгенерировано для '+(char.name||'персонаж'));
  } catch(e){ status.textContent='Ошибка: '+(e.message||e); toast('error',e.message||e); }
  finally { btn.disabled=false; btn.textContent='Сгенерировать'; }
}

// ─── Score Log ───────────────────────────────────────────────────────────────
function renderScoreLog() {
  const ct=document.getElementById('ls-score-log'); if(!ct) return;
  const log=(loveData().scoreLog||[]);
  if(!log.length){ct.innerHTML='<div style="font-size:11px;opacity:.3;padding:5px 6px;">Пока пусто</div>';return;}
  let html='';
  log.forEach(e=>{
    const pos=e.delta>0,neg=e.delta<0;
    const dc=pos?'#6ee86e':neg?'#ff6b6b':'#b0b0b0',bg=pos?'rgba(80,200,80,.07)':neg?'rgba(220,60,60,.07)':'rgba(180,180,180,.04)',bc=pos?'rgba(100,220,100,.4)':neg?'rgba(220,80,80,.4)':'rgba(160,160,160,.2)',arr=pos?'↑':neg?'↓':'→';
    const sig=e.sign||(e.delta>=0?'+'+e.delta:String(e.delta));
    html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:3px;border-radius:5px;background:'+bg+';border-left:3px solid '+bc+';">'
      +'<span style="font-size:13px;font-weight:800;color:'+dc+';min-width:38px;white-space:nowrap;">'+arr+'&thinsp;'+escHtml(sig)+'</span>'
      +((e.reason||'').trim()
        ?'<span style="font-size:11px;line-height:1.4;color:var(--SmartThemeBodyColor,#ccc);opacity:.7;">'+escHtml(e.reason)+'</span>'
        :'<span style="font-size:11px;opacity:.25;font-style:italic;">без описания</span>')
      +'</div>';
  });
  ct.innerHTML=html;
}

// ─── Пресеты UI ──────────────────────────────────────────────────────────────
function renderPresets() {
  const ct=document.getElementById('ls-preset-list'); if(!ct) return;
  const c=cfg(),presets=c.presets||[];
  let html='';
  if(!presets.length) { ct.innerHTML='<div style="font-size:11px;opacity:.3;padding:5px;">Нет сохранённых пресетов</div>'; return; }
  [...presets].reverse().forEach(p=>{
    const isSnap=p.name.startsWith('🔄');
    html+='<div class="ls-preset-row'+(isSnap?' ls-preset-snap':'')+'">'
      +'<div class="ls-preset-info"><div class="ls-preset-name">'+escHtml(p.name)+'</div><div class="ls-preset-meta">'+escHtml(p.createdAt||'')+(p.maxScore?' · макс '+p.maxScore:'')+'</div></div>'
      +'<div class="ls-preset-actions">'
      +'<button class="menu_button ls-preset-btn ls-preset-load" data-id="'+p.id+'">Загрузить</button>'
      +'<button class="menu_button ls-preset-btn ls-preset-export" data-id="'+p.id+'">JSON</button>'
      +'<button class="menu_button ls-preset-btn ls-del-btn ls-preset-del" data-id="'+p.id+'">✕</button>'
      +'</div></div>';
  });
  ct.innerHTML=html;

  $(ct).off('click','.ls-preset-load').on('click','.ls-preset-load',function(){
    const id=$(this).data('id'),p=(cfg().presets||[]).find(x=>x.id===String(id));
    if(p) loadPresetUI(p);
  });
  $(ct).off('click','.ls-preset-export').on('click','.ls-preset-export',function(){
    const id=$(this).data('id'),p=(cfg().presets||[]).find(x=>x.id===String(id));
    if(p) exportPresetJSON(p);
  });
  $(ct).off('click','.ls-preset-del').on('click','.ls-preset-del',function(){
    deletePreset(String($(this).data('id')));
  });
}

// ─── HTML панели ──────────────────────────────────────────────────────────────
function settingsPanelHTML() {
  const c=cfg(),curModel=escHtml(c.genModel||''),curEndpoint=escHtml(c.genEndpoint||'');
  const curKey=escHtml(c.genApiKey||''),lang=c.genLang||'ru',curNotes=escHtml(c.genUserNotes||'');
  const sc=c.genScope||defaultSettings.genScope;
  function chk(id,val,label){ return '<label class="ls-scope-item"><input type="checkbox" id="'+id+'"'+(val?' checked':'')+'> '+label+'</label>'; }
  return '<div id="ls-settings-panel" class="extension-settings">'
    +'<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>&#10084;&#65039; Love Score</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>'
    +'<div class="inline-drawer-content">'

    // Основные
    +'<div class="ls-row"><label class="checkbox_label" for="ls-enabled"><input type="checkbox" id="ls-enabled"><span>Включено</span></label></div>'
    +'<div class="ls-row"><span style="font-size:12px;opacity:.6;">Очки:</span><input id="ls-val" type="number" class="ls-num-input" style="width:72px;"><span style="opacity:.3;">/</span><input id="ls-max" type="number" min="1" class="ls-num-input" style="width:72px;"><button id="ls-reset-btn" class="menu_button">Сбросить</button></div>'
    +'<div class="ls-row"><span style="font-size:12px;opacity:.6;white-space:nowrap;">Размер:</span><input type="range" id="ls-size" min="36" max="128" step="4" class="ls-size-slider" style="flex:1;"><span id="ls-size-label" style="font-size:12px;min-width:36px;text-align:right;opacity:.5;">64px</span><button id="ls-reset-pos" class="menu_button" title="Вернуть в угол">Позиция</button></div>'
    +'<div id="ls-active-state" style="display:none;"><strong>Сейчас:</strong> <span id="ls-active-text"></span></div>'

    // История
    +'<div class="ls-section-title" style="display:flex;align-items:center;justify-content:space-between;">История <button id="ls-log-clear" class="menu_button ls-log-clear">очистить</button></div>'
    +'<div id="ls-score-log"></div>'

    // Пресеты
    +'<div id="ls-preset-box">'
    +'<div class="ls-section-title">Пресеты и шаблоны</div>'
    +'<div class="ls-hint">Сохраняй и загружай наборы правил. Авто-снапшот делается перед каждой генерацией.</div>'
    // Режим загрузки
    +'<div id="ls-load-mode-box">'
    +'<div style="font-size:11px;opacity:.5;margin-bottom:5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">Режим применения</div>'
    +'<div class="ls-load-mode-row">'
    +'<label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-load-mode" value="replace" checked> <span>Заменить</span></label>'
    +'<label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-load-mode" value="merge"> <span>Дополнить</span></label>'
    +'</div>'
    +'<div class="ls-load-checks">'
    +'<label class="ls-scope-item"><input type="checkbox" id="ls-load-changes" checked> Правила</label>'
    +'<label class="ls-scope-item"><input type="checkbox" id="ls-load-ranges" checked> Диапазоны</label>'
    +'<label class="ls-scope-item"><input type="checkbox" id="ls-load-milestones" checked> События</label>'
    +'<label class="ls-scope-item"><input type="checkbox" id="ls-load-maxscore" checked> Макс. очки</label>'
    +'</div>'
    +'</div>'
    // Сохранить пресет
    +'<div class="ls-row" style="margin-top:8px;">'
    +'<input type="text" id="ls-preset-name-input" class="ls-api-field" style="flex:1;" placeholder="Название пресета...">'
    +'<button id="ls-preset-save" class="menu_button" style="white-space:nowrap;">Сохранить</button>'
    +'</div>'
    // Импорт
    +'<div class="ls-row">'
    +'<button id="ls-preset-import-file-btn" class="menu_button"><i class="fa-solid fa-folder-open"></i> Импорт из файла</button>'
    +'<input type="file" id="ls-preset-file-input" accept=".json,application/json" style="display:none;">'
    +'</div>'
    +'<div id="ls-preset-list"></div>'
    +'</div>'

    // AI генерация
    +'<div id="ls-ai-box">'
    +'<div class="ls-section-title">Авто-генерация через ИИ</div>'
    +'<div class="ls-hint">Выбери что генерировать, подключи API и нажми кнопку.</div>'
    // Скоуп
    +'<div style="font-size:11px;opacity:.5;font-weight:600;letter-spacing:.4px;text-transform:uppercase;margin-bottom:5px;">Что генерировать</div>'
    +'<div class="ls-scope-grid">'
    +chk('ls-scope-changes',       sc.changes,        'Правила изменений')
    +chk('ls-scope-pos-ranges',    sc.positiveRanges,  'Диапазоны позитив')
    +chk('ls-scope-neg-ranges',    sc.negativeRanges,  'Диапазоны негатив (-100…-1)')
    +chk('ls-scope-milestones',    sc.milestones,     'Романтические события')
    +chk('ls-scope-max',           sc.suggestedMax,   'Предложить макс. очки')
    +'</div>'
    +'<div class="ls-row" style="margin-bottom:6px;gap:12px;"><span style="font-size:12px;opacity:.6;white-space:nowrap;">Язык:</span>'
    +'<label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-ru" value="ru"'+(lang==='ru'?' checked':'')+'>  <span>Русский</span></label>'
    +'<label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-en" value="en"'+(lang==='en'?' checked':'')+'>  <span>English</span></label>'
    +'</div>'
    +'<label class="ls-api-label">Особые пожелания</label>'
    +'<textarea id="ls-gen-notes" class="ls-api-field" rows="2" placeholder="Например: не добавляй события про брак..." style="resize:vertical;font-family:inherit;font-size:12px;line-height:1.5;">'+curNotes+'</textarea>'
    +'<label class="ls-api-label">Endpoint</label>'
    +'<input id="ls-gen-endpoint" class="ls-api-field" type="text" placeholder="https://api.example.com/v1" value="'+curEndpoint+'">'
    +'<label class="ls-api-label">API Key</label>'
    +'<input id="ls-gen-apikey" class="ls-api-field" type="password" placeholder="sk-..." value="'+curKey+'">'
    +'<label class="ls-api-label">Модель</label>'
    +'<div class="ls-model-row"><select id="ls-gen-model-select">'+(curModel?'<option value="'+curModel+'" selected>'+curModel+'</option>':'<option value="">-- нажми обновить --</option>')+'</select><button id="ls-refresh-models" class="menu_button ls-refresh-btn" title="Загрузить модели"><i class="fa-solid fa-sync"></i></button></div>'
    +'<div style="font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.45;margin:8px 0 0;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">Персонаж</div>'
    +'<div id="ls-char-preview"><img id="ls-char-avatar" class="ls-avatar-hidden" src="" alt=""><span id="ls-char-avatar-name" style="font-size:12px;opacity:.6;"></span></div>'

    +'<button id="ls-gen-btn" class="menu_button">Сгенерировать</button>'
    +'<div id="ls-gen-status"></div>'
    +'</div>'

    // Правила
    +'<div class="ls-section-title">Правила изменения</div>'
    +'<div class="ls-hint">За что растут и падают очки.</div>'
    +'<div id="ls-changes-container"></div>'
    +'<div class="ls-section-title">Поведение по диапазонам</div>'
    +'<div class="ls-hint">Описывай поведение для позитивных и негативных значений.</div>'
    +'<div id="ls-interp-container"></div>'
    +'<div class="ls-section-title">Романтические события</div>'
    +'<div class="ls-hint">При достижении порога персонаж инициирует событие.</div>'
    +'<div class="ls-milestone-reset-row"><button id="ls-milestone-reset-all" class="menu_button">Сбросить все</button></div>'
    +'<div id="ls-milestones-container"></div>'
    +'<div class="ls-row" style="margin-top:10px;"><label class="checkbox_label" for="ls-gradual"><input type="checkbox" id="ls-gradual"><span>Медленное изменение (не более ±10 за ответ)</span></label></div>'
    +'</div></div></div>';
}

function renderChanges() {
  const ct=document.getElementById('ls-changes-container'); if(!ct) return;
  const arr=loveData().scoreChanges||[]; let html='';
  arr.forEach((c,i)=>{
    const pos=c.delta>=0,cls=pos?'ls-card-pos':'ls-card-neg',icon=pos?'&#10084;&#65039;':'&#128148;',ph=pos?'При каких условиях растёт...':'При каких условиях падает...';
    html+='<div class="ls-card '+cls+'" data-idx="'+i+'"><div class="ls-heart-box"><span class="ls-heart-icon">'+icon+'</span><input type="number" class="ls-delta-input ls-num-input" value="'+c.delta+'" data-idx="'+i+'" style="width:56px;font-weight:600;"></div><textarea class="ls-change-desc ls-textarea-field" data-idx="'+i+'" rows="3" placeholder="'+ph+'">'+escHtml(c.description)+'</textarea><button class="ls-del-change menu_button ls-del-btn" data-idx="'+i+'"><i class="fa-solid fa-times"></i></button></div>';
  });
  html+='<button id="ls-add-change" class="menu_button ls-add-btn">+ Добавить правило</button>';
  ct.innerHTML=html; bindChangesEv();
}

function renderInterps() {
  const ct=document.getElementById('ls-interp-container'); if(!ct) return;
  const d=loveData(),arr=d.scaleInterpretations||[]; let html='';
  arr.forEach((ip,i)=>{
    const act=d.score>=ip.min&&d.score<=ip.max,isNeg=ip.max<0;
    const bst=act?(isNeg?'border-color:rgba(80,200,0,.7);':'border-color:rgba(180,100,120,.6);'):'';
    const cls=isNeg?'ls-card-neg':'ls-card-neu';
    const lbl=act?'&#9654; активно':(isNeg?'&#9760; негатив':'диапазон');
    html+='<div class="ls-card '+cls+'" data-idx="'+i+'" style="'+bst+'"><div class="ls-range-box"><span class="ls-range-label">'+lbl+'</span><div class="ls-range-inner"><input type="number" class="ls-interp-min ls-range-input" value="'+ip.min+'" data-idx="'+i+'"><span class="ls-range-sep">&#8212;</span><input type="number" class="ls-interp-max ls-range-input" value="'+ip.max+'" data-idx="'+i+'"></div></div><textarea class="ls-interp-desc ls-textarea-field" data-idx="'+i+'" rows="3" placeholder="Описание поведения...">'+escHtml(ip.description)+'</textarea><button class="ls-del-interp menu_button ls-del-btn" data-idx="'+i+'"><i class="fa-solid fa-times"></i></button></div>';
  });
  html+='<button id="ls-add-interp" class="menu_button ls-add-btn">+ Добавить диапазон</button>';
  ct.innerHTML=html;
  const act=getActiveInterp(),box=document.getElementById('ls-active-state'),txt=document.getElementById('ls-active-text');
  if(box&&txt){if(act?.description?.trim()){txt.textContent=act.description.trim();box.style.display='block';}else box.style.display='none';}
  bindInterpEv();
}

function renderMilestones() {
  const ct=document.getElementById('ls-milestones-container'); if(!ct) return;
  const d=loveData(),arr=d.milestones||[]; let html='';
  arr.forEach((m,i)=>{
    const reached=d.score>=m.threshold,dc=m.done?' ls-done':'',rs=reached&&!m.done?'border-color:rgba(200,160,80,.65);':'';
    const st=m.done?'выполнено':(reached?'пора!':'ждёт'),sc=(!m.done&&reached)?' ls-status-due':'';
    html+='<div class="ls-card ls-card-milestone'+dc+'" data-idx="'+i+'" style="'+rs+'"><div class="ls-milestone-left"><div class="ls-milestone-threshold-wrap"><span class="ls-milestone-threshold-label">от</span><input type="number" class="ls-milestone-thr-input ls-num-input" value="'+m.threshold+'" data-idx="'+i+'" min="0" style="width:56px;"></div><input type="checkbox" class="ls-milestone-done-cb" data-idx="'+i+'" '+(m.done?'checked':'')+'><span class="ls-milestone-status'+sc+'">'+st+'</span></div><textarea class="ls-milestone-desc ls-textarea-field" data-idx="'+i+'" rows="3" placeholder="Что должен сделать персонаж...">'+escHtml(m.description)+'</textarea><button class="ls-del-milestone menu_button ls-del-btn" data-idx="'+i+'"><i class="fa-solid fa-times"></i></button></div>';
  });
  html+='<button id="ls-add-milestone" class="menu_button ls-add-btn">+ Добавить событие</button>';
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

function buildPrompt() {
  const c=cfg(),d=chatLoveData(); if(!c.isEnabled) return '';
  const changes=(d.scoreChanges||[]).filter(x=>x.description.trim());
  const interps=(d.scaleInterpretations||[]).filter(x=>x.description.trim());
  const active=getActiveInterp(),pending=getPendingMilestones();
  let p='[OOC - LOVE SCORE SYSTEM]\n\nCurrent love score: '+d.score+' (range: '+MIN_SCORE+' to '+d.maxScore+').';
  if(d.score<0) p+='\nNEGATIVE ZONE: character feels hostility, distrust or hatred toward the player.';
  if(active?.description?.trim()) p+='\n\nCURRENT BEHAVIOR (score '+d.score+'):\n'+active.description.trim()+'\n\nPortray the character strictly according to this description.';
  if(pending.length>0){
    p+='\n\nROMANTIC EVENTS \u2014 YOU MUST INITIATE ALL OF THESE (naturally, within this or the next response):';
    pending.forEach(m=>{p+='\n- '+m.description.trim()+' (unlocked at score '+m.threshold+')';});
    p+='\nAfter completing each event, include at the very end: <!-- [MILESTONE:threshold] --> for each completed one.';
  }
  if(changes.length){p+='\n\nLove Score Changes:';changes.forEach(x=>{p+='\n'+(x.delta>=0?'+':'')+x.delta+': '+x.description.trim();});}
  if(interps.length){p+='\n\nLove Scale:';interps.forEach(x=>{p+='\n'+x.min+' to '+x.max+': '+x.description.trim()+((d.score>=x.min&&d.score<=x.max)?' <- NOW':'');});}
  if(c.gradualProgression) p+='\\n\\nGradual Progression RULE: STRICT. Allowed values only: -2, -1, 0, +1, +2. Never go beyond \\u00b12 per response. Default is 0, use \\u00b11 for noticeable moments, \\u00b12 only for clearly significant ones.';
  p+='\n\nAt the end of each response include: <!-- [LOVE_SCORE:X] --> replacing X with the updated score ('+MIN_SCORE+' to '+d.maxScore+').';
  return p;
}

function updatePromptInjection() {
  try { setExtensionPrompt(PROMPT_KEY,cfg().isEnabled?buildPrompt():'',extension_prompt_types.IN_CHAT,0); }
  catch(e){ toast('error','Ошибка промпта: '+e.message); }
}

function onMessageReceived() {
  if(!cfg().isEnabled) return;
  try {
    const chat=typeof SillyTavern?.getContext==='function'?SillyTavern.getContext().chat:window.chat;
    if(!chat?.length) return;
    const msg=chat[chat.length-1]; if(!msg||msg.is_user) return;
    const text=msg.mes||'';
    const d=chatLoveData();
    const sm=text.match(/<!--\s*\[LOVE_SCORE:(-?\d+)\]\s*-->/i);
    if(sm){
      const d=loveData(),c=cfg(); let nv=parseInt(sm[1],10),ov=d.score;
      if(c.gradualProgression){const _allowed=new Set(d.scoreChanges.map(x=>x.delta));if(!_allowed.has(nv-ov)){const md=2;nv=Math.max(ov-md,Math.min(ov+md,nv));}}
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
    const msm=[...text.matchAll(/<!--\s*\[MILESTONE:(\d+)\]\s*-->/gi)];
    msm.forEach(mm=>{
      const thr=parseInt(mm[1],10),d=loveData();
      const ms=(d.milestones||[]).find(m=>m.threshold===thr&&!m.done);
      if(ms){ms.done=true;toast('success','Событие: '+ms.description.slice(0,55));renderMilestones();}
    });
    saveSettingsDebounced();updatePromptInjection();
  } catch(e){toast('error','Ошибка: '+e.message);}
}
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
  updateCharPreview(getCurrentCharacterCard());
  renderChanges();renderInterps();renderMilestones();renderScoreLog();renderPresets();refreshWidget();
}

function bindMainEvents() {
  $('#ls-enabled').off('change').on('change',function(){cfg().isEnabled=this.checked;saveSettingsDebounced();updatePromptInjection();refreshWidget();});
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
    applyWidgetSize(sz);cfg().widgetSize=sz;saveSettingsDebounced();
  });
  $(document).off('click','#ls-reset-pos').on('click','#ls-reset-pos',()=>{
    cfg().widgetPos=null;saveSettingsDebounced();
    const w=document.getElementById('ls-widget');if(w){w.style.top='100px';w.style.bottom='auto';w.style.left='18px';w.style.right='auto';}
    toast('info','Позиция сброшена');
  });
  $(document).off('input','#ls-gen-endpoint').on('input','#ls-gen-endpoint',function(){cfg().genEndpoint=this.value;saveSettingsDebounced();});
  $(document).off('input','#ls-gen-apikey').on('input','#ls-gen-apikey',function(){cfg().genApiKey=this.value;saveSettingsDebounced();});
  $(document).off('input','#ls-gen-notes').on('input','#ls-gen-notes',function(){cfg().genUserNotes=this.value;saveSettingsDebounced();});
  $(document).off('change','#ls-gen-model-select').on('change','#ls-gen-model-select',function(){cfg().genModel=this.value;saveSettingsDebounced();});
  $(document).off('change','input[name=ls-lang]').on('change','input[name=ls-lang]',function(){cfg().genLang=this.value;saveSettingsDebounced();});
  // Скоуп
  const scMap={'#ls-scope-changes':'changes','#ls-scope-pos-ranges':'positiveRanges','#ls-scope-neg-ranges':'negativeRanges','#ls-scope-milestones':'milestones','#ls-scope-max':'suggestedMax'};
  Object.entries(scMap).forEach(([sel,key])=>{
    $(document).off('change',sel).on('change',sel,function(){
      if(!cfg().genScope) cfg().genScope={...defaultSettings.genScope};
      cfg().genScope[key]=this.checked;saveSettingsDebounced();
    });
  });
  $(document).off('click','#ls-refresh-models').on('click','#ls-refresh-models',onRefreshModels);
  $(document).off('click','#ls-gen-btn').on('click','#ls-gen-btn',onGenerateClick);
  
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

}

jQuery(()=>{
  try {
    if(!extension_settings[EXT_NAME]) extension_settings[EXT_NAME]=structuredClone(defaultSettings);
    const c=cfg();
    for(const [k,v] of Object.entries(defaultSettings)) if(c[k]===undefined) c[k]=structuredClone(v);
    if(c.isEnabled===false&&!c._wasManuallyDisabled) c.isEnabled=true;
    if(c.widgetPos&&c.widgetPos.top==null) c.widgetPos=null;
    if(!c.presets) c.presets=[];
    if(!c.genScope) c.genScope={...defaultSettings.genScope};
    $('#extensions_settings').append(settingsPanelHTML());
    createWidget();bindMainEvents();syncUI();updatePromptInjection();
    eventSource.on(event_types.MESSAGE_SENT,()=>updatePromptInjection());
    eventSource.on(event_types.MESSAGE_RECEIVED,onMessageReceived);
    if(event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED,()=>{cfg().lastCheckedMessageId=null;syncUI();updatePromptInjection();});
  } catch(e){ toast('error','Love Score: ошибка инициализации — '+e.message); }
});
