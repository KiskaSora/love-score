import { saveSettingsDebounced } from '../../../../script.js';
import { cfg, loveData, chatLoveData, MIN_SCORE, RELATION_TYPES, toast, escHtml, addToLog } from './config.js';
import { _h2r }        from './heart.js';
import { autoSnapshot } from './state.js';
import { updatePromptInjection } from './prompt.js';

// ─── Персонаж ─────────────────────────────────────────────────────────────────
export function getCurrentCharacterCard() {
  try {
    const ctx = SillyTavern?.getContext?.(); if (!ctx) return null;
    if (ctx.characterId !== undefined && Array.isArray(ctx.characters)) return ctx.characters[ctx.characterId] ?? null;
    if (Array.isArray(ctx.characters) && ctx.characters.length > 0) return ctx.characters[0];
  } catch {} return null;
}
export function getCharacterAvatarUrl(char) {
  if (!char) return null;
  const av = char.avatar || (char.data && char.data.avatar);
  if (!av || av === 'none') return null;
  return '/characters/' + av;
}
export function updateCharPreview(char) {
  const img = document.getElementById('ls-char-avatar'), name = document.getElementById('ls-char-avatar-name');
  if (!img || !name) return;
  const url = getCharacterAvatarUrl(char);
  if (url) { img.src = url; img.classList.remove('ls-avatar-hidden'); img.onerror = () => img.classList.add('ls-avatar-hidden'); }
  else { img.classList.add('ls-avatar-hidden'); img.src = ''; }
  name.textContent = char?.name || '';
}
export function buildCharacterCardText(char) {
  if (!char) return ''; const parts = [], s = v => (typeof v === 'string' && v.trim()) ? v.trim() : null;
  if (s(char.name))        parts.push('Name: '+char.name.trim());
  if (s(char.description)) parts.push('Description:\n'+char.description.trim());
  if (s(char.personality)) parts.push('Personality:\n'+char.personality.trim());
  if (s(char.scenario))    parts.push('Scenario:\n'+char.scenario.trim());
  if (s(char.mes_example)) parts.push('Example dialogue:\n'+char.mes_example.trim());
  const d = char.data; if (d) {
    if (s(d.description) && d.description !== char.description) parts.push('Description:\n'+d.description.trim());
    if (s(d.personality) && d.personality !== char.personality) parts.push('Personality:\n'+d.personality.trim());
    if (s(d.scenario)    && d.scenario    !== char.scenario)    parts.push('Scenario:\n'+d.scenario.trim());
    if (s(d.character_note)) parts.push('Creator notes:\n'+d.character_note.trim());
    if (Array.isArray(d.tags) && d.tags.length) parts.push('Tags: '+d.tags.join(', '));
  }
  return parts.join('\n\n');
}

export function getBaseUrl() {
  return (cfg().genEndpoint || '').trim().replace(/\/+$/,'').replace(/\/chat\/completions$/,'').replace(/\/v1$/,'');
}
export function getScopeFromUI() {
  const el = id => document.getElementById(id);
  return {
    changes:        el('ls-scope-changes')?.checked        ?? true,
    positiveRanges: el('ls-scope-pos-ranges')?.checked     ?? true,
    negativeRanges: el('ls-scope-neg-ranges')?.checked     ?? true,
    milestones:     el('ls-scope-milestones')?.checked     ?? true,
    suggestedMax:   el('ls-scope-max')?.checked            ?? true
  };
}

// ─── Модели ───────────────────────────────────────────────────────────────────
export async function fetchModelsForSelect() {
  const base = getBaseUrl(), apiKey = (cfg().genApiKey || '').trim();
  if (!base || !apiKey) { toast('warning', 'Укажи Endpoint и API Key'); return []; }
  const resp = await fetch(base+'/v1/models', { method:'GET', headers:{ 'Authorization':'Bearer '+apiKey } });
  if (!resp.ok) throw new Error('HTTP '+resp.status);
  const data = await resp.json();
  return (data.data || data.models || []).map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean).sort();
}

export async function onRefreshModels() {
  const btn = document.getElementById('ls-refresh-models'), sel = document.getElementById('ls-gen-model-select');
  if (!btn || !sel) return; btn.classList.add('ls-loading');
  try {
    const models = await fetchModelsForSelect(), current = cfg().genModel;
    sel.innerHTML = '<option value="">-- выбери модель --</option>';
    models.forEach(id => { const opt = document.createElement('option'); opt.value = id; opt.textContent = id; if (id === current) opt.selected = true; sel.appendChild(opt); });
    if (!models.length) toast('warning', 'Список моделей пуст'); else toast('success', 'Загружено: '+models.length);
  } catch(e) { toast('error', 'Ошибка: '+e.message); } finally { btn.classList.remove('ls-loading'); }
}

