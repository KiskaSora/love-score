// Интерфейс автоматического слоубёрна: карточка режима, быстрый старт, «Профиль и память»,
// лента оценок, песочница, статус на сердечке, простой вид. Данные берёт из метаданных чата и настроек.
import { saveSettingsDebounced } from '../../../../script.js';
import { cfg, chatLoveData, getChatId, getNativeGroup, toast, escHtml } from './config.js';
import { getConnectionProfiles, buildCharacterCardText, getCurrentCharacterCard, getLorebookTextForGen } from './ai.js';
import { autoModeActive, forceAutoProfile, previewAutoReview, suggestMaxScore, getAutoReviewStatus } from './slowburn-observer.js';
import { latestReview, reviewedRecord, redact, reviewInterval, relationshipState } from './slowburn-core.js';
import { historyImportHTML, relationshipOverviewHTML, captureHistoryInput, handleHistoryAction } from './historyview.js';
import { relationshipSettingsHTML, captureRelationshipInput, changeRelationshipSelection, handleRelationshipAction } from './relationshipview.js';
import { autoStage, AUTO_STAGES, stagePoint } from './autostage.js';
import { refreshWidget } from './heart.js';
import { updatePromptInjection, getCurrentInjection } from './prompt.js';

const $id = id => document.getElementById(id);
const chatArr = () => { try { return SillyTavern.getContext().chat || []; } catch { return []; } };
const ico = (n, extra = '') => `<i class="fa-solid ${n}"${extra ? ` style="${extra}"` : ''}></i>`;
let _reveal = false, _editing = false, _sandboxHtml = '', _status = { state: 'idle', text: '' }, _stTimer = null, _busy = {};
let _srcCache = { at: 0, len: 0 }, _maxHtml = '';

// ─── Разметка, которую вставляет ui.js ────────────────────────────────────────
export function autoCardHTML(c, hintsHtml = '') {
  return `<div class="ls-autocard">
    <div class="ls-autocard-top">
      <div class="ls-autocard-ic">${ico('fa-hourglass-half')}</div>
      <div class="ls-autocard-t"><strong>Автоматический слоубёрн</strong><small>beta · ответы не переписываются и не получают тегов</small></div>
      <label class="ls-aswitch" title="Включить / выключить"><input id="ls-auto-slowburn" type="checkbox"${c.autoSlowBurn ? ' checked' : ''}><span></span></label>
    </div>
    <div id="ls-auto-blocked"></div>
    <div class="ls-auto-only">
      <select id="ls-auto-pace" style="display:none"><option value="slow"${c.autoSlowBurnPace !== 'very_slow' ? ' selected' : ''}>Медленный</option><option value="very_slow"${c.autoSlowBurnPace === 'very_slow' ? ' selected' : ''}>Очень медленный</option></select>
      <div class="ls-seg" id="ls-pace-seg"><button type="button" data-ls-act="pace" data-v="slow">Медленный</button><button type="button" data-ls-act="pace" data-v="very_slow">Очень медленный</button></div>
      <div id="ls-pace-scale" class="ls-pace-scale"></div>
      <div class="ls-setup-row"><label for="ls-auto-interval">Пересмотр AI</label><select id="ls-auto-interval" class="ls-num-input"><option value="10">Раз в 10 ответов</option><option value="15">Раз в 15 ответов</option><option value="20">Раз в 20 ответов</option><option value="30">Раз в 30 ответов</option><option value="50">Раз в 50 ответов</option></select></div>
      <div class="ls-hint">Между проверками — локальное состояние и короткий инжект в основной запрос. Сообщения сами по себе не начисляют очки и не открывают близость.</div>
      <div class="ls-chips" id="ls-auto-chips"></div>
      <div class="ls-statusline" id="ls-auto-statusline"></div>
      <label class="checkbox_label" style="margin-top:8px"><input type="checkbox" id="ls-simple-view"><span>Простой вид: только главное</span></label>
      <details class="ls-adv"><summary>Если оценки не приходят</summary>
        <label class="checkbox_label" style="margin-top:6px"><input type="checkbox" id="ls-auto-prefill"><span>Префилл ответа</span></label>
        <div class="ls-hint">Запрос заканчивается началом JSON, модель его продолжает. Помогает, когда она отказывается или пишет лишнее. Если провайдер префилл не принимает, он отключится для него сам.</div>
        <label class="checkbox_label"><input type="checkbox" id="ls-auto-nothink"><span>Без размышлений</span></label>
        <div class="ls-hint">Просит модель не рассуждать и отвечать сразу, оценка выходит быстрее и дешевле. Не у всех провайдеров срабатывает: надёжнее выбрать в AI-профиле модель без режима «thinking».</div>
        <label class="checkbox_label"><input type="checkbox" id="ls-auto-figspaces"><span>Фигурные пробелы</span></label>
        <div class="ls-hint">Модель ставит особый пробел (U+2007) между словами в тексте оценки, расширение возвращает обычные.</div>
        <div class="ls-setup-row" style="margin-top:8px"><label for="ls-auto-timeout">Ждать ответ</label><select id="ls-auto-timeout" class="ls-num-input"><option value="45">45 с</option><option value="90">90 с</option><option value="180">180 с</option><option value="300">300 с</option></select></div>
        <div class="ls-hint">Для моделей, которые долго «размышляют».</div>
      </details>
      <details class="ls-adv"><summary>Как это работает</summary>${hintsHtml}</details>
    </div>
  </div>
  <div class="ls-locked ls-show-auto">${ico('fa-lock')}<span>Ручной режим отключён: правила, события, Hardcore, серии, остывание.</span><button type="button" class="menu_button" id="ls-reveal-manual" data-ls-act="reveal-manual">Показать</button></div>`;
}
// Опасная зона во вкладке «Хранилище»: сбросить этот чат или удалить данные всех чатов
export function storageDangerHTML() {
  return `<div class="ls-danger"><div class="ls-section-title">${ico('fa-triangle-exclamation', 'color:#e8923a')} Удаление данных</div>
    <div class="ls-hint">Оба действия нельзя отменить. Каждое нужно нажать дважды.</div>
    <div class="ls-actions">
      <button type="button" class="menu_button" data-ls-act="wipe-chat">${ico('fa-eraser')} Сбросить этот чат</button>
      <button type="button" class="menu_button" data-ls-act="wipe-all">${ico('fa-trash-can')} Удалить данные всех чатов</button></div>
    <div class="ls-hint">«Сбросить этот чат»: очки, история, профиль и память этого чата начнутся с нуля. «Удалить всё»: то же для всех чатов. Настройки расширения и пресеты остаются. Оценки внутри старых сообщений таверна хранит сама, но расширение их больше не учитывает.</div></div>`;
}
// ─── Диагностика во вкладке «Отладка»: отчёт без ключей, адресов и текста истории ───
const EXT_VERSION = '1.17.0-beta.9';
export function diagHTML() {
  return `<div class="ls-diag"><div class="ls-section-title" style="margin-top:0">Диагностика</div>
    <div class="ls-hint">Отчёт собирает настройки, состояние чата и журнал запросов. В нём нет ключей, адресов, текста истории и карточки персонажа. Перед отправкой его можно прочитать ниже.</div>
    <label class="checkbox_label"><input type="checkbox" id="ls-diag-head"><span>Записывать начало ответа модели (может содержать кусочки истории)</span></label>
    <div class="ls-actions"><button type="button" class="menu_button" data-ls-act="diag-copy">${ico('fa-copy')} Скопировать отчёт</button>
      <button type="button" class="menu_button" data-ls-act="diag-save">${ico('fa-download')} Скачать .txt</button>
      <button type="button" class="menu_button" data-ls-act="diag-clear">${ico('fa-broom')} Очистить журнал</button></div>
    <details class="ls-adv"><summary>Показать отчёт</summary><textarea id="ls-diag-text" class="text_pole" rows="12" readonly style="width:100%;font-size:11px"></textarea></details></div>`;
}
const yn = v => v ? 'да' : 'нет';
function replyStatus(m) {
  if (reviewedRecord(m)?.local) return 'локально, без AI-запроса';
  if (reviewedRecord(m)) return 'пересмотрен AI';
  if (m.extra?.lsAutoUnverified === m.mes) return 'оценка не получена';
  if (m.extra?.lsAutoReviews?.[m.swipe_id ?? 0]) return 'текст правили после оценки';
  return 'нет оценки';
}
export function buildReport() {
  const c = cfg(), d = chatLoveData(), chat = chatArr(), L = [];
  let ctx = {}; try { ctx = SillyTavern.getContext(); } catch {}
  const prof = getConnectionProfiles().find(p => p.id === c.genProfileId);
  let pr = null; try { pr = ctx.extensionSettings?.connectionManager?.profiles?.find(x => x.id === c.genProfileId); } catch {}
  L.push('Love Score · отчёт для диагностики', `Версия расширения: ${EXT_VERSION}`, `Создан: ${new Date().toLocaleString('ru')}`,
    `Браузер: ${navigator.userAgent}`, `Окно: ${window.innerWidth}×${window.innerHeight}`, '',
    '— Настройки —', `Love Score включён: ${yn(c.isEnabled)}`, `Авто-слоубёрн: ${yn(c.autoSlowBurn)} · темп: ${c.autoSlowBurnPace || 'slow'}`,
    `Авто-режим действует в этом чате: ${yn(autoModeActive())}`, `Режим окружения: ${yn(c.groupMode)} · групповой чат: ${yn(getNativeGroup())}`,
    `Префилл: ${yn(c.autoPrefill)} · фигурные пробелы: ${yn(c.autoFigureSpaces)} · без размышлений: ${yn(c.autoNoThink)} · ожидание: ${c.autoTimeoutSec || 90} с`,
    `Простой вид: ${yn(c.simpleView)}`, '',
    '— AI-профиль —', `Выбран: ${prof ? 'да' : 'нет'}${pr ? ` · API: ${pr.api || '?'} · модель: ${pr.model || '?'} · пресет: ${pr.preset || '—'}` : ''}`, '',
    '— Чат —', `Сообщений: ${chat.length}`, `Очки: ${d.score} из ${d.maxScore} · стадия: ${autoStage(d.score, d.maxScore).label}`,
    `Профиль характера: ${d._autoProfile?.text ? `есть (${d._autoProfile.text.length} симв.${d._autoProfile.manual ? ', правка вручную' : ''})` : 'нет'} · стартовое описание: ${d._autoStartNote ? d._autoStartNote.length + ' симв.' : 'нет'} · сброс памяти на сообщении: ${d._autoFloor ?? '—'}`);
  const ai = []; for (let i = chat.length - 1; i >= 0 && ai.length < 5; i--) if (chat[i] && !chat[i].is_user) ai.push(`  №${i + 1}, свайп ${(chat[i].swipe_id ?? 0) + 1}, ${(chat[i].mes || '').length} симв.: ${replyStatus(chat[i])}`);
  L.push('Последние ответы персонажа:', ...(ai.length ? ai : ['  нет']), '');
  const u = d._autoUsage, l = d._autoLast;
  L.push('— Расход (оценка по длине текста) —', u ? `Оценок: ${u.reviews} · профилей: ${u.profiles} · проб: ${u.previews} · ошибок: ${u.fails} · ≈${u.inTok + u.outTok} ток.` : 'Запросов не было',
    l ? `Последний запрос: ${KIND[l.kind] || l.kind} · ${l.ok ? 'OK' : 'ОШИБКА: ' + (l.error || '')} · ${(l.ms / 1000).toFixed(1)} с` : '', '', '— Журнал запросов (старые сверху) —');
  const log = (c._autoDiag || []).slice(-30);
  if (!log.length) L.push('пусто');
  for (const e of log) {
    L.push(`${new Date(e.t).toLocaleTimeString('ru')} ${KIND[e.kind] || e.kind} · ${e.ok ? 'OK' : 'ОШИБКА'}${e.ms ? ` · ${(e.ms / 1000).toFixed(1)} с` : ''}${e.inTok != null ? ` · ≈${e.inTok}→${e.outTok} ток.` : ''}${e.reply ? ` · ответ: ${e.reply}` : ''}`
      + `\n    режим: префилл ${yn(e.mode?.prefill)}, фиг. пробелы ${yn(e.mode?.figspaces)}, без размышлений ${yn(e.mode?.nothink)}`
      + (e.call ? ` · ушло: префилл ${yn(e.call.prefill)}, effort ${yn(e.call.effort)}, повторов ${e.call.retries ?? 0}` : '')
      + (e.error ? `\n    ошибка: ${e.error}` : '') + (e.note ? `\n    ${e.note}` : '') + (e.head ? `\n    начало ответа: ${e.head}` : ''));
  }
  return redact(L.join('\n'));
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok; }
}
function renderDiag() {
  const ta = $id('ls-diag-text'); if (ta) ta.value = buildReport();
  const h = $id('ls-diag-head'); if (h) h.checked = cfg().autoDiagReply === true;
}
export function autoProfilePaneHTML() { return '<div id="ls-profile-pane"></div>'; }

