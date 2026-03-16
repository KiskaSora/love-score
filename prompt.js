import { saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { cfg, chatLoveData, loveData, RELATION_TYPES, MIN_SCORE, PROMPT_KEY, toast, addToLog, getActiveInterp, getPendingMilestones } from './config.js';
import { refreshWidget, pulseWidget, flipWidget } from './heart.js';

// ─── Построение промпта ───────────────────────────────────────────────────────
export function buildPrompt() {
  const c = cfg(), d = chatLoveData(); if (!c.isEnabled) return '';
  const changes  = (d.scoreChanges         || []).filter(x => x.description.trim());
  const interps  = (d.scaleInterpretations || []).filter(x => x.description.trim());
  const active   = getActiveInterp(), pending = getPendingMilestones();
  let p = '[OOC - LOVE SCORE SYSTEM]\n\nCurrent love score: '+d.score+' (range: '+MIN_SCORE+' to '+d.maxScore+').';
  if (d.score < 0) p += '\nNEGATIVE ZONE: character feels hostility, distrust or hatred toward the player.';
  if (active?.description?.trim()) p += '\n\nCURRENT BEHAVIOR (score '+d.score+'):\n'+active.description.trim()+'\n\nPortray the character strictly according to this description.';
  if (pending.length > 0) {
    p += '\n\nROMANTIC EVENTS — YOU MUST INITIATE ALL OF THESE (naturally, within this or the next response):';
    pending.forEach(m => { p += '\n- '+m.description.trim()+' (unlocked at score '+m.threshold+')'; });
    p += '\nAfter completing each event, include at the very end: <!-- [MILESTONE:threshold] --> for each completed one.';
  }
  if (changes.length) { p += '\n\nLove Score Changes:'; changes.forEach(x => { p += '\n'+(x.delta>=0?'+':'')+x.delta+': '+x.description.trim(); }); }
  if (interps.length) { p += '\n\nLove Scale:'; interps.forEach(x => { p += '\n'+x.min+' to '+x.max+': '+x.description.trim()+((d.score>=x.min&&d.score<=x.max)?' <- NOW':''); }); }
  if (c.gradualProgression) p += '\n\nSlowBurn RULE: Allowed score changes per response: -2, -1, 0, +1, +2. Default is 0. EXCEPTION: If the change delta matches a configured Score Change rule, its full delta is applied.';
  const _rtKeys = Object.keys(RELATION_TYPES).join('|');
  if (d.relationType === 'neutral' || !d.relationType)
    p += '\n\nOnce the relationship type becomes evident, add once: <!-- [RELATION_TYPE:key] --> where key is one of: '+_rtKeys+'.';
  else
    p += '\n\nIf relationship type changes, update with: <!-- [RELATION_TYPE:key] --> ('+_rtKeys+').';
  p += '\n\nAt the end of each response include: <!-- [LOVE_SCORE:X] --> replacing X with the updated score ('+MIN_SCORE+' to '+d.maxScore+').';

  // ── Групповой режим ──
  const gc = cfg();
  if (gc.groupMode && (chatLoveData().groupNpcs || []).length > 0) {
    const activeNpcs = chatLoveData().groupNpcs.filter(n => n.name?.trim());
    if (activeNpcs.length) {
      const rtKeys = Object.keys(RELATION_TYPES).join('|');
      p += '\n\n═══════════════════════════════════════';
      p += '\n[SURROUNDING CHARACTERS — NPC RELATIONSHIP SYSTEM]';
      p += '\n';
      p += '\nThe following characters are present in this scene. You MUST track each one\'s';
      p += '\nrelationship score with the player independently, just like the main character.';
      p += '\n';
      activeNpcs.forEach(n => {
        const rt = RELATION_TYPES[n.relationType||'neutral'] || RELATION_TYPES.neutral;
        const injName = (n.nameEn?.trim()) || n.name.trim();
        p += '\n── '+n.name.trim()+(injName !== n.name.trim() ? ' / '+injName : '');
        p += '\n   Relationship: '+rt.label+' | Score: '+n.score+' / '+n.maxScore;
        if (n.score < 0) p += '\n   ⚠ NEGATIVE ZONE — hostile, distrustful or antagonistic toward the player';
        if (n.description?.trim() && !n.skipDescInject) p += '\n   Character: '+n.description.trim().slice(0,250);
      });
      p += '\n';
      p += '\nBEHAVIOR RULES FOR EACH NPC:';
      p += '\n• Portray each NPC according to their current relationship score and type';
      p += '\n• Scores rise with warmth, help, shared moments, trust, humor, vulnerability';
      p += '\n• Scores fall with rudeness, betrayal, lies, ignoring, cruelty, rejection';
      p += '\n• Hostile NPCs (score < 0) are cold, suspicious, unfriendly — portray accordingly';
      p += '\n• If SlowBurn is on, limit per-response change to ±2 per NPC (unless a strong story beat justifies more)';
      p += '\n• Only update scores for NPCs who actually interact in the scene';
      p += '\n';
      p += '\nAT THE END OF EACH RESPONSE (only for NPCs whose values changed):';
      p += '\n  <!-- [NPC_SCORE:EnglishName:X] -->   (X = new score, range: '+MIN_SCORE+' to max)';
      p += '\n  <!-- [NPC_TYPE:EnglishName:key] -->   (key: '+rtKeys+', only when type becomes clear)';
      p += '\nUse the EN name in tags. Do NOT include tags for NPCs not featured in this response.';
      p += '\n═══════════════════════════════════════';
    }
  }
  return p;
}

export function updatePromptInjection() {
  try { setExtensionPrompt(PROMPT_KEY, cfg().isEnabled ? buildPrompt() : '', extension_prompt_types.IN_CHAT, 0); }
  catch(e) { toast('error', 'Ошибка промпта: '+e.message); }
}

// ─── Обработчик входящих сообщений ───────────────────────────────────────────
export function onMessageReceived(syncUI, renderScoreLog, renderMilestones, renderGroupNpcs, showAutoRegenStatus, autoRegenAll) {
  if (!cfg().isEnabled) return;
  try {
    const chat = typeof SillyTavern?.getContext === 'function' ? SillyTavern.getContext().chat : window.chat;
    if (!chat?.length) return;
    const msg = chat[chat.length-1]; if (!msg || msg.is_user) return;
    const text = msg.mes || '';
    const d = chatLoveData();

    // Счёт
    const sm = text.match(/<!--\s*\[LOVE_SCORE:(-?\d+)\]\s*-->/i);
    if (sm) {
      const c = cfg(); let nv = parseInt(sm[1], 10), ov = d.score;
      if (c.gradualProgression) {
        const _sbDelta = nv - ov;
        const _sbRule  = (d.scoreChanges || []).find(r => r.delta === _sbDelta && r.description.trim());
        if (!_sbRule) { const md = 2; nv = Math.max(ov-md, Math.min(ov+md, nv)); }
      }
      d.score = Math.max(MIN_SCORE, Math.min(nv, d.maxScore));
      const delta = d.score - ov;
      if (delta !== 0) {
        const mr = (d.scoreChanges || []).find(r => r.delta === delta && r.description.trim());
        addToLog(d, delta, mr?.description?.slice(0,35) || '');
        const crossed = (ov >= 0 && d.score < 0) || (ov < 0 && d.score >= 0);
        if (crossed) flipWidget(); else pulseWidget();
      }
      refreshWidget(); syncUI(); renderScoreLog();
    }

    // Майлстоны
    const msm = [...text.matchAll(/<!--\s*\[MILESTONE:(\d+)\]\s*-->/gi)];
    msm.forEach(mm => {
      const thr = parseInt(mm[1], 10);
      const ms  = (d.milestones || []).find(m => m.threshold === thr && !m.done);
      if (ms) { ms.done = true; toast('success', 'Событие: '+ms.description.slice(0,55)); renderMilestones(); }
    });

    // Тип отношений
    const rtm = text.match(/<!--\s*\[RELATION_TYPE:([\w]+)\]\s*-->/i);
    if (rtm) {
      const key = rtm[1].toLowerCase();
      if (RELATION_TYPES[key] && key !== d.relationType) {
        d.relationType = key;
        toast('info', 'Тип отношений: '+RELATION_TYPES[key].label);
        syncUI();
      }
    }

    saveSettingsDebounced(); updatePromptInjection();

    // Авто-регенерация правил
    const c = cfg();
    if (c.autoSuggestEnabled) {
      c._autoSuggestMsgCounter = (c._autoSuggestMsgCounter || 0) + 1;
      const interval = Math.max(5, parseInt(c.autoSuggestInterval) || 20);
      saveSettingsDebounced();
      if (c._autoSuggestMsgCounter >= interval) {
        c._autoSuggestMsgCounter = 0;
        saveSettingsDebounced();
        autoRegenAll();
      } else {
        const remaining = interval - c._autoSuggestMsgCounter;
        if (remaining <= 5 && remaining > 0) {
          showAutoRegenStatus('\u23f3 Авто-реген через '+remaining+' '+_pluralMsg(remaining)+'...');
        }
      }
    }

    // Групповой режим — парсинг NPC
    const gc = cfg();
    if (gc.groupMode && (chatLoveData().groupNpcs || []).length > 0) {
      const allNpcs = chatLoveData().groupNpcs;
      let npcChanged = false;
      const npcScoreMatches = [...text.matchAll(/<!--\s*\[NPC_SCORE:([^\]:]+):(-?\d+)\]\s*-->/gi)];
      npcScoreMatches.forEach(m => {
        const name = m[1].trim(), newScore = parseInt(m[2], 10);
        const npc  = allNpcs.find(n => (n.nameEn||n.name).trim().toLowerCase() === name.toLowerCase() || n.name.trim().toLowerCase() === name.toLowerCase());
        if (npc) {
          const old = npc.score;
          npc.score = Math.max(MIN_SCORE, Math.min(newScore, npc.maxScore));
          if (npc.score !== old) {
            const delta = npc.score - old;
            toast('info', (npc.name||name)+': '+(delta>0?'+':'')+delta+' → '+npc.score);
            npcChanged = true;
          }
        }
      });
      const npcTypeMatches = [...text.matchAll(/<!--\s*\[NPC_TYPE:([^\]:]+):([\w]+)\]\s*-->/gi)];
      npcTypeMatches.forEach(m => {
        const name = m[1].trim(), key = m[2].toLowerCase();
        const npc  = allNpcs.find(n => (n.nameEn||n.name).trim().toLowerCase() === name.toLowerCase() || n.name.trim().toLowerCase() === name.toLowerCase());
        if (npc && RELATION_TYPES[key] && key !== npc.relationType) {
          npc.relationType = key;
          toast('info', (npc.name||name)+' → '+RELATION_TYPES[key].label);
          npcChanged = true;
        }
      });
      if (npcChanged) { saveSettingsDebounced(); renderGroupNpcs(); }
    }
  } catch(e) { toast('error', 'Ошибка: '+e.message); }
}

function _pluralMsg(n) { return n===1?'сообщение':n<5?'сообщения':'сообщений'; }