// ─── AI генерация ─────────────────────────────────────────────────────────────
export async function generateLoveScoreWithAI(charCard, scope, chatHistory='') {
  const c = cfg(), base = getBaseUrl(), apiKey = (c.genApiKey||'').trim(), model = (c.genModel||'').trim() || 'gpt-4o';
  if (!base)   throw new Error('Укажи Endpoint');
  if (!apiKey) throw new Error('Укажи API Key');
  const d = loveData(), maxScore = d.maxScore || 100;
  const lang = c.genLang || 'ru', langLabel = lang === 'ru' ? 'Russian' : 'English';
  const userNotes = (c.genUserNotes || '').trim();
  const systemMsg = 'You are configuring a Love Score system for a text-based RPG. Reply with ONLY valid JSON — no explanations, no markdown, no code blocks.';
  const wantChanges = scope.changes, wantPosRange = scope.positiveRanges, wantNegRange = scope.negativeRanges, wantMs = scope.milestones, wantMax = scope.suggestedMax;
  let schemaLines = ['{'];
  if (wantMax)                        schemaLines.push('  "suggestedMax": '+maxScore+',');
  if (wantChanges)                    schemaLines.push('  "changes": [{"delta": 2, "text": "..."},{"delta": -10, "text": "..."}],');
  if (wantPosRange || wantNegRange) {
    const ex = [];
    if (wantNegRange) ex.push('{"min": -100, "max": -1, "text": "..."}');
    if (wantPosRange) ex.push('{"min": 0, "max": 20, "text": "..."}');
    schemaLines.push('  "ranges": ['+ex.join(',')+'],');
  }
  if (wantMs) schemaLines.push('  "milestones": [{"threshold": 15, "text": "..."}]');
  schemaLines.push('}');
  let rulesLines = ['RULES:'];
  if (wantChanges)  rulesLines.push('- changes: at least 6 items with varied positive and negative deltas');
  if (wantNegRange) rulesLines.push('- negative ranges (min:'+MIN_SCORE+' to max:-1): describe hostility, hatred, fear — no gaps');
  if (wantPosRange) rulesLines.push('- positive ranges (min:0 to max:'+maxScore+'): describe attraction and love — no gaps');
  if (wantMs)       rulesLines.push('- milestones: at least 5 POSITIVE thresholds only, ordered ascending');
  if (wantMax)      rulesLines.push('- suggestedMax: suggest higher max (200-300) for cold/distant characters');
  rulesLines.push('- All text in '+langLabel);
  if (userNotes)    rulesLines.push('', 'SPECIAL USER INSTRUCTIONS (priority):', userNotes);
  const omitNote = (!wantChanges||!wantPosRange||!wantNegRange||!wantMs) ? 'NOTE: Only generate the fields listed in the schema.' : '';
  const hasHistory = chatHistory.trim().length > 0;
  const userMsg = [
    hasHistory ? 'Analyze the character card AND the real chat history to generate accurate love score rules.' : 'Analyze the character card and generate love score rules.',
    'Score range: '+MIN_SCORE+' to '+maxScore+'. Negative = hostility/hatred. Positive = love/affection.',
    '', 'CHARACTER CARD:', charCard, '',
    ...(hasHistory ? ['RECENT CHAT HISTORY (use this to ground all descriptions in the real dynamic):', chatHistory, ''] : []),
    ...(hasHistory ? ['IMPORTANT: Base all change descriptions, ranges and milestones on what actually happens in this chat.'] : []),
    omitNote,
    'Reply with STRICTLY valid JSON matching this schema exactly:', ...schemaLines, '',
    ...rulesLines
  ].filter(Boolean).join('\n');
  const resp = await fetch(base+'/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
    body: JSON.stringify({ model, messages:[{role:'system',content:systemMsg},{role:'user',content:userMsg}], temperature:0.7, max_tokens:2800 })
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP '+resp.status+': '+t.slice(0,300)); }
  const result = await resp.json();
  const text = result?.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('ИИ вернул пустой ответ');
  return text;
}

export function parseAIResponse(raw) {
  try {
    let cleaned = raw.replace(/^```[\w]*\n?/gm,'').replace(/```$/gm,'').trim();
    const _js = cleaned.indexOf('{'), _je = cleaned.lastIndexOf('}');
    if (_js !== -1 && _je > _js) cleaned = cleaned.slice(_js, _je+1);
    const p = JSON.parse(cleaned);
    const changes    = (p.changes    || []).filter(x => typeof x.delta === 'number' && x.text).map(x => ({ delta:x.delta, description:String(x.text).trim() }));
    const ranges     = (p.ranges     || []).filter(x => typeof x.min === 'number' && typeof x.max === 'number' && x.text).map(x => ({ min:x.min, max:x.max, description:String(x.text).trim() }));
    const milestones = (p.milestones || []).filter(x => typeof x.threshold === 'number' && x.text).sort((a,b) => a.threshold-b.threshold).map(x => ({ threshold:x.threshold, description:String(x.text).trim(), done:false }));
    return { changes, ranges, milestones, suggestedMax: p.suggestedMax || null, ok:true };
  } catch { return { changes:[], ranges:[], milestones:[], suggestedMax:null, ok:false }; }
}

export function getChatHistory(n) {
  try {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx?.chat?.length) return '';
    const msgs = n > 0 ? ctx.chat.slice(-n) : ctx.chat;
    const charName = getCurrentCharacterCard()?.name || 'Персонаж';
    return msgs.map(m => { const who = m.is_user ? 'Игрок' : charName; return who+': '+(m.mes||'').trim().slice(0,500); }).join('\n\n');
  } catch { return ''; }
}

