import { saveSettingsDebounced, chat_metadata } from '../../../../script.js';
import { extension_settings }    from '../../../extensions.js';
import { tr }                    from './i18n.js';

// ─── Константы ────────────────────────────────────────────────────────────────
export const EXT_NAME   = 'love-score';
export const PROMPT_KEY = EXT_NAME + '_injection';
export const MIN_SCORE  = -100;

// ─── Настройки по умолчанию ───────────────────────────────────────────────────
export const defaultSettings = {
  isEnabled: true, maxScore: 100, gradualProgression: true,
  // ── Hardcore-режим ──
  hardcoreMode: false,          // главный флаг режима
  hardcorePositiveCap: 0.5,     // макс. прирост за один ответ («труд»)
  hardcoreNegativeMult: 2.0,    // множитель штрафов (ошибки бьют больнее)
  hardcoreDecayEnabled: true,   // очки «остывают» при простое
  hardcoreDecayPerStep: 0.3,    // на сколько остывают за один шаг decay
  hardcoreDecayInterval: 3,     // через сколько ходов без прогресса срабатывает decay
  hardcoreBreakthroughCD: 10,   // кулдаун breakthrough в сообщениях
  // ── Холодный старт ──
  coldStartEnabled: false,      // новые чаты начинаются в минусе
  coldStartScore: -30,          // стартовое значение (стена недоверия)
  // ── Шрамы ──
  scarsEnabled: false,          // память о крупных обидах
  scarThreshold: 10,            // падение на сколько и больше оставляет шрам
  scarHealMargin: 30,           // на сколько выше точки обиды нужно подняться, чтобы зажил (0 = навсегда)
  // ── Отображение ──
  showTrend: true,              // стрелка направления у сердечка
  showSparkline: true,          // мини-график истории очков
  openOnDblClick: true,         // двойной тап/клик по сердечку открывает панель (ПК и телефон)
  // ── Подача инжекта ──
  hideRules: false,             // не показывать боту правила/дельты/майлстоны — только поведение и счёт
  injectTone: 'strict',         // тон инжекта: 'strict' | 'hints' | 'monologue'
  injectDepth: 0,               // глубина инжекта в чате (IN_CHAT): 0 = вплотную к ответу; выше = дальше вверх по истории (слабее фиксация reasoning-моделей)
  scoreReason: true,            // AI добавляет короткое обоснование в тег [LOVE_SCORE:X:причина] — пишется в лог истории
  quietScoring: true,           // подсчёт — «тихая» служебная операция: не размышлять/не считать вслух в reasoning, тег только в конце видимого ответа
  // ── Streak и импульс события ──
  streakEnabled: true,          // серия положительных ответов даёт бонус
  streakNeeded: 3,              // сколько подряд плюсовых ответов активируют стрик
  streakMult: 1.5,             // множитель к следующему приросту (обычный режим)
  momentumEnabled: true,        // эхо после крупного сдвига
  momentumThreshold: 8,         // |дельта| от которой включается импульс
  momentumTurns: 2,             // сколько ходов держится заметка в промпте
  // ── Маршруты и соперник ──
  arcsEnabled: false,           // [legacy] деление истории на нарративные арки (мигрирует в routesEnabled)
  routesEnabled: false,         // ветки развития по типу отношений
  rivalEnabled: false,          // [legacy] одиночный соперник (мигрирует в NPC с isRival)
  rivalPressure: 0.5,           // дефолтное давление соперника на счёт за каждый его +1
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
  neutral:    { label: 'Нейтрально',   color: '#d0d0d0', deep: '#888888', icon: 'fa-circle-half-stroke',  desc: 'Тип не определён. Отношения только начинаются.' },
  romance:    { label: 'Романтика',    color: '#ff2d55', deep: '#c0002a', icon: 'fa-heart',               desc: 'Влюблённость, страсть, нежность. Особая привязанность.',
    genGuide: 'Mutual, reciprocal romantic affection. Patterns: building trust, shared vulnerability, tenderness, playful flirtation, supporting the partner\'s autonomy, mild jealousy that resolves through honesty. Growth feels safe and freely chosen by both. Milestones: first dates, confessions, physical intimacy, commitment, talk of a shared future. Tone: warm, hopeful, tender.' },
  friendship: { label: 'Дружба',       color: '#ff9d2e', deep: '#b35000', icon: 'fa-hand-holding-heart',  desc: 'Тепло, забота и доверие без романтики.',
    genGuide: 'Warm camaraderie WITHOUT romance or physical desire. Patterns: banter, inside jokes, loyalty, showing up in hard times, mutual respect, comfortable silence. Never flirtatious or sexual. Milestones: trust tests, shared adventures, deep honest talks, becoming each other\'s go-to person. Tone: easy, loyal, playful.' },
  family:     { label: 'Семья',        color: '#f0c000', deep: '#8a6c00', icon: 'fa-people-roof',          desc: 'Глубокая привязанность как к близкому человеку.',
    genGuide: 'Protective, nurturing bond like close kin. Patterns: caretaking, unconditional support, gentle scolding out of worry, pride, sacrifice, a sense of belonging. No romance. Milestones: being trusted with responsibility, being defended, being welcomed "home", being treated as one of their own. Tone: protective, steady, warm.' },
  platonic:   { label: 'Платоника',    color: '#00c49a', deep: '#006655', icon: 'fa-dove',                desc: 'Духовная близость и взаимопонимание без физики.',
    genGuide: 'Deep spiritual and intellectual closeness WITHOUT physical desire. Patterns: profound mutual understanding, soul-level conversations, shared values and ideas, the calm intimacy of two minds meeting. Milestones: mutual revelations, being truly "seen", intellectual or creative communion. Tone: serene, profound, cerebral.' },
  rival:      { label: 'Соперник',     color: '#2979ff', deep: '#003a99', icon: 'fa-hand-fist',           desc: 'Уважение через конкуренцию. Напряжённая динамика.',
    genGuide: 'Respect forged through competition. Patterns: challenges, taunts, grudging admiration, pushing each other to improve, crackling tension. Affection shows up as wanting the other at their best. Milestones: earning acknowledgment, a hard-won truce, fighting side by side, the rival admitting the player matters. Tone: charged, competitive, prideful.' },
  obsession:  { label: 'Одержимость',  color: '#a855f7', deep: '#5c00b0', icon: 'fa-heart-circle-bolt',   desc: 'Всепоглощающая фиксация. Тёмная, болезненная привязанность.',
    genGuide: 'All-consuming, UNHEALTHY fixation — NOT cozy or safe. Patterns: possessiveness, idealization, obsessive focus on the player, anxiety and clinginess when apart, jealousy that ESCALATES instead of resolving, eroding the player\'s boundaries, a need for control reframed as devotion, mood swings between worship and panic. Milestones: demands for exclusivity, monitoring/checking up, dramatic declarations, terror of abandonment, refusal to let go. Tone: dark, intense, suffocating, feverish — clearly distinct from healthy romance.' },
  hostile:    { label: 'Ненависть',    color: '#2e8b00', deep: '#050f00', icon: 'fa-heart-crack',         desc: 'Открытая ненависть и враждебность. Перевёрнутое сердце — символ ненависти.',
    genGuide: 'Open hatred and antagonism. Patterns: contempt, cruelty, threats, sabotage, cold rejection. "Positive" progress here does NOT mean warmth — it means hatred deepening into a charged, dangerous fixation or, at best, grudging restraint. Milestones: confrontations, humiliations, dangerous escalations, a wary standoff. Tone: cold, venomous, dangerous.' },
};