// ─── Состояние классов панели ─────────────────────────────────────────────────
export function applyAutoClasses() {
  const c = cfg(), on = autoModeActive();
  document.querySelectorAll('.ls-panel-inner').forEach(r => {
    r.classList.toggle('ls-auto-on', on);
    r.classList.remove('ls-collapsed');   // кнопки сворачивания шапки больше нет
    r.classList.toggle('ls-simple', !!c.simpleView);
    r.classList.toggle('ls-reveal-manual', _reveal);
    const act = r.querySelector('.ls-nav-tab.active');
    if (act && getComputedStyle(act).display === 'none') r.querySelector('.ls-nav-tab[data-tab="overview"]')?.click();
  });
  const rb = $id('ls-reveal-manual'); if (rb) rb.textContent = _reveal ? 'Скрыть' : 'Показать';
}

// ─── Карточка режима: темп, шкала, чипы ───────────────────────────────────────
function renderAutoCard() {
  const c = cfg(), d = chatLoveData(), pace = c.autoSlowBurnPace === 'very_slow' ? 'very_slow' : 'slow';
  document.querySelectorAll('#ls-pace-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === pace));
  const sv = $id('ls-simple-view'); if (sv) sv.checked = !!c.simpleView;
  const bl = $id('ls-auto-blocked');
  if (bl) {
    const on = c.autoSlowBurn === true;
    const why = !on ? '' : !c.isEnabled ? 'Love Score выключен (галочка «Включено» на вкладке «Обзор»).'
      : c.groupMode ? 'Сейчас включён режим окружения: в нём работает обычный ручной режим, поэтому всё выглядит по-старому.'
      : getNativeGroup() ? 'Это групповой чат: в группах авто-режим не работает, пока открыт этот чат.' : '';
    bl.innerHTML = why ? `<div class="ls-retry">${ico('fa-triangle-exclamation', 'color:#e8923a')} <b>Авто-режим включён, но не работает.</b><div class="ls-hint" style="margin:4px 0">${why}</div>${c.isEnabled && c.groupMode ? `<button type="button" class="menu_button" data-ls-act="group-off">${ico('fa-users-slash')} Выключить режим окружения</button>` : ''}</div>` : '';
  }
  const pf = $id('ls-auto-prefill'); if (pf) pf.checked = c.autoPrefill === true;
  const nt = $id('ls-auto-nothink'); if (nt) nt.checked = c.autoNoThink === true;
  const fs = $id('ls-auto-figspaces'); if (fs) fs.checked = c.autoFigureSpaces === true;
  const to = $id('ls-auto-timeout'); if (to) to.value = String([45, 90, 180, 300].includes(+c.autoTimeoutSec) ? +c.autoTimeoutSec : 90);
  const iv = $id('ls-auto-interval'); if (iv) { const n=reviewInterval(c.autoReviewInterval); if(![...iv.options].some(o=>+o.value===n))iv.add(new Option(`Раз в ${n} ответов`,String(n))); iv.value=String(n); }
  const sc = $id('ls-pace-scale');
  if (sc) {
    const row = (v, label, cap) => `<div class="ls-pace-row${v === pace ? ' on' : ''}"><span>${label}</span><div class="ls-pace-track"><i style="width:${cap * 5}%"></i></div><b>до +${cap}</b></div>`;
    sc.innerHTML = row('slow', 'Медленный', 2) + row('very_slow', 'Очень медленный', 1)
      + `<div class="ls-hint">За один редкий пересмотр — до +${pace === 'very_slow' ? 1 : 2}, часто 0. Сюжетный прорыв — до +10. Доверие и готовность к прикосновениям независимы.</div>`;
  }
  const ch = $id('ls-auto-chips'); if (!ch) return;
  const prof = getConnectionProfiles().find(p => p.id === c.genProfileId), u = d._autoUsage;
  const avg = u?.reviews ? Math.round((u.inTok + u.outTok) / Math.max(1, u.reviews + u.profiles + u.previews)) : 0;
  const chip = (cls, icon, t) => `<span class="ls-chip ${cls}">${ico(icon)} ${escHtml(t)}</span>`;
  ch.innerHTML = [
    d._autoProfile?.text ? chip('ok', 'fa-circle-check', d._autoProfile.manual ? 'Профиль: правка вручную' : 'Профиль готов') : chip('w', 'fa-circle-exclamation', 'Профиль не создан'),
    prof ? chip('p', 'fa-plug', 'AI: ' + prof.name) : chip('w', 'fa-plug-circle-xmark', 'AI-профиль не выбран'),
    chip('', 'fa-coins', avg ? `≈${avg} ток. на редкий запрос` : 'обычный ход — без отдельного AI'),
    chip('', 'fa-clock', `До пересмотра: ${getAutoReviewStatus().remaining} ответов`),
  ].join('');
}

// ─── Быстрый старт ────────────────────────────────────────────────────────────
function renderWizard() {
  const host = $id('ls-auto-wizard'); if (!host) return;
  const c = cfg(), d = chatLoveData(), profiles = getConnectionProfiles();
  const s1 = !!c.genProfileId && profiles.some(p => p.id === c.genProfileId), s2 = c.autoSlowBurn === true, s3 = !!d._autoProfile?.text;
  if (c.autoWizardHidden || (s1 && s2 && s3)) { host.innerHTML = ''; return; }
  const n = (done, i) => `<span class="ls-wiz-n${done ? ' done' : ''}">${done ? ico('fa-check') : i}</span>`;
  const opts = '<option value="">— выбрать —</option>' + profiles.map(p => `<option value="${escHtml(p.id)}"${p.id === c.genProfileId ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('');
  host.innerHTML = `<div class="ls-wizard">
    <div class="ls-wiz-h">${ico('fa-wand-magic-sparkles')}<strong>Быстрый старт</strong><button type="button" class="ls-wiz-x" data-ls-act="wiz-hide" title="Скрыть">${ico('fa-xmark')}</button></div>
    <div class="ls-wiz-step">${n(s1, 1)}<div><b>Выбери AI-профиль</b><small>Он нужен для оценок и профиля характера.</small>
      ${profiles.length ? `<select id="ls-wiz-profile" class="ls-num-input">${opts}</select>` : '<small class="ls-warn">Профилей подключения нет: включи Connection Manager в таверне.</small>'}</div></div>
    <div class="ls-wiz-step">${n(s2, 2)}<div><b>Включи автоматический слоубёрн</b>${s2 ? '' : `<button type="button" class="menu_button" data-ls-act="wiz-enable">${ico('fa-toggle-on')} Включить</button>`}</div></div>
    <div class="ls-wiz-step">${n(s3, 3)}<div><b>Создай профиль характера</b><small>Один запрос по карточке и лорбуку, до ~700 токенов.</small>
      ${s3 ? '' : `<button type="button" class="menu_button" data-ls-act="prof-make"${s1 && s2 ? '' : ' disabled'}>${ico(_busy.make ? 'fa-circle-notch fa-spin' : 'fa-user-pen')} Создать профиль</button>`}</div></div>
  </div>`;
}

// ─── Обзор: «сейчас в игре», песочница, расход ────────────────────────────────
const KIND = { reviews: 'Пересмотр отношений', profiles: 'Профиль', previews: 'Пробная оценка' };
function usageLine(d) {
  const l = d._autoLast, u = d._autoUsage;
  let h = '';
  if (l) h += l.ok
    ? `<span>${ico('fa-circle-check', 'color:#69d66b')} ${KIND[l.kind] || 'Запрос'}: ${(l.ms / 1000).toFixed(1)} с · ≈${l.tok} ток.</span>`
    : `<span>${ico('fa-triangle-exclamation', 'color:#e8923a')} ${KIND[l.kind] || 'Запрос'}: ${escHtml(l.error || 'ошибка')}</span>`;
  if (u) h += `<span>${ico('fa-coins')} В этом чате: ${u.reviews} оценок, ${u.profiles} профилей${u.previews ? `, ${u.previews} проб` : ''} · ≈${(u.inTok + u.outTok).toLocaleString('ru')} ток.${u.fails ? ` · ошибок: ${u.fails}` : ''}</span>`;
  return h || '<span>Запросов пока не было</span>';
}
// Последний ответ персонажа не оценён (ошибка, таймаут, режим включили позже): показать причину и кнопку повтора
function retryBlock(d) {
  const last=chatArr().at(-1);
  if(!autoModeActive()||!last||last.is_user)return '';
  const failed=last.extra?.lsAutoUnverified===last.mes;
  const err=failed&&d._autoLast?.kind==='reviews'&&!d._autoLast.ok?d._autoLast.error:'';
  const schedule=getAutoReviewStatus();
  return `<div class="${failed?'ls-retry':'ls-pbox'}"><div>${ico(failed?'fa-triangle-exclamation':'fa-house')} <b>${failed?'Пересмотр не получен — границы сохранены':'Слоубёрн работает локально'}</b></div>
    <div class="ls-hint">До планового пересмотра: ${schedule.remaining} ответов. Очки не дают разрешения на близость.</div>
    ${err?`<div class="ls-hint">${escHtml(err)}</div>`:''}
    <div class="ls-actions" style="margin:6px 0"><button type="button" class="menu_button" data-ls-act="retry"${_status.state==='work'?' disabled':''}>${ico('fa-rotate')} Переоценить сейчас (AI)</button></div></div>`;
}
let _injectOpen=false, _injectChat=null;
function injectionPaneHTML() {
  if (_injectChat !== getChatId()) { _injectChat=getChatId(); _injectOpen=false; }
  const p=getCurrentInjection(),text=p?.text||'';
  const role=['Система','Пользователь','Ассистент'][p?.role]||'Система';
  return `<details class="ls-adv" id="ls-current-injection"${_injectOpen?' open':''}><summary>Текущий инжект</summary>
    <div class="ls-hint">Подсказка Love Score, установленная для основного запроса. Просмотр, обновление и копирование не вызывают AI.</div>
    ${p?`<div class="ls-hint">${role} · глубина ${p.depth} · ${text.length} симв.${p.enabled?'':' · расширение выключено'}</div>`:'<div class="ls-hint">Подсказка для этого чата ещё не установлена. Нажми «Обновить».</div>'}
    <div class="ls-pre" style="max-height:320px;overflow:auto;overflow-wrap:anywhere">${escHtml(text||'Пусто')}</div>
    <div class="ls-actions"><button type="button" class="menu_button" data-ls-act="inject-refresh"><i class="fa-solid fa-rotate"></i> Обновить</button><button type="button" class="menu_button" data-ls-act="inject-copy"${text?'':' disabled'}><i class="fa-solid fa-copy"></i> Копировать</button></div></details>`;
}
function renderOverview() {
  const host = $id('ls-auto-overview'); if (!host) return;
  const d = chatLoveData(), st = autoStage(d.score, d.maxScore), last = latestReview(chatArr(), d._autoFloor || 0);
  // Preserve text edits, but let a focused select reveal its dependent fields.
  const focused = document.activeElement;
  if (focused?.id === 'ls-start-note' || (focused?.matches?.('input,textarea') && (focused.id?.startsWith('ls-history-') || focused.id?.startsWith('ls-relation-')))) return;
  const c = cfg(), profiles = getConnectionProfiles(), curIdx = AUTO_STAGES.indexOf(st);
  const popts = '<option value="">— выбрать —</option>' + profiles.map(p => `<option value="${escHtml(p.id)}"${p.id === c.genProfileId ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('');
  const setup = `<div class="ls-setup">
    <div class="ls-setup-row"><label for="ls-ov-profile">${ico('fa-plug')} AI-профиль</label>${profiles.length ? `<select id="ls-ov-profile" class="ls-num-input">${popts}</select>` : '<small class="ls-warn">Профилей подключения нет</small>'}</div>
    <div class="ls-setup-t">${ico('fa-ruler-horizontal')} Порог (максимум очков): ${escHtml(String(d.maxScore))}</div>
    <div class="ls-actions" style="margin:6px 0"><button type="button" class="menu_button" data-ls-act="max-ai"${_busy.max ? ' disabled' : ''}>${ico(_busy.max ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles')} Определить с помощью AI</button></div>
    <div id="ls-max-result">${_maxHtml}</div>
    <details class="ls-adv"><summary>Ручная настройка шкалы очков</summary><div class="ls-hint">Условные стадии меняют только число. Они не определяют чувства и готовность к близости.</div>
    <div class="ls-hint" style="margin:2px 0 6px">Текущий прогресс: ${escHtml(String(d.score))} из ${escHtml(String(d.maxScore))}. Выбор кнопки ниже вручную изменит очки.</div>
    <div class="ls-stages">${AUTO_STAGES.map((s, i) => `<button type="button" class="ls-stagebtn${i === curIdx ? ' on' : ''}" style="--c:${s.color}" data-ls-act="set-stage" data-i="${i}">${ico(s.icon)}<span>${s.label}</span></button>`).join('')}</div>
    </details><textarea id="ls-start-note" class="text_pole" rows="2" maxlength="400" placeholder="Как сейчас между вами, своими словами (по желанию). Пригодится, пока у расширения нет своей памяти.">${escHtml(d._autoStartNote || '')}</textarea></div>`;
  host.innerHTML = setup + relationshipSettingsHTML() + historyImportHTML() + `<div class="ls-now">
    ${relationshipOverviewHTML()}
    ${retryBlock(d)}
    <div class="ls-actions"><button type="button" class="menu_button" data-ls-act="sandbox"${_busy.sandbox ? ' disabled' : ''}>${ico(_busy.sandbox ? 'fa-circle-notch fa-spin' : 'fa-flask')} Как бы оценил?</button></div>
    <div id="ls-sandbox-result">${_sandboxHtml}</div>
    <div class="ls-usage">${usageLine(d)}</div>${injectionPaneHTML()}</div>`;
  const sl = $id('ls-auto-statusline'); if (sl) sl.innerHTML = statusHtml();
}
function statusHtml() {
  const m = { work: [ico('fa-circle-notch fa-spin', 'color:#a855f7'), _status.text === 'profiles' ? 'Создаю профиль…' : _status.text === 'previews' ? 'Пробная оценка…' : 'Оцениваю ответ…'],
    ok: [ico('fa-circle-check', 'color:#69d66b'), 'Готово'], error: [ico('fa-triangle-exclamation', 'color:#e8923a'), 'Ошибка: ' + escHtml(_status.text || '')] }[_status.state];
  return m ? `${m[0]} ${m[1]}` : '';
}

// ─── Лента оценок (с отметками правки / отката) ───────────────────────────────
function renderAutoLog() {
  const host = $id('ls-auto-log'); if (!host) return;
  const chat = chatArr(), items = [];
  for (let i = chat.length - 1; i >= 0 && items.length < 30; i--) {
    const m = chat[i]; if (!m || m.is_user || reviewedRecord(m)?.local) continue;
    const sw = m.swipe_id ?? 0, rec = m.extra?.lsAutoReviews?.[sw], ok = reviewedRecord(m);
    let kind = ok ? 'ok' : (m.extra?.lsAutoUnverified === m.mes ? 'fail' : (rec ? 'edit' : ''));
    if (!kind) continue;
    const swTag = sw > 0 ? `<span class="ls-badge">свайп ${sw + 1}</span>` : '';
    const idx = `<span class="ls-badge n">№${i + 1}</span>`;
    if (kind === 'ok') {
      const dl = rec.delta, cls = rec.breakthrough ? 'big' : dl > 0 ? 'up' : dl < 0 ? 'dn' : 'z', sg = (dl > 0 ? '+' : '') + dl;
      items.push(`<div class="ls-alog"><span class="ls-d ${cls}">${escHtml(sg)}</span><div><p>${escHtml(rec.reason || '—')}${rec.breakthrough ? '<span class="ls-badge b">ПРОРЫВ</span>' : ''}${swTag}${idx}</p>${rec.breakthrough && rec.evidence ? `<q>«${escHtml(rec.evidence)}»</q>` : ''}</div></div>`);
    } else if (kind === 'edit') {
      items.push(`<div class="ls-alog"><span class="ls-d z">${ico('fa-pen')}</span><div><p>Текст правили${swTag}${idx}</p><small>Оценка к старому тексту не учитывается</small></div></div>`);
    } else {
      const why = i === chat.length - 1 && chatLoveData()._autoLast?.kind === 'reviews' && !chatLoveData()._autoLast.ok ? ' · ' + escHtml(chatLoveData()._autoLast.error || '') : '';
      items.push(`<div class="ls-alog"><span class="ls-d z">${ico('fa-triangle-exclamation', 'color:#e8923a')}</span><div><p>Оценка не получена${swTag}${idx}</p><small>Очки не начислены, текст остался как есть${why}</small></div></div>`);
    }
  }
  host.innerHTML = `<div class="ls-section-title">История оценок</div>`
    + (items.length ? items.join('') : '<div class="ls-hint" style="opacity:.5">Пока нет оценок</div>')
    + `<div class="ls-hint">Оценка привязана к тексту и свайпу: при смене свайпа или удалении поста очки откатываются.</div>`;
}

// ─── Вкладка «Профиль и память» ───────────────────────────────────────────────
const LABELS = { motives: ['Мотивы', 'fa-bullseye'], boundaries: ['Границы', 'fa-ban'], obstacles: ['Препятствия', 'fa-mountain'],
  'earns trust': ['Как заслужить доверие', 'fa-key'], initiatives: ['Маленькие инициативы', 'fa-seedling'], 'premature closeness': ['Если слишком быстро', 'fa-hourglass-half'] };
function parseProfile(text) {
  const blocks = []; let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(motives|boundaries|obstacles|earns trust|initiatives|premature closeness)\s*:\s*(.*)$/i);
    if (m) { cur = { k: m[1].toLowerCase(), v: m[2] }; blocks.push(cur); }
    else if (line.trim()) { if (cur) cur.v += ' ' + line.trim(); else { cur = { k: '', v: line.trim() }; blocks.push(cur); } }
  }
  return blocks;
}
const bandWord = {
  feelings: v => v < 2 ? 'холодные' : v < 4 ? 'осторожные' : v < 6 ? 'тёплые' : v < 8 ? 'сильные' : 'глубокие',
  trust: v => v < 2 ? 'почти нет' : v < 4 ? 'хрупкое' : v < 6 ? 'растёт' : v < 8 ? 'крепкое' : 'полное',
  readiness: v => v < 2 ? 'пока рано' : v < 4 ? 'осторожно' : v < 6 ? 'возможно' : v < 8 ? 'вероятно' : 'открыто',
};
function sourceLen() {
  const now = Date.now(); if (now - _srcCache.at < 5000) return _srcCache.len;
  let len = 0; try { len = (buildCharacterCardText(getCurrentCharacterCard()) + '\n' + getLorebookTextForGen()).length; } catch { len = 0; }
  _srcCache = { at: now, len }; return len;
}
function renderProfile() {
  const host = $id('ls-profile-pane'); if (!host || _editing) return;
  const d = chatLoveData(), p = d._autoProfile, chat = chatArr(), rec = relationshipState(d,chat).record;
  const meter = (k, icon, color, title) => {
    const v = rec?.meters?.[k];
    return `<div class="ls-meter"><div class="l"><span>${ico(icon, 'color:' + color)} ${title}</span><span>${v == null ? '—' : bandWord[k](v)}</span></div><div class="ls-bar"><span style="width:${v == null ? 0 : v * 10}%;background:${color}"></span></div></div>`;
  };
  let h = `<div class="ls-section-title" style="margin-top:0">Память сейчас</div>`;
  if (rec) {
    h += meter('feelings', 'fa-heart', '#ff4466', 'Чувства') + meter('trust', 'fa-handshake', '#5b8fd6', 'Доверие') + meter('readiness', 'fa-door-open', '#a855f7', 'Готовность к близости');
    if (!rec.meters) h += '<div class="ls-hint">Шкалы появятся после следующей оценки: у этой записи их ещё нет.</div>';
    if (rec.next) h += `<div class="ls-step"><small>Ближайший шаг</small>${escHtml(rec.next)}</div>`;
    if (rec.allowed) h += `<div class="ls-pbox"><h4>${ico('fa-hand')} Допустимая близость сейчас</h4><div class="ls-hint">${escHtml(rec.allowed)}</div></div>`;
    if (rec.barrier) h += `<div class="ls-pbox"><h4>${ico('fa-mountain')} Личный барьер</h4><div class="ls-hint">${escHtml(rec.barrier)}</div></div>`;
    h += `<details class="ls-adv"><summary>Полная память (${rec.memory.length} симв.)</summary><div class="ls-pre">${escHtml(rec.memory)}</div></details>`;
  } else h += '<div class="ls-hint" style="opacity:.6">До первого редкого пересмотра действуют карточка и история. Можно нажать «Переоценить сейчас» на вкладке «Обзор».</div>';
  h += `<div class="ls-section-title">Профиль характера</div>`;
  if (p?.text) {
    for (const b of parseProfile(p.text)) {
      const [title, icon] = LABELS[b.k] || ['Профиль', 'fa-id-card'];
      const parts = b.v.split(/;\s*/).map(s => s.trim()).filter(Boolean);
      h += `<div class="ls-pbox"><h4>${ico(icon)} ${title}</h4>${b.k ? `<div class="ls-chips">${parts.map(s => `<span class="ls-chip">${escHtml(s)}</span>`).join('')}</div>` : `<div class="ls-pre">${escHtml(b.v)}</div>`}</div>`;
    }
  } else h += `<div class="ls-pbox"><div class="ls-hint" style="margin:0">Профиль ещё не создан.</div></div>`;
  const len = sourceLen(), pct = Math.min(100, Math.round(len / 240));
  h += `<div class="ls-section-title">Источники</div><div class="ls-meter"><div class="l"><span>Карточка и выбранный лорбук</span><span>${len.toLocaleString('ru')} / 24 000 симв.</span></div><div class="ls-bar"><span style="width:${pct}%;background:${len > 24000 ? '#e8923a' : '#69d66b'}"></span></div></div>`;
  if (len > 24000) h += '<div class="ls-hint ls-warn">Лишнее будет обрезано при создании профиля.</div>';
  h += `<div class="ls-actions">
    <button type="button" class="menu_button" data-ls-act="prof-make"${_busy.make ? ' disabled' : ''}>${ico(_busy.make ? 'fa-circle-notch fa-spin' : 'fa-rotate')} ${p?.text ? 'Обновить профиль' : 'Создать профиль'}</button>
    <button type="button" class="menu_button" data-ls-act="prof-edit"${p?.text ? '' : ' disabled'}>${ico('fa-pen')} Править вручную</button>
    <button type="button" class="menu_button" data-ls-act="mem-reset">${ico('fa-rotate-left')} Сбросить память</button></div>`;
  h += `<div class="ls-statusline"><span>${ico('fa-clock')} ${p?.manual ? 'Правка вручную' : p?.at ? 'Обновлён ' + new Date(p.at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Не создан'}</span><span>${ico('fa-layer-group')} ${(p?.text || '').length} / 1800 симв.</span></div>`;
  host.innerHTML = h;
}
function renderEditor() {
  const host = $id('ls-profile-pane'), p = chatLoveData()._autoProfile; if (!host || !p) return;
  host.innerHTML = `<div class="ls-section-title" style="margin-top:0">Правка профиля</div>
    <div class="ls-hint">Пока включена ручная правка, профиль не перезаписывается сам. Кнопка «Вернуть автоматический» снимет защиту.</div>
    <textarea id="ls-prof-text" class="text_pole" rows="10" maxlength="1800" style="width:100%">${escHtml(p.text)}</textarea>
    <div class="ls-actions"><button type="button" class="menu_button" data-ls-act="prof-save">${ico('fa-check')} Сохранить</button>
    <button type="button" class="menu_button" data-ls-act="prof-cancel">${ico('fa-xmark')} Отмена</button>
    ${p.manual ? `<button type="button" class="menu_button" data-ls-act="prof-auto">${ico('fa-wand-magic-sparkles')} Вернуть автоматический</button>` : ''}</div>`;
}

// ─── Шапка: стадия и цвет ─────────────────────────────────────────────────────
export function autoviewDash() {
  if (!autoModeActive()) return;
  const d = chatLoveData(), st = autoStage(d.score, d.maxScore);
  const chip = $id('ls-dash-chip'); if (chip) { chip.textContent = `Прогресс: ${d.score} / ${d.maxScore}`; chip.title = relationshipState(d,chatArr()).record?.summary || 'Очки не определяют близость'; chip.style.color = st.color; }
  const heart = $id('ls-dash-heart'); if (heart) heart.style.setProperty('--ls-dash-col', st.color);
}

// ─── Общая перерисовка ────────────────────────────────────────────────────────
export function autoviewSync() {
  try {
    const panel=$id('ls-panel-inner')||document.querySelector('.ls-panel-inner');
    const shell=panel?.closest('dialog')||panel?.closest('.popup')||panel?.closest('.ls-popup-wide');
    shell?.classList.add('ls-mobile-shell');
    renderDiag(); applyAutoClasses(); renderAutoCard(); renderWizard(); renderOverview(); renderAutoLog(); renderProfile(); autoviewDash();
    const dst = $id('ls-dash-status'); if (dst) dst.innerHTML = statusHtml();
  } catch (e) { console.error('[LoveScore] autoview', e); }
}

// ─── События ──────────────────────────────────────────────────────────────────
async function makeProfile() {
  if (_busy.make) return; _busy.make = true; autoviewSync();
  try { const ok = await forceAutoProfile(); if (ok) toast('success', 'Профиль слоубёрна обновлён'); }
  catch (e) { toast('warning', e.message); }
  finally { _busy.make = false; _srcCache.at = 0; saveSettingsDebounced(); updatePromptInjection(); autoviewSync(); }
}
async function suggestMax() {
  if (_busy.max) return; _busy.max = true; _maxHtml = ''; autoviewSync();
  try {
    const { max, reason } = await suggestMaxScore(), cur = chatLoveData().maxScore;
    _maxHtml = `<div class="ls-sbx"><b>${max === cur ? `AI советует оставить ${max}` : `AI советует порог ${max}`}</b><p>${escHtml(reason)}</p>`
      + `<div class="ls-actions" style="margin:6px 0 0">${max === cur ? '' : `<button type="button" class="menu_button" data-ls-act="max-apply" data-v="${max}">${ico('fa-check')} Поставить ${max}</button>`}<button type="button" class="menu_button" data-ls-act="max-dismiss">${ico('fa-xmark')} Закрыть</button></div></div>`;
  } catch (e) { _maxHtml = `<div class="ls-sbx"><span class="ls-warn">${ico('fa-triangle-exclamation')} ${escHtml(e.message)}</span></div>`; }
  finally { _busy.max = false; autoviewSync(); }
}
async function sandbox() {
  if (_busy.sandbox) return; _busy.sandbox = true; _sandboxHtml = ''; autoviewSync();
  try {
    const { result: r, ms, applied } = await previewAutoReview();
    const sg = (r.delta > 0 ? '+' : '') + r.delta;
    _sandboxHtml = `<div class="ls-sbx"><div class="ls-sbx-h"><b>Пробная оценка: ${escHtml(sg)}</b>${r.breakthrough ? '<span class="ls-badge b">ПРОРЫВ</span>' : ''}<span class="ls-sbx-ms">${(ms / 1000).toFixed(1)} с</span></div>
      <p>${escHtml(r.reason)}</p>${r.breakthrough && r.evidence ? `<q>«${escHtml(r.evidence)}»</q>` : ''}${r.next ? `<p class="ls-hint">Дальше: ${escHtml(r.next)}</p>` : ''}
      <div class="ls-hint">${applied != null ? `Реальная оценка этого поста: ${applied > 0 ? '+' : ''}${applied}. ` : ''}Ничего не записано, очки не менялись.</div></div>`;
  } catch (e) { _sandboxHtml = `<div class="ls-sbx"><span class="ls-warn">${ico('fa-triangle-exclamation')} ${escHtml(e.message)}</span></div>`; }
  finally { _busy.sandbox = false; autoviewSync(); }
}
function onClick(e) {
  const b = e.target.closest?.('[data-ls-act]'); if (!b) return;
  const c = cfg(), d = chatLoveData(), act = b.dataset.lsAct;
  if (act === 'inject-refresh') { updatePromptInjection(); autoviewSync(); return; }
  if (act === 'inject-copy') { const text=getCurrentInjection()?.text; if(text)copyText(text).then(ok=>toast(ok?'success':'warning',ok?'Инжект скопирован':'Не удалось скопировать')); return; }
  if (act.startsWith('relation-')) { handleRelationshipAction(act); return; }
  if (act.startsWith('history-')) { handleHistoryAction(act); return; }
  if (act === 'pace') {
    const sel = $id('ls-auto-pace'); if (sel) { sel.value = b.dataset.v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    renderAutoCard();
  } else if (act === 'reveal-manual') { _reveal = !_reveal; applyAutoClasses(); }
  else if (act === 'wiz-hide') { c.autoWizardHidden = true; saveSettingsDebounced(); renderWizard(); }
  else if (act === 'wiz-enable') { const k = $id('ls-auto-slowburn'); if (k) { k.checked = true; k.dispatchEvent(new Event('change', { bubbles: true })); } autoviewSync(); }
  else if (act === 'set-stage') {
    const i = +b.dataset.i, pt = stagePoint(i, d.maxScore), v = $id('ls-val');
    if (v) { v.value = pt; v.dispatchEvent(new Event('change', { bubbles: true })); }
    toast('info', `Уровень: ${AUTO_STAGES[i].label}. Очки: ${pt}`); autoviewSync();
  }
  else if (act === 'group-off') { const k = $id('ls-group-enabled'); if (k) { k.checked = false; k.dispatchEvent(new Event('change', { bubbles: true })); } autoviewSync(); }
  else if (act === 'diag-copy') { copyText(buildReport()).then(ok => toast(ok ? 'success' : 'warning', ok ? 'Отчёт скопирован' : 'Не удалось скопировать: открой «Показать отчёт» и выдели текст вручную')); }
  else if (act === 'diag-save') {
    const a = document.createElement('a'), t = new Date(), p = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(new Blob([buildReport()], { type: 'text/plain;charset=utf-8' }));
    a.download = `love-score-report-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}.txt`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  else if (act === 'diag-clear') { cfg()._autoDiag = []; saveSettingsDebounced(); renderDiag(); toast('info', 'Журнал очищен'); }
  else if (act === 'retry') document.dispatchEvent(new CustomEvent('ls-auto-retry'));
  else if (act === 'max-ai') suggestMax();
  else if (act === 'max-apply') {
    const k = $id('ls-max'); if (k) { k.value = b.dataset.v; k.dispatchEvent(new Event('change', { bubbles: true })); }
    _maxHtml = ''; toast('info', 'Порог: ' + b.dataset.v); autoviewSync();
  }
  else if (act === 'max-dismiss') { _maxHtml = ''; autoviewSync(); }
  else if (act === 'prof-make') makeProfile();
  else if (act === 'sandbox') sandbox();
  else if (act === 'prof-edit') { _editing = true; renderEditor(); }
  else if (act === 'prof-cancel') { _editing = false; renderProfile(); }
  else if (act === 'prof-save') {
    const t = ($id('ls-prof-text')?.value || '').trim().slice(0, 1800);
    if (!t) { toast('warning', 'Профиль не может быть пустым'); return; }
    d._autoProfile = { key: d._autoProfile?.key || 'manual', text: t, manual: true, at: Date.now() };
    _editing = false; saveSettingsDebounced(); updatePromptInjection(); autoviewSync(); toast('success', 'Профиль сохранён');
  } else if (act === 'prof-auto') {
    if (d._autoProfile) d._autoProfile = { ...d._autoProfile, manual: false, key: '' };
    _editing = false; saveSettingsDebounced(); autoviewSync(); toast('info', 'Профиль обновится при следующей генерации');
  } else if (act === 'mem-reset') {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.innerHTML = ico('fa-triangle-exclamation') + ' Точно сбросить?'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.innerHTML = ico('fa-rotate-left') + ' Сбросить память'; } }, 3500); return; }
    delete d._autoBaseline; d._autoFloor = chatArr().length; saveSettingsDebounced(); updatePromptInjection(); autoviewSync(); toast('success', 'Память отношений сброшена. Очки не изменились.');
  } else if (act === 'wipe-chat' || act === 'wipe-all') {
    const label = act === 'wipe-chat' ? 'Сбросить этот чат' : 'Удалить данные всех чатов', icon = act === 'wipe-chat' ? 'fa-eraser' : 'fa-trash-can';
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.innerHTML = ico('fa-triangle-exclamation') + ' Точно? Нажми ещё раз'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.innerHTML = ico(icon) + ' ' + label; } }, 4000); return; }
    const store = cfg().chatLoveData || (cfg().chatLoveData = {});
    if (act === 'wipe-all') for (const k of Object.keys(store)) delete store[k]; else delete store[getChatId()];
    const fresh = chatLoveData(); fresh._autoFloor = chatArr().length;   // память по старым постам не подтягиваем
    saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); _sandboxHtml = ''; autoviewSync();
    document.dispatchEvent(new CustomEvent('ls-data-reset'));
    toast('success', act === 'wipe-chat' ? 'Этот чат сброшен' : 'Данные всех чатов удалены');
  } else if (act === 'simple-toggle') {
    c.simpleView = !c.simpleView; saveSettingsDebounced(); applyAutoClasses();
    toast('info', c.simpleView ? 'Простой вид: остались только главное' : 'Полный вид');
  }
}
function onStatus(ev) {
  _status = ev.detail || { state: 'idle', text: '' };
  const w = $id('ls-widget'); if (w) { if (_status.state === 'idle') delete w.dataset.lsStatus; else w.dataset.lsStatus = _status.state; if (_status.state === 'error') w.title = _status.text || ''; }
  clearTimeout(_stTimer);
  if (_status.state === 'ok') _stTimer = setTimeout(() => { _status = { state: 'idle', text: '' }; const w2 = $id('ls-widget'); if (w2) delete w2.dataset.lsStatus; autoviewSync(); }, 3500);
  autoviewSync();
}
let _bound = false;
export function bindAutoView() {
  if (_bound) return; _bound = true;
  document.addEventListener('click', onClick);
  document.addEventListener('toggle', e => { if(e.target?.id==='ls-current-injection')_injectOpen=e.target.open; }, true);
  document.addEventListener('ls-auto-status', onStatus);
  document.addEventListener('ls-history-view', autoviewSync);
  document.addEventListener('ls-history-applied', () => { updatePromptInjection(); autoviewSync(); });
  document.addEventListener('ls-relationship-view', autoviewSync);
  document.addEventListener('ls-relationship-applied', () => { updatePromptInjection(); refreshWidget(); autoviewSync(); });
  document.addEventListener('input', e => {
    captureRelationshipInput(e.target);
    captureHistoryInput(e.target);
    if (e.target?.id !== 'ls-start-note') return;
    chatLoveData()._autoStartNote = e.target.value.slice(0, 400); saveSettingsDebounced(); updatePromptInjection();
  });
  document.addEventListener('change', e => {
    if (changeRelationshipSelection(e.target)) return;
    const id = e.target?.id;
    if(id==='ls-auto-interval'){ cfg().autoReviewInterval=reviewInterval(e.target.value); saveSettingsDebounced(); autoviewSync(); return; }
    if (id === 'ls-auto-prefill' || id === 'ls-auto-figspaces' || id === 'ls-auto-nothink') { cfg()[id === 'ls-auto-prefill' ? 'autoPrefill' : id === 'ls-auto-nothink' ? 'autoNoThink' : 'autoFigureSpaces'] = e.target.checked; saveSettingsDebounced(); return; }
    if (id === 'ls-diag-head') { cfg().autoDiagReply = e.target.checked; saveSettingsDebounced(); return; }
    if (id === 'ls-simple-view') { cfg().simpleView = e.target.checked; saveSettingsDebounced(); applyAutoClasses(); return; }
    if (id === 'ls-auto-timeout') { cfg().autoTimeoutSec = +e.target.value; saveSettingsDebounced(); return; }
    if (!['ls-wiz-profile', 'ls-ov-profile'].includes(id)) return;
    cfg().genProfileId = e.target.value; saveSettingsDebounced();
    const s = $id('ls-gen-profile-select'); if (s) s.value = e.target.value;
    autoviewSync();
  });
}