// ─── AI анализ ────────────────────────────────────────────────────────────────
export async function analyzeWithAI(charCard, chatHistory) {
  const c = cfg(), base = getBaseUrl(), apiKey = (c.genApiKey||'').trim(), model = (c.genModel||'').trim() || 'gpt-4o';
  if (!base)   throw new Error('Не указан Endpoint');
  if (!apiKey) throw new Error('Не указан API Key');
  const d = loveData(), lang = c.genLang === 'ru';
  const systemMsg = 'You are an expert analyst for a text-based RPG relationship tracker. Reply ONLY with valid JSON, no markdown.';
  const userMsg = [
    'Analyze the relationship between the player and the character based on the chat history.',
    'Current love score: '+d.score+' (range: '+MIN_SCORE+' to '+d.maxScore+'). Negative=hostility, positive=affection.',
    '', 'CHARACTER CARD:', charCard, '', 'RECENT CHAT HISTORY:', chatHistory, '',
    'Reply in '+(lang?'Russian':'English')+' with STRICTLY valid JSON:',
    '{"suggestedScore":<integer>,"relationType":"<one of: romance|friendship|family|obsession|rival|platonic>","analysis":"<2-3 sentences>","reasoning":"<why this score>"}',
    'RULES: suggestedScore must be integer between '+MIN_SCORE+' and '+d.maxScore+'.',
  ].join('\n');
  const resp = await fetch(base+'/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
    body: JSON.stringify({ model, messages:[{role:'system',content:systemMsg},{role:'user',content:userMsg}], temperature:0.5, max_tokens:600 })
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP '+resp.status+': '+t.slice(0,200)); }
  const result = await resp.json();
  const text = result?.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('Пустой ответ от AI');
  return text;
}

export function parseAnalyzeResponse(raw) {
  try {
    const cleaned = raw.replace(/```json\n?/gm,'').replace(/```\n?/gm,'').trim();
    const p = JSON.parse(cleaned);
    const validRT = Object.keys(RELATION_TYPES);
    return { suggestedScore: typeof p.suggestedScore === 'number' ? Math.round(p.suggestedScore) : null, relationType: validRT.includes(p.relationType) ? p.relationType : null, analysis: String(p.analysis||''), reasoning: String(p.reasoning||''), ok:true };
  } catch { return { suggestedScore:null, analysis:'', reasoning:'', ok:false }; }
}

// ─── Авто-регенерация ─────────────────────────────────────────────────────────
export function showAutoRegenStatus(text) {
  const box = document.getElementById('ls-autosuggest-result'); if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div class="ls-as-title"><i class="fa-solid fa-rotate"></i>&nbsp;Авто-регенерация <button id="ls-as-close" class="menu_button ls-del-btn" style="float:right">✕</button></div>'
    + '<div style="font-size:12px;line-height:1.6;">'+text+'</div>';
  document.getElementById('ls-as-close')?.addEventListener('click', () => { box.style.display = 'none'; });
}

export async function autoRegenAll(syncUI) {
  const c = cfg();
  const base = getBaseUrl(), apiKey = (c.genApiKey || '').trim();
  if (!base || !apiKey) {
    toast('warning', '💫 Авто-реген: укажи Endpoint и API Key в настройках AI');
    showAutoRegenStatus('⚠️ Не настроен API — укажи Endpoint и API Key во вкладке «AI генерация»');
    return;
  }
  const allScope = { changes:true, positiveRanges:true, negativeRanges:true, milestones:true, suggestedMax:true };
  const msgN    = Math.max(0, parseInt(c.chatAnalysisMsgCount ?? 20));
  const history = msgN > 0 ? getChatHistory(msgN) : '';
  const useCard = c.genUseCard !== false;
  const lbText  = getLorebookTextForGen();
  const hasLb   = lbText.trim().length > 0;
  if (!useCard && !hasLb) {
    toast('warning', '💫 Авто-реген: нет источника данных — включи карточку или выбери лорбук в AI');
    showAutoRegenStatus('⚠️ Нет источника — включи карточку персонажа или выбери записи лорбука');
    return;
  }
  let cardText = '';
  if (useCard) { const char = getCurrentCharacterCard(); if (char) { const ct = buildCharacterCardText(char); if (ct.trim()) cardText += ct; } }
  if (hasLb)  { if (cardText.trim()) cardText += '\n\n═══ LOREBOOK ═══\n\n'; cardText += lbText; }
  if (!cardText.trim()) {
    toast('warning', '💫 Авто-реген: карточка персонажа пустая');
    showAutoRegenStatus('⚠️ Карточка персонажа пустая — открой чат с персонажем');
    return;
  }
  toast('info', '💫 Авто-реген: обновляю правила...');
  showAutoRegenStatus('⏳ Авто-обновление правил...');
  try {
    autoSnapshot('Авто-реген');
    const raw    = await generateLoveScoreWithAI(cardText, allScope, history);
    const parsed = parseAIResponse(raw);
    if (!parsed.ok) { showAutoRegenStatus('⚠️ Не удалось разобрать ответ AI — попробуй снова'); toast('error', '💫 Авто-реген: ошибка разбора ответа AI'); return; }
    const d = loveData(); let updatedParts = [];
    if (parsed.changes.length)    { d.scoreChanges = parsed.changes; updatedParts.push('правил: '+parsed.changes.length); }
    if (parsed.ranges.length)     { d.scaleInterpretations = parsed.ranges; updatedParts.push('диапазонов: '+parsed.ranges.length); }
    if (parsed.milestones.length) { d.milestones = parsed.milestones; updatedParts.push('событий: '+parsed.milestones.length); }
    if (parsed.suggestedMax && parsed.suggestedMax !== d.maxScore) { d.maxScore = parsed.suggestedMax; c.maxScore = parsed.suggestedMax; updatedParts.push('макс: '+parsed.suggestedMax); }
    saveSettingsDebounced(); updatePromptInjection(); if (syncUI) syncUI();
    const srcParts = [];
    if (useCard && cardText.trim()) { try { srcParts.push(getCurrentCharacterCard()?.name || 'персонаж'); } catch {} }
    if (hasLb) srcParts.push(_getValidLbIds().length+' запис. лорбука');
    const summary = updatedParts.length ? ' ('+updatedParts.join(', ')+')' : '';
    showAutoRegenStatus('✅ Правила обновлены: '+escHtml(srcParts.join(' + '))+escHtml(summary));
    toast('success', '💫 Авто-реген: правила обновлены'+summary);
  } catch(e) {
    showAutoRegenStatus('⚠️ Ошибка авто-регена: '+e.message);
    toast('error', '💫 Авто-реген: '+e.message.slice(0,80));
  }
}

export async function onAnalyzeClick(syncUI, renderScoreLog, renderMilestones) {
  const btn = document.getElementById('ls-analyze-btn'), status = document.getElementById('ls-analyze-status'), result = document.getElementById('ls-analyze-result');
  if (!btn || !status) return;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Анализирую...';
  status.textContent = 'Запрос к API...'; if (result) result.style.display = 'none';
  try {
    const useCard = cfg().genUseCard !== false;
    const lbText  = getLorebookTextForGen();
    const hasLb   = lbText.trim().length > 0;
    if (!useCard && !hasLb) { status.textContent = 'Выбери хотя бы один источник (карточка или лорбук).'; return; }
    let cardText = '';
    if (useCard) { const char = getCurrentCharacterCard(); if (char) { const ct = buildCharacterCardText(char); if (ct.trim()) cardText += ct; } }
    if (hasLb)   { if (cardText.trim()) cardText += '\n\n═══ LOREBOOK ═══\n\n'; cardText += lbText; }
    if (!cardText.trim()) { status.textContent = 'Нет данных для анализа.'; return; }
    const n = parseInt(cfg().chatAnalysisMsgCount ?? 20);
    const history = getChatHistory(n); if (!history.trim()) { status.textContent = 'Нет сообщений в чате.'; return; }
    status.textContent = 'Анализирую '+n+' сообщений...';
    const raw    = await analyzeWithAI(cardText, history);
    const parsed = parseAnalyzeResponse(raw);
    if (!parsed.ok || parsed.suggestedScore === null) { status.textContent = raw.slice(0,150); return; }
    status.textContent = '';
    if (result) {
      const d = loveData(), diff = parsed.suggestedScore - d.score, diffStr = diff > 0 ? '+'+diff : String(diff);
      const _rtInfo = parsed.relationType ? RELATION_TYPES[parsed.relationType] : null;
      result.style.display = 'block';
      result.innerHTML =
        '<div class="ls-analyze-score">Рекомендуемый счёт: <strong>'+parsed.suggestedScore+'</strong>'
        +'<span style="opacity:.5;font-size:11px;margin-left:6px">(сейчас '+d.score+', '+(diff!==0?diffStr:'без изменений')+')</span></div>'
        +(_rtInfo ? '<div class="ls-analyze-reltype">'
          +'<span style="color:'+_rtInfo.color+';font-size:18px;">&#10084;</span>'
          +'<span style="font-size:12px;margin-left:6px;opacity:.8;">'+escHtml(_rtInfo.label)+'</span>'
          +'<button class="menu_button" data-rt="'+parsed.relationType+'" id="ls-rt-confirm-btn" style="margin-left:8px;padding:2px 8px;font-size:11px;">Применить тип</button>'
          +'</div>' : '')
        +(parsed.analysis  ? '<div class="ls-analyze-text">'+escHtml(parsed.analysis)+'</div>'   : '')
        +(parsed.reasoning ? '<div class="ls-analyze-reason">'+escHtml(parsed.reasoning)+'</div>' : '')
        +'<button id="ls-analyze-apply" class="menu_button" style="margin-top:8px;width:100%"><i class="fa-solid fa-check"></i> Применить счёт '+parsed.suggestedScore+'</button>';
      document.getElementById('ls-rt-confirm-btn')?.addEventListener('click', function() {
        loveData().relationType = this.dataset.rt || 'neutral';
        saveSettingsDebounced(); if (syncUI) syncUI();
        toast('success', 'Тип: '+(RELATION_TYPES[this.dataset.rt]?.label || ''));
      });
      document.getElementById('ls-analyze-apply')?.addEventListener('click', () => {
        const d = loveData(), prev = d.score;
        d.score = Math.max(MIN_SCORE, Math.min(parsed.suggestedScore, d.maxScore));
        const delta = d.score - prev; if (delta !== 0) addToLog(d, delta, 'AI анализ чата');
        saveSettingsDebounced(); updatePromptInjection(); if (syncUI) syncUI(); if (renderScoreLog) renderScoreLog();
        toast('success', 'Счёт установлен: '+d.score);
      });
    }
    toast('success', 'Анализ готов → '+parsed.suggestedScore);
  } catch(e) { status.textContent = e.message; toast('error', e.message); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-chart-line"></i> Анализировать чат'; }
}

export async function onGenerateClick(syncUI) {
  const btn = document.getElementById('ls-gen-btn'), status = document.getElementById('ls-gen-status');
  if (!btn || !status) return;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Генерирую...'; status.textContent = 'Обращаюсь к API...';
  try {
    const scope = getScopeFromUI();
    if (!scope.changes && !scope.positiveRanges && !scope.negativeRanges && !scope.milestones) { status.textContent = 'Выбери хотя бы одну секцию.'; return; }
    autoSnapshot('До генерации');
    const useCard = cfg().genUseCard !== false;
    const lbText  = getLorebookTextForGen();
    const hasLb   = lbText.trim().length > 0;
    if (!useCard && !hasLb) { status.textContent = 'Выбери хотя бы один источник (карточка или лорбук).'; return; }
    let cardText = '', sourceNames = [];
    if (useCard) { const char = getCurrentCharacterCard(); if (char) { const ct = buildCharacterCardText(char); if (ct.trim()) { cardText += ct; sourceNames.push(char.name || 'персонаж'); } } }
    if (hasLb)   { if (cardText.trim()) cardText += '\n\n═══ LOREBOOK ═══\n\n'; cardText += lbText; sourceNames.push(_getValidLbIds().length+' запис. лорбука'); }
    if (!cardText.trim()) { status.textContent = 'Нет данных для генерации.'; return; }
    const _genMsgN   = parseInt(cfg().chatAnalysisMsgCount ?? 0);
    const _genHistory = _genMsgN > 0 ? getChatHistory(_genMsgN) : '';
    status.textContent = _genHistory ? 'Читаю '+_genMsgN+' сообщ. + источник...' : 'Читаю источник...';
    const raw    = await generateLoveScoreWithAI(cardText, scope, _genHistory);
    const parsed = parseAIResponse(raw);
    if (!parsed.ok) { status.textContent = 'Ошибка разбора: '+raw.slice(0,120); return; }
    const d = loveData();
    if (parsed.changes.length > 0 && scope.changes) d.scoreChanges = parsed.changes;
    if (parsed.ranges.length > 0 && (scope.positiveRanges || scope.negativeRanges)) {
      if (scope.positiveRanges && scope.negativeRanges) d.scaleInterpretations = parsed.ranges;
      else if (scope.positiveRanges) d.scaleInterpretations = [...d.scaleInterpretations.filter(x=>x.max<0), ...parsed.ranges.filter(x=>x.min>=0)];
      else d.scaleInterpretations = [...parsed.ranges.filter(x=>x.max<0), ...d.scaleInterpretations.filter(x=>x.min>=0)];
    }
    if (parsed.milestones?.length > 0 && scope.milestones) d.milestones = parsed.milestones;
    if (parsed.suggestedMax && scope.suggestedMax && parsed.suggestedMax !== d.maxScore) { d.maxScore = parsed.suggestedMax; cfg().maxScore = parsed.suggestedMax; toast('info', 'Максимум изменён на '+parsed.suggestedMax); }
    saveSettingsDebounced(); updatePromptInjection(); if (syncUI) syncUI();
    status.textContent = 'Готово. Правил: '+parsed.changes.length+', диапазонов: '+parsed.ranges.length+', событий: '+parsed.milestones.length;
    toast('success', 'Сгенерировано: '+sourceNames.join(' + '));
  } catch(e) { status.textContent = 'Ошибка: '+(e.message||e); toast('error', e.message||e); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать'; }
}

// ─── Лорбук ───────────────────────────────────────────────────────────────────
export function getLorebooks() {
  const entries = [];
  try {
    const ctx = SillyTavern?.getContext?.(); if (!ctx) return entries;
    const charIdx = ctx.characterId;
    const char    = Array.isArray(ctx.characters) ? ctx.characters[charIdx] : null;
    const embedded = char?.data?.character_book?.entries || char?.character_book?.entries || [];
    embedded.forEach((e,i) => {
      const label = e.comment?.trim() || (e.keys||[]).filter(Boolean).join(', ') || ('Запись '+(i+1));
      entries.push({ source:'embedded', label, content:e.content||'', keys:e.keys||[], id:'emb_'+i });
    });
    const wi = ctx.worldInfo;
    if (wi) {
      const wiEntries = wi.entries ? Object.values(wi.entries) : (Array.isArray(wi) ? wi : []);
      wiEntries.forEach((e,i) => {
        const label = e.comment?.trim() || (e.key||e.keys||[]).join?.(',') || ('WI '+(i+1));
        const src   = e.world || e.book || 'worldinfo';
        entries.push({ source:src, label, content:e.content||'', keys:e.key||e.keys||[], id:'wi_'+i });
      });
    }
    if (typeof ctx.getWorldInfo === 'function') {
      try {
        const wData = ctx.getWorldInfo();
        if (wData?.entries) {
          Object.values(wData.entries).forEach((e,i) => {
            const label = e.comment?.trim() || (e.key||[]).join(', ') || ('WI2 '+(i+1));
            if (!entries.find(x => x.content === e.content))
              entries.push({ source:e.world||'worldinfo', label, content:e.content||'', keys:e.key||[], id:'wi2_'+i });
          });
        }
      } catch {}
    }
  } catch {}
  return entries;
}

export function _getValidLbIds() {
  const saved = cfg().genLorebookEntryIds || [];
  if (!saved.length) return [];
  try { const available = new Set(getLorebooks().map(e => e.id)); return saved.filter(id => available.has(id)); }
  catch { return saved; }
}

export function _updateGenLbCounter() {
  const ids = _getValidLbIds();
  const lbl = document.getElementById('ls-gen-lb-count');
  if (lbl) lbl.textContent = ids.length ? `${ids.length} ${ids.length===1?'запись':ids.length<5?'записи':'записей'} выбрано` : '';
  const lbCard = document.getElementById('ls-src-lb-label');
  const lbCb   = document.getElementById('ls-gen-use-lb');
  if (lbCard && lbCb) { lbCard.classList.toggle('ls-src-active', ids.length > 0); lbCb.checked = ids.length > 0; }
  _syncSourceCards();
}

export function _syncSourceCards() {
  const useCard = document.getElementById('ls-gen-use-card');
  const cardLbl = document.getElementById('ls-src-card-label');
  if (useCard && cardLbl) cardLbl.classList.toggle('ls-src-active', useCard.checked);
  const ids   = _getValidLbIds();
  const lbLbl = document.getElementById('ls-src-lb-label');
  if (lbLbl) lbLbl.classList.toggle('ls-src-active', ids.length > 0);
  const nameEl = document.getElementById('ls-src-card-name');
  if (nameEl) { try { const ch = getCurrentCharacterCard(); nameEl.textContent = ch?.name || '—'; } catch { nameEl.textContent = '—'; } }
  const lbSub = document.getElementById('ls-src-lb-sub');
  if (lbSub) { if (ids.length > 0) lbSub.textContent = `${ids.length} ${ids.length===1?'запись':ids.length<5?'записи':'записей'}`; else lbSub.textContent = '—'; }
  const summary = document.getElementById('ls-source-summary');
  if (summary) {
    const cardOn = useCard?.checked, lbOn = ids.length > 0;
    if (!cardOn && !lbOn) {
      summary.innerHTML = '<span class="ls-source-summary-empty"><i class="fa-solid fa-triangle-exclamation" style="margin-right:5px;color:#f59e0b;opacity:.7;"></i>Выбери хотя бы один источник</span>';
    } else {
      let parts = [];
      if (cardOn) { try { const ch = getCurrentCharacterCard(); parts.push(`<span class="ls-src-tag ls-src-tag-card"><i class="fa-solid fa-address-card"></i>${escHtml(ch?.name||'Карточка')}</span>`); } catch { parts.push(`<span class="ls-src-tag ls-src-tag-card"><i class="fa-solid fa-address-card"></i>Карточка</span>`); } }
      if (lbOn)   parts.push(`<span class="ls-src-tag ls-src-tag-lb"><i class="fa-solid fa-book-bookmark"></i>${ids.length} ${ids.length===1?'запись':ids.length<5?'записи':'записей'}</span>`);
      summary.innerHTML = parts.length === 2 ? parts[0] + '<span class="ls-src-plus">+</span>' + parts[1] : parts[0];
    }
  }
}

export function getLorebookTextForGen() {
  const ids = _getValidLbIds();
  if (!ids.length) return '';
  const entries  = getLorebooks();
  const selected = entries.filter(e => ids.includes(e.id));
  if (!selected.length) return '';
  return selected.map(e => `[${e.label}]\n${e.content || ''}`).join('\n\n---\n\n');
}

export function renderGenLorebookPicker() {
  const ct = document.getElementById('ls-gen-lb-list'); if (!ct) return;
  const entries  = getLorebooks();
  const selected = new Set(cfg().genLorebookEntryIds || []);
  if (!entries.length) {
    ct.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 12px;opacity:.35;text-align:center;">
      <i class="fa-solid fa-book-open" style="font-size:22px;"></i>
      <div style="font-size:11px;font-style:italic;line-height:1.5;">Нет записей — подключи лорбук к персонажу</div>
    </div>`;
    return;
  }
  const groups = {};
  entries.forEach(e => { (groups[e.source] || (groups[e.source] = [])).push(e); });
  ct.innerHTML = Object.entries(groups).map(([src, ents]) => {
    const srcLabel   = src === 'embedded' ? 'Встроенный лорбук' : src;
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
        const preview   = (e.content || '').slice(0, 80).replace(/\n/g,' ');
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
  $(ct).off('change','.ls-gen-lb-cb').on('change','.ls-gen-lb-cb', function() {
    const id = this.dataset.lbid;
    const ids = new Set(cfg().genLorebookEntryIds || []);
    if (this.checked) ids.add(id); else ids.delete(id);
    cfg().genLorebookEntryIds = [...ids];
    saveSettingsDebounced(); _updateGenLbCounter();
    const icon = this.closest('.ls-gen-lb-entry')?.querySelector('.ls-gen-lb-check-icon i');
    if (icon) { icon.className = `fa-solid fa-${this.checked?'square-check':'square'}`; icon.style.color = this.checked ? '#ff4466' : 'rgba(255,255,255,.15)'; }
    this.closest('.ls-gen-lb-entry')?.classList.toggle('ls-gen-lb-checked', this.checked);
  });
  $(ct).off('click','.ls-gen-lb-sel-all').on('click','.ls-gen-lb-sel-all', function(ev) {
    ev.preventDefault();
    const src = this.dataset.src;
    const ids = new Set(cfg().genLorebookEntryIds || []);
    ct.querySelectorAll(`.ls-gen-lb-cb[data-src="${src}"]`).forEach(cb => { ids.add(cb.dataset.lbid); cb.checked = true; });
    cfg().genLorebookEntryIds = [...ids]; saveSettingsDebounced(); renderGenLorebookPicker();
  });
  $(ct).off('click','.ls-gen-lb-sel-none').on('click','.ls-gen-lb-sel-none', function(ev) {
    ev.preventDefault();
    const src = this.dataset.src;
    const ids = new Set(cfg().genLorebookEntryIds || []);
    ct.querySelectorAll(`.ls-gen-lb-cb[data-src="${src}"]`).forEach(cb => { ids.delete(cb.dataset.lbid); cb.checked = false; });
    cfg().genLorebookEntryIds = [...ids]; saveSettingsDebounced(); renderGenLorebookPicker();
  });
}

export function renderLorebookPicker() {
  const ct = document.getElementById('ls-lorebook-picker-list'); if (!ct) return;
  const entries = getLorebooks();
  if (!entries.length) {
    ct.innerHTML = '<div class="ls-group-empty" style="padding:10px;"><i class="fa-solid fa-book-open" style="margin-right:6px;opacity:.4;"></i>Нет записей — убедись что у персонажа есть лорбук</div>';
    return;
  }
  const groups = {};
  entries.forEach(e => { (groups[e.source] || (groups[e.source] = [])).push(e); });
  ct.innerHTML = Object.entries(groups).map(([src, ents]) =>
    `<div class="ls-lb-group">
      <div class="ls-lb-group-title"><i class="fa-solid fa-book" style="margin-right:5px;opacity:.5;"></i>${escHtml(src==='embedded'?'Встроенный лорбук':src)}</div>
      ${ents.map(e => `<div class="ls-lb-entry" data-lbid="${escHtml(e.id)}" title="${escHtml((e.keys||[]).join(', '))}">
        <div class="ls-lb-entry-name"><i class="fa-solid fa-feather" style="margin-right:5px;opacity:.35;font-size:10px;"></i>${escHtml(e.label)}</div>
        <div class="ls-lb-entry-preview">${escHtml((e.content||'').slice(0,80))}${(e.content||'').length>80?'…':''}</div>
        <button class="menu_button ls-lb-add-btn" data-lbid="${escHtml(e.id)}" title="Добавить в окружение"><i class="fa-solid fa-plus"></i></button>
      </div>`).join('')}
    </div>`
  ).join('');
  $(ct).off('click','.ls-lb-add-btn').on('click','.ls-lb-add-btn', function(ev) {
    ev.stopPropagation();
    const id    = this.dataset.lbid;
    const entry = getLorebooks().find(e => e.id === id); if (!entry) return;
    const firstName = (entry.keys||[]).find(k=>k.trim()) || entry.label || 'NPC';
    const npc = mkNpc({ name:firstName, nameEn:firstName, description:entry.content, fromLorebook:true, skipDescInject:true });
    const ld  = chatLoveData(); if (!ld.groupNpcs) ld.groupNpcs = [];
    ld.groupNpcs.push(npc);
    saveGroupNpcs(); renderGroupNpcs();
    const el = ct.querySelector(`[data-lbid="${id}"]`);
    if (el) { el.style.opacity = '.4'; this.innerHTML = '<i class="fa-solid fa-check"></i>'; this.disabled = true; }
    toast('success', escHtml(firstName)+' добавлен из лорбука');
  });
  $(ct).off('click','.ls-lb-entry').on('click','.ls-lb-entry', function(e) {
    if ($(e.target).closest('button').length) return;
    $(this).toggleClass('ls-lb-expanded');
  });
}

// ─── NPC Окружение ────────────────────────────────────────────────────────────
export function mkNpc(overrides={}) {
  return { id:Date.now().toString(36)+Math.random().toString(36).slice(2,5), name:'NPC', nameEn:'', relationType:'neutral', score:0, maxScore:100, avatarUrl:'', description:'', ...overrides };
}

export function groupNpcs() {
  const d = chatLoveData(); if (!d.groupNpcs) d.groupNpcs = []; return d.groupNpcs;
}

export function saveGroupNpcs() {
  saveSettingsDebounced(); updatePromptInjection();
}

export function renderGroupNpcs() {
  const ct = document.getElementById('ls-group-list'); if (!ct) return;
  const npcs = groupNpcs();
  if (!npcs.length) { ct.innerHTML = '<div class="ls-group-empty"><i class="fa-solid fa-user-slash" style="margin-right:6px;"></i>Окружение пустое</div>'; return; }
  ct.innerHTML = npcs.map(npc => {
    const rt = RELATION_TYPES[npc.relationType||'neutral'] || RELATION_TYPES.neutral;
    const [r,g,b] = _h2r(rt.color);
    const scoreColor = npc.score < 0 ? '#4ec900' : rt.color;
    const avInner = npc.avatarUrl
      ? `<img class="ls-npc-av-img" src="${escHtml(npc.avatarUrl)}" alt="" onerror="this.outerHTML='<div class=\\'ls-npc-av-ph\\'><i class=\\'fa-solid fa-user\\'></i></div>'">`
      : `<div class="ls-npc-av-ph"><i class="fa-solid fa-user"></i></div>`;
    const rtBtns = Object.entries(RELATION_TYPES).map(([k,v]) => {
      const isHostile = k === 'hostile';
      const svg = `<svg viewBox="0 0 16 13" width="12" height="10" style="display:block;fill:currentColor;${isHostile?'transform:rotate(180deg);':''}"><path d="M8,12 C8,12 1,7.5 1,3.5 C1,1.5 2.5,0.5 4,0.5 C6,0.5 7.5,1.8 8,3 C8.5,1.8 10,0.5 12,0.5 C13.5,0.5 15,1.5 15,3.5 C15,7.5 8,12 8,12Z"/></svg>`;
      return `<span class="ls-npc-rt-btn ls-rt-${k}${npc.relationType===k?' ls-rt-active':''}" data-nid="${npc.id}" data-rt="${k}" title="${v.label}" style="color:${v.color}">${svg}</span>`;
    }).join('');
    const isNeg = npc.score < 0;
    const barBaseColor = isNeg ? '#4ec900' : rt.color;
    const barDeepColor = isNeg ? '#1a5500' : rt.deep;
    const [br,bg,bb] = _h2r(barBaseColor);
    const [dr,dg,db] = _h2r(barDeepColor);
    let barHTML;
    if (!isNeg) {
      const pct = Math.max(0,Math.min(100,(npc.score/Math.max(1,npc.maxScore))*100)).toFixed(1);
      barHTML = `<div class="ls-npc-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(${br},${bg},${bb},.12) 0%,rgba(${br},${bg},${bb},.82) 65%,rgba(${dr},${dg},${db},1) 100%);box-shadow:0 0 6px rgba(${br},${bg},${bb},.4);"></div>`;
    } else {
      const pct = Math.max(0,Math.min(100,(Math.abs(npc.score)/100)*100)).toFixed(1);
      barHTML = `<div class="ls-npc-bar-neg" style="width:${pct}%;background:linear-gradient(270deg,rgba(${br},${bg},${bb},.12) 0%,rgba(${br},${bg},${bb},.82) 65%,rgba(${dr},${dg},${db},1) 100%);box-shadow:0 0 6px rgba(${br},${bg},${bb},.4);"></div>`;
    }
    return `<div class="ls-npc-card" data-nid="${npc.id}" style="border-color:rgba(${r},${g},${b},.15);">
      <div class="ls-npc-top">
        <div class="ls-npc-av-wrap ls-npc-av-click" data-nid="${npc.id}" title="Нажми чтобы сменить аватар" style="border-color:rgba(${r},${g},${b},.35);">
          ${avInner}<div class="ls-npc-av-overlay"><i class="fa-solid fa-camera"></i></div>
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
  const ct = document.getElementById('ls-group-list'); if (!ct) return;
  const save = () => saveGroupNpcs();
  const npc  = id => groupNpcs().find(n => n.id === id);
  $(ct).off('input','.ls-npc-name').on('input','.ls-npc-name', function() { const n=npc(this.dataset.nid); if(n){n.name=this.value;save();} });
  $(ct).off('input','.ls-npc-name-en').on('input','.ls-npc-name-en', function() { const n=npc(this.dataset.nid); if(n){n.nameEn=this.value;save();} });
  $(ct).off('input','.ls-npc-desc').on('input','.ls-npc-desc', function() { const n=npc(this.dataset.nid); if(n){n.description=this.value;save();} });
  $(ct).off('change','.ls-npc-skip-desc').on('change','.ls-npc-skip-desc', function() {
    const n=npc(this.dataset.nid); if(!n) return;
    n.skipDescInject=this.checked; save();
    const card=ct.querySelector(`.ls-npc-card[data-nid="${this.dataset.nid}"]`);
    const ta=card?.querySelector('.ls-npc-desc');
    if(ta) ta.style.cssText=this.checked?'opacity:.3;pointer-events:none;':'';
    toast('info', this.checked?'Описание не будет дублироваться в промпт':'Описание включено в промпт');
  });
  $(ct).off('change','.ls-npc-score-max').on('change','.ls-npc-score-max', function() { const n=npc(this.dataset.nid); if(n){n.maxScore=Math.max(1,parseInt(this.value)||100);save();renderGroupNpcs();} });
  $(ct).off('click','.ls-npc-rt-btn').on('click','.ls-npc-rt-btn', function() { const n=npc(this.dataset.nid); if(!n) return; n.relationType=this.dataset.rt; save(); renderGroupNpcs(); });
  $(ct).off('click','.ls-npc-inc').on('click','.ls-npc-inc', function() { const n=npc(this.dataset.nid); if(!n) return; n.score=Math.min(n.score+1,n.maxScore); save(); renderGroupNpcs(); });
  $(ct).off('click','.ls-npc-dec').on('click','.ls-npc-dec', function() { const n=npc(this.dataset.nid); if(!n) return; n.score=Math.max(n.score-1,MIN_SCORE); save(); renderGroupNpcs(); });
  $(ct).off('click','.ls-npc-del-btn').on('click','.ls-npc-del-btn', function() { const d=chatLoveData(); d.groupNpcs=(d.groupNpcs||[]).filter(n=>n.id!==this.dataset.nid); save(); renderGroupNpcs(); });
  $(ct).off('click','.ls-npc-av-click').on('click','.ls-npc-av-click', function() {
    const nid = this.dataset.nid;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const file = inp.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e => { const n=groupNpcs().find(x=>x.id===nid); if(!n) return; n.avatarUrl=e.target.result; save(); renderGroupNpcs(); };
      reader.readAsDataURL(file);
    };
    inp.click();
  });
}

// ─── Сканирование NPC ─────────────────────────────────────────────────────────
function _lbEntryPersonScore(entry) {
  const text  = ((entry.content||'')+' '+(entry.label||'')).toLowerCase();
  const label = (entry.label||'').trim();
  const nonPersonWords = ['город','улица','район','здание','страна','регион','область','посёлок','деревня','столица','агентство','организация','компания','корпорация','завод','предприятие','учреждение','военная часть','подразделение','спецслужба','ведомство','министерство','штаб','оружие','предмет','артефакт','место','локация','объект','city','town','village','country','region','district','building','location','place','agency','organization','company','corporation','institution','facility','headquarters','military unit','department','ministry','weapon','item','artifact','object'];
  for (const w of nonPersonWords) { if (text.includes(w)) return -10; }
  if (/^[А-ЯA-Z]{2,5}$/.test(label)) return -10;
  let score = 0;
  const ruPronouns = ['он ','она ','его ','её ','ему ','ей ','им ','ним ','него ','неё ']; for (const p of ruPronouns) { if (text.includes(p)) { score += 3; break; } }
  const enPronouns = [' he ',' she ',' his ',' her ',' him '];                            for (const p of enPronouns) { if (text.includes(p)) { score += 3; break; } }
  const ruRoles = ['врач','доктор','офицер','агент','детектив','генерал','майор','капитан','директор','владелец','хозяин','сотрудник','боец','охранник','телохранитель','персонаж','мужчина','женщина','девушка','парень','мужик','старик','старуха','ребёнок']; for (const r of ruRoles) { if (text.includes(r)) { score += 4; break; } }
  const enRoles = ['doctor','officer','agent','detective','general','major','captain','director','owner','staff','guard','bodyguard','character','man','woman','girl','guy'];            for (const r of enRoles) { if (text.includes(r)) { score += 4; break; } }
  if (/^[А-ЯЁA-Z][а-яёa-z]+ [А-ЯЁA-Z][а-яёa-z]+/.test(label)) score += 5;
  const personalDetails = ['лет','года','лет,','возраст','внешность','характер','личность','years old','appearance','personality','trait','born']; for (const d of personalDetails) { if (text.includes(d)) { score += 2; break; } }
  return score;
}

export function scanChatForNpcs() {
  const box = document.getElementById('ls-scan-result'); if (!box) return;
  const ld   = chatLoveData();
  const existingNames = new Set((ld.groupNpcs||[]).map(n => (n.name||'').toLowerCase().trim()));
  const entries = getLorebooks();
  if (!entries.length) { box.style.display='block'; box.innerHTML='<i class="fa-solid fa-circle-info" style="margin-right:5px;opacity:.5;"></i>Нет записей в лорбуке.'; return; }
  let chatText = '';
  try { const ctx=SillyTavern?.getContext?.(); if(ctx?.chat?.length) chatText=ctx.chat.map(m=>(m.mes||'')).join('\n').toLowerCase(); } catch {}
  if (!chatText.trim()) { box.style.display='block'; box.innerHTML='<i class="fa-solid fa-circle-info" style="margin-right:5px;opacity:.5;"></i>Нет сообщений в чате для поиска.'; return; }
  const found = entries.filter(e => {
    const name = ((e.keys||[]).find(k=>k.trim()) || e.label || '').toLowerCase().trim();
    if (!name || existingNames.has(name)) return false;
    const mentionedInChat = (e.keys||[e.label]).some(k => k.trim() && chatText.includes(k.trim().toLowerCase()));
    if (!mentionedInChat) return false;
    return _lbEntryPersonScore(e) > 0;
  }).sort((a,b) => _lbEntryPersonScore(b) - _lbEntryPersonScore(a));
  box.style.display = 'block';
  if (!found.length) { box.innerHTML='<i class="fa-solid fa-check" style="margin-right:5px;color:#6ee86e;"></i>Персонажей из лорбука в чате не найдено (или все уже добавлены).'; return; }
  box.innerHTML = '<div style="font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.45;margin-bottom:6px;"><i class="fa-solid fa-user-group" style="margin-right:4px;"></i>Персонажи в чате — добавить в окружение?</div>'
    + found.map(e => {
      const name    = (e.keys||[]).find(k=>k.trim()) || e.label || 'NPC';
      const preview = (e.content||'').slice(0,60).trim();
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid rgba(255,255,255,.05);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);">${escHtml(name)}</div>
          ${preview?`<div style="font-size:10px;opacity:.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escHtml(preview)}…</div>`:''}
        </div>
        <button class="menu_button ls-scan-add-btn" data-lbid="${escHtml(e.id)}" style="flex-shrink:0;padding:3px 9px!important;font-size:11px!important;"><i class="fa-solid fa-plus"></i> Добавить</button>
      </div>`;
    }).join('');
  $(box).off('click','.ls-scan-add-btn').on('click','.ls-scan-add-btn', function() {
    const id    = this.dataset.lbid;
    const entry = getLorebooks().find(e=>e.id===id); if (!entry) return;
    const firstName = (entry.keys||[]).find(k=>k.trim()) || entry.label || 'NPC';
    const npc = mkNpc({ name:firstName, nameEn:firstName, description:entry.content, fromLorebook:true, skipDescInject:true });
    const ld2 = chatLoveData(); if (!ld2.groupNpcs) ld2.groupNpcs = [];
    ld2.groupNpcs.push(npc);
    saveGroupNpcs(); renderGroupNpcs();
    this.closest('div[style]').remove();
    toast('success', escHtml(firstName)+' добавлен из лорбука');
    if (!box.querySelector('.ls-scan-add-btn')) { box.innerHTML='<i class="fa-solid fa-check" style="margin-right:5px;color:#6ee86e;"></i>Все найденные персонажи добавлены!'; }
  });
}
