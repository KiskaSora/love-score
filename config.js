import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings }    from '../../../extensions.js';

// ─── Константы ────────────────────────────────────────────────────────────────
export const EXT_NAME   = 'love-score';
export const PROMPT_KEY = EXT_NAME + '_injection';
export const MIN_SCORE  = -100;

// ─── Настройки по умолчанию ───────────────────────────────────────────────────
export const defaultSettings = {
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

// ─── Типы отношений ───────────────────────────────────────────────────────────
export const RELATION_TYPES = {
  neutral:    { label: 'Нейтрально',   color: '#d0d0d0', deep: '#888888', desc: 'Тип не определён. Отношения только начинаются.' },
  romance:    { label: 'Романтика',    color: '#ff2d55', deep: '#c0002a', desc: 'Влюблённость, страсть, нежность. Особая привязанность.' },
  friendship: { label: 'Дружба',       color: '#ff9d2e', deep: '#b35000', desc: 'Тепло, забота и доверие без романтики.' },
  family:     { label: 'Семья',        color: '#f0c000', deep: '#8a6c00', desc: 'Глубокая привязанность как к близкому человеку.' },
  platonic:   { label: 'Платоника',    color: '#00c49a', deep: '#006655', desc: 'Духовная близость и взаимопонимание без физики.' },
  rival:      { label: 'Соперник',     color: '#2979ff', deep: '#003a99', desc: 'Уважение через конкуренцию. Напряжённая динамика.' },
  obsession:  { label: 'Одержимость',  color: '#a855f7', deep: '#5c00b0', desc: 'Всепоглощающая фиксация. Тёмная, болезненная привязанность.' },
  hostile:    { label: 'Ненависть',    color: '#2e8b00', deep: '#050f00', desc: 'Открытая ненависть и враждебность. Перевёрнутое сердце — символ ненависти.' },
};

// ─── Фабрика данных любви ─────────────────────────────────────────────────────
export const mkLoveData = () => ({
  score: 0, maxScore: 100, relationType: 'neutral', scoreLog: [],
  scoreChanges: [
    { delta: 1,   description: '' }, { delta: 2,   description: '' },
    { delta: -1,  description: '' }, { delta: -2,  description: '' },
    { delta: -5,  description: '' }, { delta: -10, description: '' }
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

// ─── Аксессоры ────────────────────────────────────────────────────────────────
export const cfg = () => extension_settings[EXT_NAME];

export function toast(type, msg) {
  try { if (typeof toastr !== 'undefined') toastr[type]?.(msg, 'Love Score', { timeOut: 4500, positionClass: 'toast-top-center' }); } catch {}
}

export function getChatId() {
  try { const x = SillyTavern?.getContext?.() ?? {}; return x.chatId ?? x.chat_metadata?.chat_id ?? '__global__'; }
  catch { return '__global__'; }
}

export function ensureLDFields(d) {
  const mk = mkLoveData();
  if (!d.scoreChanges)         d.scoreChanges         = mk.scoreChanges;
  if (!d.scaleInterpretations) d.scaleInterpretations = mk.scaleInterpretations;
  if (!d.milestones)           d.milestones           = mk.milestones;
  if (!d.scoreLog)             d.scoreLog             = [];
  if (d.maxScore == null)      d.maxScore             = mk.maxScore;
  if (!d.relationType)         d.relationType         = 'neutral';
  return d;
}

export function chatLoveData() {
  const c = cfg();
  if (!c.chatLoveData) c.chatLoveData = {};
  const id = getChatId();
  if (!c.chatLoveData[id]) c.chatLoveData[id] = mkLoveData();
  return ensureLDFields(c.chatLoveData[id]);
}

export function loveData() { return chatLoveData(); }

// ─── Утилиты ──────────────────────────────────────────────────────────────────
export function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function getActiveInterp() {
  const d = loveData();
  return (d.scaleInterpretations || []).find(ip => d.score >= ip.min && d.score <= ip.max) ?? null;
}

export function getPendingMilestones() {
  const d = loveData();
  return (d.milestones || []).filter(m => !m.done && d.score >= m.threshold);
}

export function addToLog(d, delta, reason) {
  if (!d.scoreLog) d.scoreLog = [];
  const sign = delta >= 0 ? '+' : '';
  d.scoreLog.unshift({ delta, sign: sign + delta, reason: reason || '' });
  if (d.scoreLog.length > 10) d.scoreLog.length = 10;
}