// ─── Фабрика данных любви ─────────────────────────────────────────────────────
export const mkLoveData = () => ({
  score: 0, maxScore: 100, relationType: 'neutral', scoreLog: [],
  // ── Hardcore runtime (per-chat) ──
  _hcStaleCounter: 0,           // ходов подряд без положительного прогресса
  _hcBreakthroughCD: 0,         // оставшийся кулдаун breakthrough
  _coldStarted: false,          // чат начался с «холодного старта» (стена недоверия)
  _streakCount: 0,              // подряд идущих положительных ответов
  _momentumTurns: 0,            // сколько ходов ещё держится импульс события
  _momentumDir: 0,             // направление импульса: 1 рост, -1 падение
  _msgSnapshots: [],            // стек снимков «до сообщения» по индексам — откат при рероле/свайпе и удалении
  arcs: [],                     // [legacy] нарративные арки: { id, name, min, max, description }
  routes: [],                   // маршруты-ветки: { id, name, relationType, description }
  _currentRoute: null,          // id текущего маршрута (по типу отношений)
  rival: null,                  // [legacy] одиночный соперник — мигрирует в groupNpcs
  groupNpcs: [],                // окружение: NPC, среди них могут быть соперники (isRival)
  scars: [],                    // шрамы: { id, text, atScore, delta, date, healed }
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
  try { if (typeof toastr !== 'undefined') toastr[type]?.(tr(msg), 'Love Score', { timeOut: 4500, positionClass: 'toast-top-center' }); } catch {}
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
  if (d._hcStaleCounter == null)   d._hcStaleCounter   = 0;
  if (d._hcBreakthroughCD == null) d._hcBreakthroughCD = 0;
  if (d._coldStarted == null)      d._coldStarted      = false;
  if (d._streakCount == null)      d._streakCount      = 0;
  if (d._momentumTurns == null)    d._momentumTurns    = 0;
  if (d._momentumDir == null)      d._momentumDir      = 0;
  if (!Array.isArray(d._msgSnapshots)) d._msgSnapshots    = [];
  if (!d.arcs)                     d.arcs              = [];
  if (!d.routes)                   d.routes            = [];
  if (d._currentRoute === undefined) d._currentRoute   = null;
  if (d.rival === undefined)       d.rival             = null;
  if (!d.groupNpcs)                d.groupNpcs         = [];
  if (!d.scars)                    d.scars             = [];

  // ── Миграция: арки (по диапазону счёта) → маршруты (по типу отношений) ──
  if (!d._routesMigrated) {
    if ((d.arcs || []).length && !d.routes.length)
      d.routes = d.arcs.map(a => ({ id: a.id, name: a.name || '', relationType: 'romance', description: a.description || '' }));
    // правила: условие по арке → условие по маршруту (id сохранён при миграции)
    (d.scoreChanges || []).forEach(r => { if (r.arc && !r.route) { r.route = r.arc; delete r.arc; } });
    d._routesMigrated = true;
  }

  // ── NPC: поля соперника по умолчанию ──
  (d.groupNpcs || []).forEach(n => { if (n.isRival == null) n.isRival = false; if (n.pressure == null) n.pressure = (cfg().rivalPressure ?? 0.5); });

  // ── Миграция: одиночный соперник → NPC окружения с флагом isRival ──
  if (!d._rivalMigrated) {
    if (d.rival && (d.rival.name || '').trim()) {
      d.groupNpcs.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: d.rival.name, nameEn: d.rival.name, relationType: 'rival',
        score: d.rival.score || 0, maxScore: d.maxScore || 100, avatarUrl: '',
        description: d.rival.note || '', isRival: true, pressure: (cfg().rivalPressure ?? 0.5)
      });
      cfg().groupMode = true; // соперник теперь живёт в окружении — включаем режим
    }
    d.rival = null;
    d._rivalMigrated = true;
  }
  return d;
}