// ─── Стили ────────────────────────────────────────────────────────────────────
const AUTO_CSS = `
.ls-auto-on:not(.ls-reveal-manual) .ls-hide-auto{display:none!important}
.ls-panel-inner:not(.ls-auto-on) .ls-show-auto,.ls-panel-inner:not(.ls-auto-on) .ls-auto-only{display:none!important}
.ls-auto-on.ls-reveal-manual .ls-hide-auto{opacity:.5}
.ls-simple .ls-nav-tab[data-tab="rules"],.ls-simple .ls-nav-tab[data-tab="ai"],.ls-simple .ls-nav-tab[data-tab="group"],.ls-simple .ls-nav-tab[data-tab="presets"],.ls-simple .ls-nav-tab[data-tab="debug"]{display:none!important}
.ls-dash{position:relative}
.ls-dash-spark{display:none!important}
.ls-dash-collapse{display:none!important}
.ls-section-title{display:flex;align-items:center;gap:8px}
.ls-section-title::before{content:"";width:3px;height:12px;border-radius:2px;background:#ff4466;flex:none}
@media (min-width:561px){
 .ls-popup-wide.popup{border-radius:20px!important;border:1px solid rgba(255,68,102,.28)!important;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 70px rgba(255,68,102,.10)!important}
 .ls-panel-inner{gap:12px}
 .ls-dash{padding:18px 20px;gap:18px;border-radius:18px;box-shadow:0 10px 34px rgba(255,68,102,.12);background:linear-gradient(135deg,rgba(255,45,85,.16),rgba(168,85,247,.09))}
 .ls-dash-heart{width:68px;height:62px}.ls-dash-score .hh-num{font-size:20px}.ls-dash-score .hh-den{font-size:9.5px}
 .ls-dash-title{font-size:19px}
 .ls-panel-inner .ls-nav{position:sticky;top:0;z-index:6;flex-wrap:wrap;overflow:visible;gap:5px;padding:7px;margin:0;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(22,18,28,.82);backdrop-filter:blur(10px)}
 .ls-panel-inner .ls-nav-tab{border:0;border-radius:11px;padding:8px 12px;font-size:13px;flex:1 1 auto;justify-content:center}
 .ls-panel-inner .ls-nav-tab i{font-size:15px}
 .ls-panel-inner .ls-nav-tab.active{color:#fff;background:linear-gradient(135deg,rgba(255,68,102,.38),rgba(168,85,247,.28));box-shadow:0 0 0 1px rgba(255,68,102,.45) inset,0 4px 14px rgba(255,68,102,.18)}
 .ls-setup,.ls-now,.ls-autocard,.ls-wizard{border-radius:16px;padding:16px}
}
.ls-dash-status{font-size:11px;opacity:.85;display:block;margin-top:2px}
.ls-autocard{border:1px solid rgba(255,68,102,.35);background:linear-gradient(160deg,rgba(255,68,102,.10),rgba(168,85,247,.05));border-radius:14px;padding:14px;margin-bottom:10px}
.ls-autocard-top{display:flex;align-items:center;gap:10px}
.ls-autocard-ic{width:34px;height:34px;border-radius:10px;background:rgba(255,68,102,.2);display:grid;place-items:center;color:#ff4466;flex:none}
.ls-autocard-t{flex:1;min-width:0}.ls-autocard-t strong{display:block;font-size:14px}.ls-autocard-t small{opacity:.6;font-size:11.5px}
.ls-aswitch{position:relative;width:42px;height:24px;flex:none;margin:0;cursor:pointer}
.ls-aswitch input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2}
.ls-aswitch span{position:absolute;inset:0;border-radius:20px;background:rgba(255,255,255,.18);transition:.2s}
.ls-aswitch span::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s}
.ls-aswitch input:checked+span{background:#ff4466}.ls-aswitch input:checked+span::after{left:21px}
.ls-seg{display:flex;background:rgba(0,0,0,.3);border-radius:10px;padding:3px;margin:12px 0 10px}
.ls-seg button{flex:1;border:0;background:none;color:rgba(255,255,255,.6);padding:7px 4px;border-radius:8px;font-size:12px;cursor:pointer}
.ls-seg button.on{background:rgba(255,68,102,.28);color:#fff}
.ls-pace-row{display:flex;align-items:center;gap:8px;font-size:11.5px;opacity:.45;margin:3px 0}.ls-pace-row.on{opacity:1}
.ls-pace-row span{width:120px;flex:none}.ls-pace-row b{width:46px;text-align:right;font-weight:600}
.ls-pace-track{flex:1;height:6px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}.ls-pace-track i{display:block;height:100%;background:#ff4466;border-radius:6px}
.ls-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}
.ls-chip{font-size:11.5px;padding:4px 9px;border-radius:20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)}
.ls-chip.ok i{color:#69d66b}.ls-chip.w i{color:#e8923a}.ls-chip.p{background:rgba(168,85,247,.14);border-color:rgba(168,85,247,.3)}
.ls-statusline{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;opacity:.7;margin-top:8px}.ls-statusline:empty{display:none}
.ls-adv{margin-top:8px;font-size:12px}.ls-adv summary{cursor:pointer;opacity:.7}
.ls-locked{margin:0 0 12px;border:1px dashed rgba(255,255,255,.2);border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:center;font-size:12.5px;opacity:.85}.ls-locked span{flex:1}
.ls-wizard{border:1px solid rgba(168,85,247,.4);background:rgba(168,85,247,.07);border-radius:14px;padding:12px;margin-bottom:12px}
.ls-wiz-h{display:flex;align-items:center;gap:8px;margin-bottom:8px}.ls-wiz-h i{color:#a855f7}.ls-wiz-h strong{flex:1}
.ls-wiz-x{background:none;border:0;color:inherit;opacity:.5;cursor:pointer}
.ls-wiz-step{display:flex;gap:10px;padding:7px 0;font-size:12.5px}.ls-wiz-step small{display:block;opacity:.6;margin:2px 0 6px}.ls-wiz-step .menu_button{margin-top:4px}
.ls-wiz-n{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:11px;flex:none}.ls-wiz-n.done{background:#2f9e44}
.ls-warn{color:#e8923a}
.ls-now{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;margin-bottom:12px;background:rgba(255,255,255,.03)}
.ls-stage{display:inline-flex;gap:6px;align-items:center;padding:4px 11px;border-radius:20px;font-size:12px;font-weight:600;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
.ls-step{border-left:3px solid #ff4466;background:rgba(255,68,102,.08);border-radius:0 12px 12px 0;padding:9px 12px;font-size:13px;margin:10px 0}
.ls-step small{display:block;opacity:.6;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.ls-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.ls-usage{display:flex;flex-direction:column;gap:3px;font-size:11.5px;opacity:.7;margin-top:6px}
.ls-sbx{border:1px solid rgba(168,85,247,.35);background:rgba(168,85,247,.07);border-radius:12px;padding:10px 12px;font-size:12.5px}
.ls-sbx p{margin:6px 0}.ls-sbx q,.ls-alog q{display:block;font-style:italic;opacity:.65;font-size:11.5px;quotes:none;margin-top:3px}
.ls-sbx-h{display:flex;align-items:center;gap:8px}.ls-sbx-ms{margin-left:auto;opacity:.55;font-size:11px}
.ls-alog{display:flex;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,.06)}
.ls-d{min-width:42px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-weight:700;flex:none;background:rgba(255,255,255,.08)}
.ls-d.up{background:rgba(105,214,107,.15);color:#69d66b}.ls-d.dn{background:rgba(232,90,90,.15);color:#e85a5a}.ls-d.big{background:linear-gradient(135deg,#ff4466,#a855f7);color:#fff}
.ls-alog p{margin:0;font-size:12.5px}.ls-alog small{opacity:.6;font-size:11px}
.ls-badge{font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,.1);margin-left:6px;font-weight:600}.ls-badge.b{background:rgba(168,85,247,.25);color:#d8b4fe}.ls-badge.n{opacity:.6}
.ls-meter{margin:10px 0}.ls-meter .l{display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px}.ls-meter .l span:last-child{opacity:.65}
.ls-bar{height:8px;border-radius:8px;background:rgba(255,255,255,.1);overflow:hidden}.ls-bar span{display:block;height:100%;border-radius:8px}
.ls-pbox{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,.03)}
.ls-pbox h4{margin:0 0 6px;font-size:12.5px;display:flex;gap:7px;align-items:center}.ls-pbox h4 i{color:#ff4466}
.ls-danger{margin-top:18px;padding-top:6px;border-top:1px solid rgba(232,146,58,.35)}
.ls-setup{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;margin-bottom:12px;background:rgba(255,255,255,.03)}
.ls-setup-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}.ls-setup-row label{white-space:nowrap;font-size:12.5px}.ls-setup-row select{flex:1;min-width:0}
.ls-setup-t{font-size:12.5px;font-weight:600}
.ls-stages{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:6px;margin-bottom:8px}
.ls-stagebtn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit;font-size:11px;cursor:pointer;min-height:48px}
.ls-stagebtn i{color:var(--c);font-size:15px}.ls-stagebtn.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 18%,transparent)}
.ls-retry{border:1px solid rgba(232,146,58,.45);background:rgba(232,146,58,.08);border-radius:12px;padding:10px 12px;margin:10px 0;font-size:12.5px}
.ls-pre{white-space:pre-wrap;font-size:12px;opacity:.85;line-height:1.5;margin-top:6px}
#ls-widget[data-ls-status]::after{position:absolute;right:-3px;bottom:-3px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font:900 11px/1 "Font Awesome 6 Free","Font Awesome 5 Free",sans-serif;color:#fff;border:2px solid rgba(20,16,26,.9);pointer-events:none;z-index:3}
#ls-widget[data-ls-status="work"]::after{content:"\\f1ce";background:#a855f7;animation:ls-spin 1s linear infinite}
#ls-widget[data-ls-status="ok"]::after{content:"\\f00c";background:#2f9e44}
#ls-widget[data-ls-status="error"]::after{content:"\\f071";background:#e8923a}
@keyframes ls-spin{to{transform:rotate(360deg)}}
@media (max-width:560px){
 dialog.ls-popup-wide{margin:auto 0 0 0!important;width:100vw!important;max-width:100vw!important;height:auto!important;max-height:92dvh!important;border-radius:18px 18px 0 0!important}
 .ls-popup-wide::before{content:"";display:block;width:38px;height:4px;border-radius:4px;background:rgba(255,255,255,.28);margin:8px auto 0}
 .ls-popup-wide .ls-panel-inner{display:flex;flex-direction:column}
 .ls-popup-wide .ls-nav{order:99;position:sticky;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);overflow:visible;gap:0;padding:0;border-bottom:0;border-top:1px solid rgba(255,255,255,.1);background:var(--SmartThemeBlurTintColor,#1a1620);margin:6px 0 0;z-index:5}
 .ls-popup-wide .ls-nav-tab{flex-direction:column;justify-content:center;align-items:center;gap:3px;min-height:56px;padding:8px 2px;font-size:11px;border-bottom:0;border-top:2px solid transparent;text-align:center}
 .ls-popup-wide .ls-nav-tab i{font-size:19px}
 .ls-popup-wide .ls-nav-tab span{display:block}
 .ls-popup-wide .ls-nav-tab.active{border-top-color:#ff4466}
 .ls-pace-row span{width:92px}
}
@media (max-width:560px){
 dialog:has(.ls-panel-inner),.ls-mobile-shell{
  position:fixed!important;inset:auto 0 0!important;transform:none!important;
  box-sizing:border-box!important;width:calc(100dvw - 12px)!important;
  min-width:0!important;max-width:calc(100dvw - 12px)!important;
  height:auto!important;max-height:92dvh!important;margin:0 6px!important;
  padding:8px 12px max(12px,env(safe-area-inset-bottom))!important;
  border-radius:18px 18px 0 0!important;overflow-x:hidden!important;
  overflow-y:auto!important;overscroll-behavior:contain;scrollbar-width:none!important;
  -webkit-overflow-scrolling:touch;
 }
 dialog[open]:has(.ls-panel-inner){display:flex;flex-direction:column}
 dialog:has(.ls-panel-inner)::-webkit-scrollbar,.ls-mobile-shell::-webkit-scrollbar{width:0!important;height:0!important;display:none}
 .ls-mobile-shell .popup-body,.ls-mobile-shell .popup-content,
 .ls-mobile-shell .ls-popup-wide,.ls-mobile-shell .ls-panel-inner,
 dialog:has(.ls-panel-inner) .popup-body,dialog:has(.ls-panel-inner) .ls-panel-inner{
  box-sizing:border-box!important;width:100%!important;min-width:0!important;
  max-width:100%!important;height:auto!important;max-height:none!important;
  overflow:visible!important;flex:0 0 auto;padding:0!important;
 }
 .ls-mobile-shell .ls-panel-inner{display:flex;flex-direction:column;gap:10px}
 .ls-mobile-shell .ls-panel-inner>*,.ls-mobile-shell .ls-tab-content,
 .ls-mobile-shell .ls-pane,.ls-mobile-shell .ls-pbox,.ls-mobile-shell .ls-setup,.ls-mobile-shell .ls-now{
  box-sizing:border-box;min-width:0;max-width:100%;overflow-wrap:anywhere;
 }
 .ls-mobile-shell .ls-setup-row{flex-direction:column;align-items:stretch;gap:6px}
 .ls-mobile-shell .ls-setup-row label{white-space:normal}
 .ls-mobile-shell select,.ls-mobile-shell textarea,
 .ls-mobile-shell input.text_pole,.ls-mobile-shell input.ls-num-input{
  box-sizing:border-box!important;width:100%!important;min-width:0!important;
  max-width:100%!important;font-size:16px;min-height:42px;
 }
 .ls-mobile-shell textarea{min-height:76px;line-height:1.4;overflow-x:hidden;resize:vertical}
 .ls-mobile-shell .menu_button{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  box-sizing:border-box;min-width:0!important;width:auto!important;max-width:100%;
  min-height:42px;padding:9px 12px!important;line-height:1.3;font-size:14px;
  white-space:normal!important;word-break:normal;overflow-wrap:break-word;
  border:1px solid rgba(255,255,255,.15);border-radius:10px;
  background:rgba(255,255,255,.06);color:inherit;
 }
 .ls-mobile-shell .ls-actions{flex-direction:column;align-items:stretch;gap:8px}
 .ls-mobile-shell .ls-actions>.menu_button{width:100%!important;flex:none}
 .ls-mobile-shell .ls-nav{
  box-sizing:border-box;width:100%;min-width:0;order:99;position:sticky;bottom:0;
  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:visible;
  background:var(--SmartThemeBlurTintColor,#1a1620);margin:12px 0 0;z-index:5;
 }
 .ls-mobile-shell .ls-nav .ls-nav-tab{
  width:100%!important;min-width:0!important;min-height:56px;
  flex-direction:column;gap:3px;padding:8px 2px!important;font-size:11px;
 }
 .ls-mobile-shell .ls-chip,.ls-mobile-shell .ls-stage{max-width:100%;overflow-wrap:anywhere}
}
`;
export function injectAutoStyles() {
  if ($id('ls-autoview-styles')) return;
  const s = document.createElement('style'); s.id = 'ls-autoview-styles'; s.textContent = AUTO_CSS; document.head.appendChild(s);
}
