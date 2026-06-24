import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { EXT_NAME, defaultSettings, cfg } from './config.js';
import { injectStyles, syncUI, bindMainEvents, renderDebug, openLoveScorePanel } from './ui.js';
import { createWidget, refreshWidget } from './heart.js';
import { updatePromptInjection, onMessageReceived, onMessageDeleted, onSwipeGenerationStart } from './prompt.js';
import { renderGroupNpcs, showAutoRegenStatus, autoRegenAll } from './ai.js';
import { renderScoreLog, renderMilestones } from './ui.js';
import { tr } from './i18n.js';

// Зарегистрировать пункт в wand-меню (значок 🪄 над полем ввода)
function registerWandMenuItem() {
  if (document.getElementById('ls-wand-menu-item')) return true;
  const menu = document.getElementById('extensionsMenu');
  if (!menu) return false;
  const item = document.createElement('div');
  item.id = 'ls-wand-menu-item';
  item.className = 'list-group-item flex-container flexGap5 interactable ls-wand-item';
  item.tabIndex = 0;
  item.title = tr('Открыть Love Score');
  item.innerHTML = '<i class="fa-solid fa-heart"></i><span>Love Score</span>';
  item.addEventListener('click', () => { openLoveScorePanel(); });
  item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLoveScorePanel(); } });
  menu.appendChild(item);
  return true;
}

// ─── Инициализация ────────────────────────────────────────────────────────────
jQuery(() => {
  try {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = structuredClone(defaultSettings);
    const c = cfg();
    const _savedEnabled = c.isEnabled;
    for (const [k, v] of Object.entries(defaultSettings)) if (k !== 'isEnabled' && c[k] === undefined) c[k] = structuredClone(v);
    c.isEnabled = (_savedEnabled === false) ? false : true;
    if (c.widgetPos && c.widgetPos.top == null) c.widgetPos = null;
    if (!c.presets)              c.presets = [];
    if (!c.genScope)             c.genScope = { ...defaultSettings.genScope };
    if (!c.heartStyle)           c.heartStyle = 'svg';
    if (!c.groupNpcs)            c.groupNpcs = [];
    if (c.groupMode == null)     c.groupMode = false;
    if (!c.genLorebookEntryIds)  c.genLorebookEntryIds = [];
    if (c.genUseCard == null)    c.genUseCard = true;

    injectStyles();
    createWidget(openLoveScorePanel);
    updatePromptInjection();

    // Пункт в wand-меню — пытаемся сразу, при неудаче ждём появления меню
    if (!registerWandMenuItem()) {
      let tries = 0;
      const iv = setInterval(() => { if (registerWandMenuItem() || ++tries > 40) clearInterval(iv); }, 250);
      try { if (event_types.APP_READY) eventSource.on(event_types.APP_READY, registerWandMenuItem); } catch {}
    }

    eventSource.on(event_types.MESSAGE_SENT, () => updatePromptInjection());
    eventSource.on(event_types.MESSAGE_RECEIVED, (_msgId, type) =>
      onMessageReceived(syncUI, renderScoreLog, renderMilestones, renderGroupNpcs, showAutoRegenStatus, () => autoRegenAll(syncUI), type)
    );

    // Старт генерации свайпа — откатить инжект к базовому счёту, чтобы AI не считал
    // новый вариант поверх отклонённого (рерол-кнопка покрыта MESSAGE_DELETED).
    if (event_types.GENERATION_STARTED) eventSource.on(event_types.GENERATION_STARTED, (type, _opts, dryRun) =>
      onSwipeGenerationStart(type, dryRun)
    );

    // Удаление сообщения(ий) в таверне — откатить счёт и эффекты к состоянию «до удалённого поста»
    if (event_types.MESSAGE_DELETED) eventSource.on(event_types.MESSAGE_DELETED, (newLen) =>
      onMessageDeleted(newLen, () => { refreshWidget(); syncUI(); renderScoreLog(); renderMilestones(); renderGroupNpcs(); })
    );

    if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, () => {
      cfg().lastCheckedMessageId = null;
      cfg()._autoSuggestMsgCounter = 0;
      const _ar  = document.getElementById('ls-analyze-result');   if (_ar)  { _ar.style.display  = 'none'; _ar.innerHTML  = ''; }
      const _as  = document.getElementById('ls-analyze-status');   if (_as)    _as.textContent = '';
      const _ti  = document.getElementById('ls-type-info');        if (_ti)  { _ti.style.display  = 'none'; _ti.dataset.showing = ''; }
      const _sug = document.getElementById('ls-autosuggest-result'); if (_sug) { _sug.style.display = 'none'; _sug.innerHTML = ''; }
      updatePromptInjection();
      // Перерисовать виджет-сердце под данные нового чата (счёт, цвет, тип).
      refreshWidget();
      // обновлять открытую панель, если она на экране
      if (document.getElementById('ls-panel-inner')) syncUI();
    });
  } catch(e) {
    try { if (typeof toastr !== 'undefined') toastr.error?.('Love Score: ошибка инициализации — ' + e.message, 'Love Score'); } catch {}
  }
});