// ─── Снимки состояния «до сообщения» (откат при свайпе/рероле, удалении, ветвлении) ─
// Полный набор полей, которые откатываем. Снимок берётся ДО обработки сообщения,
// поэтому его восстановление возвращает счёт и все «включившиеся» эффекты (майлстоны,
// шрамы, тип, маршрут, стрик, импульс, NPC) к виду «как было до этого поста».
export const SNAP_KEYS = ['score','_coldStarted','scoreLog','_hcStaleCounter','_hcBreakthroughCD',
  '_streakCount','_momentumTurns','_momentumDir','relationType','_currentRoute','scars','milestones','groupNpcs'];

// Глубина истории снимков на чат (на сколько сообщений можно откатиться).
export const SNAP_CAP = 20;

// Глубина лога изменений счёта на чат (для «Истории»).
export const LOG_CAP = 250;

// Текущий массив сообщений таверны.
export function getChat() {
  try { return (typeof SillyTavern?.getContext === 'function' ? SillyTavern.getContext().chat : window.chat) || []; }
  catch { return window.chat || []; }
}

// Лёгкий «отпечаток» сообщения — отличить прежнее сообщение от пропавшего/сместившегося.
// send_date переживает редактирование текста (в отличие от длины).
export function msgFp(m) {
  if (!m) return '';
  return (m.is_user ? 'u' : 'a') + ':' + (m.send_date ?? ('L' + (m.mes || '').length));
}

export function takeMsgSnapshot(d, c) {
  const snap = {};
  for (const k of SNAP_KEYS) snap[k] = structuredClone(d[k] ?? null);
  snap._autoSuggestMsgCounter = c._autoSuggestMsgCounter || 0;
  return snap;
}

export function restoreMsgSnapshot(d, c, snap) {
  for (const k of SNAP_KEYS) if (k in snap) d[k] = structuredClone(snap[k]);
  c._autoSuggestMsgCounter = snap._autoSuggestMsgCounter || 0;
}

export function chatLoveData() {
  const c = cfg();
  if (!c.chatLoveData) c.chatLoveData = {};
  const id = getChatId();
  if (!c.chatLoveData[id]) {
    const inherited = inheritBranchData(c, id);   // ветка чата наследует счёт родителя
    if (inherited) {
      c.chatLoveData[id] = inherited;
    } else {
      const fresh = mkLoveData();
      if (c.coldStartEnabled) {
        fresh.score = Math.max(MIN_SCORE, Math.min(0, c.coldStartScore ?? -30));
        fresh._coldStarted = true;
      }
      c.chatLoveData[id] = fresh;
    }
  }
  return ensureLDFields(c.chatLoveData[id]);
}

