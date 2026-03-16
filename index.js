import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { EXT_NAME, defaultSettings, cfg } from './config.js';
import { injectStyles, settingsPanelHTML, syncUI, bindMainEvents, renderDebug } from './ui.js';
import { createWidget } from './heart.js';
import { updatePromptInjection, onMessageReceived } from './prompt.js';
import { renderGroupNpcs, showAutoRegenStatus, autoRegenAll } from './ai.js';
import { renderScoreLog, renderMilestones } from './ui.js';

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
    $('#extensions_settings').append(settingsPanelHTML());
    createWidget();
    bindMainEvents();
    syncUI();
    updatePromptInjection();

    eventSource.on(event_types.MESSAGE_SENT, () => updatePromptInjection());
    eventSource.on(event_types.MESSAGE_RECEIVED, () =>
      onMessageReceived(syncUI, renderScoreLog, renderMilestones, renderGroupNpcs, showAutoRegenStatus, () => autoRegenAll(syncUI))
    );

    if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, () => {
      cfg().lastCheckedMessageId = null;
      cfg()._autoSuggestMsgCounter = 0;
      const _ar  = document.getElementById('ls-analyze-result');   if (_ar)  { _ar.style.display  = 'none'; _ar.innerHTML  = ''; }
      const _as  = document.getElementById('ls-analyze-status');   if (_as)    _as.textContent = '';
      const _ti  = document.getElementById('ls-type-info');        if (_ti)  { _ti.style.display  = 'none'; _ti.dataset.showing = ''; }
      const _sug = document.getElementById('ls-autosuggest-result'); if (_sug) { _sug.style.display = 'none'; _sug.innerHTML = ''; }
      syncUI(); updatePromptInjection();
    });
  } catch(e) {
    try { if (typeof toastr !== 'undefined') toastr.error?.('Love Score: ошибка инициализации — ' + e.message, 'Love Score'); } catch {}
  }
});