// ─── Наследование love-данных при ветвлении чата (Create Branch) ──────────────
// У ветки в метаданных лежит main_chat — имя родительского чата (== ключ его
// love-данных). Без этого ветка получала бы пустой счёт (0) и всё «пропадало».
// Копируем состояние родителя и усекаем до точки ветвления.
function inheritBranchData(c, id) {
  try {
    const parentId = chat_metadata?.main_chat;
    if (!parentId || parentId === id) return null;
    const parent = c.chatLoveData?.[parentId];
    if (!parent) return null;
    const copy = structuredClone(parent);
    trimToBranchPoint(copy, c);
    return copy;
  } catch { return null; }
}

// Ветка = родитель, усечённый до N сообщений. Если точка ветвления попадает в
// сохранённую историю снимков — откатываем счёт/эффекты ровно к ней; если ветвление
// раньше истории (или истории нет) — оставляем текущее состояние родителя как есть
// (данные сохраняются, а первый же ответ в ветке заново заякорит счёт по тегу AI).
function trimToBranchPoint(d, c) {
  const stack = (d._msgSnapshots || []).slice().sort((a, b) => a.idx - b.idx);
  d._msgSnapshots = [];                         // ветка ведёт свою историю снимков с нуля
  if (!stack.length) return;
  const chat = getChat();
  const len = chat.length;                      // длина ветки = точка ветвления
  if (!len || stack[0].idx > len) return;       // ветвление раньше истории — данные родителя как есть
  for (let i = 0; i < stack.length; i++) {
    const e = stack[i];
    if (e.idx >= len || msgFp(chat[e.idx]) !== e.key) { restoreMsgSnapshot(d, c, e.snap); return; }
  }
}

export function loveData() { return chatLoveData(); }

// ─── Утилиты ──────────────────────────────────────────────────────────────────
export function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Округление счёта до 1 знака (hardcore оперирует дробями вроде +0.5)
export function roundScore(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

// Отображение счёта: целые — как есть, дробные — с одним знаком
export function fmtScore(n) {
  const r = roundScore(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
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
  d.scoreLog.unshift({
    delta, sign: sign + delta, reason: reason || '',
    score: roundScore(d.score),                                                  // счёт ПОСЛЕ изменения — для истории/экспорта
    date: new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
  });
  if (d.scoreLog.length > LOG_CAP) d.scoreLog.length = LOG_CAP;
}

// ─── Тренд и история (реконструкция из scoreLog) ──────────────────────────────
export function getTrend(d) {
  const log = d.scoreLog || [];
  if (!log.length) return null;
  const recent = log.slice(0, 3).reduce((a, e) => a + (e.delta || 0), 0);
  return recent > 0 ? 1 : recent < 0 ? -1 : 0;
}

export function getScoreHistory(d, max = 14) {
  const log = d.scoreLog || [];
  const pts = [roundScore(d.score)];
  let cur = d.score;
  for (let i = 0; i < log.length && pts.length <= max; i++) {
    cur = roundScore(cur - (log[i].delta || 0));
    pts.push(cur);
  }
  return pts.reverse();   // от старых к новым
}

// ─── Арки и условные правила ──────────────────────────────────────────────────
// Активный маршрут — ветка, чей тип совпадает с текущим типом отношений
export function getCurrentRoute(d) {
  const routes = (d.routes || []).filter(r => r.name && r.name.trim());
  if (!routes.length) return null;
  const rt = d.relationType || 'neutral';
  return routes.find(r => r.relationType === rt) || null;
}

// Условие правила выполнено для данного счёта/маршрута?
export function ruleConditionMet(rule, score, routeId) {
  if (rule.minScore != null && score < rule.minScore) return false;
  if (rule.maxScore != null && score > rule.maxScore) return false;
  if (rule.route && rule.route !== routeId) return false;
  return true;
}

// Найти правило, чья дельта совпадает И условие выполнено (по счёту, к которому правило применяется)
export function findMatchingRule(d, delta, scoreForCheck) {
  const route = getCurrentRoute(d);
  const routeId = route ? route.id : null;
  return (d.scoreChanges || []).find(r =>
    r.delta === delta && (r.description || '').trim() && ruleConditionMet(r, scoreForCheck, routeId)
  );
}

// ─── Шрамы ────────────────────────────────────────────────────────────────────
export function getActiveScars(d) {
  return (d.scars || []).filter(s => !s.healed);
}

export function addScar(d, text, delta) {
  if (!d.scars) d.scars = [];
  d.scars.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    text: String(text || '').trim().slice(0, 120) || 'Глубокая обида',
    atScore: roundScore(d.score),
    delta: roundScore(delta || 0),
    date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    healed: false,
  });
  if (d.scars.length > 30) d.scars.length = 30;
  return d.scars[0];
}
