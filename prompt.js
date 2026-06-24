import { saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { cfg, chatLoveData, loveData, RELATION_TYPES, MIN_SCORE, PROMPT_KEY, toast, addToLog, getActiveInterp, getPendingMilestones, roundScore, addScar, getActiveScars, getCurrentRoute, findMatchingRule, takeMsgSnapshot, restoreMsgSnapshot, msgFp, getChat, SNAP_CAP } from './config.js';
import { refreshWidget, pulseWidget, flipWidget } from './heart.js';

// ─── Построение промпта ───────────────────────────────────────────────────────
export function buildPrompt() {
  const c = cfg(), d = chatLoveData(); if (!c.isEnabled) return '';
  const changes  = (d.scoreChanges         || []).filter(x => x.description.trim());
  const interps  = (d.scaleInterpretations || []).filter(x => x.description.trim());
  const active   = getActiveInterp(), pending = getPendingMilestones();
  const hide = !!c.hideRules;
  const tone = c.injectTone || 'strict';

  let p = '[OOC: LOVE SCORE] Score: '+d.score+' / '+d.maxScore+' (min '+MIN_SCORE+').';
  if (d.score < 0) {
    if (d._coldStarted) p += '\nCold start: a wary stranger, trust not yet earned — distant and cautious, not cruel. Warmth must be earned.';
    else p += '\nNegative zone: the character feels hostility or distrust toward the player.';
  }

  // Поведение под текущий счёт
  if (active?.description?.trim()) {
    const head  = tone === 'monologue' ? 'WHO I AM NOW' : 'BEHAVIOR';
    const frame = tone === 'monologue' ? ' — let it live in my voice and choices.'
                : tone === 'hints'     ? ' — let it guide how the character feels now.'
                : ' — portray strictly to this.';
    p += '\n\n'+head+' (score '+d.score+'): '+active.description.trim()+frame;
  }

  // Маршрут
  if (c.routesEnabled) {
    const route = getCurrentRoute(d);
    if (route && (route.description || '').trim()) {
      const rtLabel = RELATION_TYPES[route.relationType]?.label || route.relationType;
      p += '\n\nROUTE "'+route.name.trim()+'" ['+rtLabel+']: '+route.description.trim()+' — let it define how closeness, distance and intent are expressed.';
    }
  }

  // Майлстоны (тег — в общем OUTPUT-блоке)
  if (pending.length > 0) {
    const intro = tone === 'monologue' ? 'Moments I feel pulled to bring about (now or soon):'
                : tone === 'hints'     ? 'Moments ready to happen — move toward them naturally, now or soon:'
                : 'EVENTS TO INITIATE (naturally, this or next response):';
    p += '\n\n'+intro;
    pending.forEach(m => { p += '\n- '+m.description.trim()+(hide ? '' : ' ('+m.threshold+')'); });
  }

  if (!hide && changes.length) {
    const route0 = getCurrentRoute(d), routeId0 = route0 ? route0.id : null;
    const applicable = changes.filter(x => {
      if (x.minScore != null && d.score < x.minScore) return false;
      if (x.maxScore != null && d.score > x.maxScore) return false;
      if (x.route && x.route !== routeId0) return false;
      return true;
    });
    if (applicable.length) { p += '\n\nScore changes:'; applicable.forEach(x => {
      let cond = '';
      if (x.minScore != null || x.maxScore != null) cond = ' ['+(x.minScore!=null?'≥'+x.minScore:'')+(x.minScore!=null&&x.maxScore!=null?'..':'')+(x.maxScore!=null?'≤'+x.maxScore:'')+']';
      p += '\n'+(x.delta>=0?'+':'')+x.delta+': '+x.description.trim()+cond;
    }); }
  }
  if (!hide && interps.length) { p += '\n\nScale:'; interps.forEach(x => { p += '\n'+x.min+'..'+x.max+': '+x.description.trim()+((d.score>=x.min&&d.score<=x.max)?' <- NOW':''); }); }

  // Шрамы (тег — в общем OUTPUT-блоке)
  if (c.scarsEnabled) {
    const scars = getActiveScars(d);
    if (scars.length) {
      p += '\n\nSCARS (old wounds that quietly color behavior — let them surface, don\'t forget):';
      scars.forEach(s => { p += '\n- '+s.text.trim()+' (at score '+s.atScore+')'; });
    }
  }

  // Импульс события
  if ((c.momentumEnabled !== false) && (d._momentumTurns || 0) > 0 && d._momentumDir !== 0) {
    p += d._momentumDir > 0
      ? '\n\nMomentum: something good just shifted — warmer, still glowing. Let it color this response.'
      : '\n\nMomentum: something painful just happened — shaken and guarded. Let it linger.';
  }

  // Hardcore / SlowBurn
  if (c.hardcoreMode) {
    const cap = c.hardcorePositiveCap ?? 0.5;
    if (hide) {
      p += '\n\nThis bond is hard to earn, easy to lose. The character stays guarded and slow to warm; only real effort, care or sacrifice moves them, carelessness cuts deep. Never warm up quickly or without reason.';
    } else {
      const head = tone === 'monologue' ? 'HARDCORE — my heart is hard to reach' : 'HARDCORE — love is hard-won';
      p += '\n\n'+head+': affection earned slowly through real effort, lost easily.';
      p += '\n• Max +'+cap+'/response. More only for genuine effort: real care, sacrifice, a kept promise, vulnerability.';
      p += '\n• Small talk / generic compliments = 0. Forced or tone-deaf behavior = negative. Penalties amplified (×'+(c.hardcoreNegativeMult ?? 2.0)+').';
      p += '\n• Guarded and skeptical until trust is truly earned.';
      p += '\n• Exception: a configured score-change rule applies its full delta.';
      if (c.hardcoreDecayEnabled) p += '\n• Without real progress the bond cools toward indifference — keep that drift.';
    }
  } else if (c.gradualProgression && !hide) {
    p += '\n\nSlowBurn: per-response change limited to -2..+2 (default 0). Exception: a configured score-change rule applies its full delta.';
  }

  // Группа / NPC: ростер (теги — в общем OUTPUT-блоке)
  const gc = cfg();
  const npcTagLines = [];
  if (gc.groupMode && (chatLoveData().groupNpcs || []).length > 0) {
    const activeNpcs = chatLoveData().groupNpcs.filter(n => n.name?.trim());
    if (activeNpcs.length) {
      const hasRival = activeNpcs.some(n => n.isRival);
      p += '\n\n[SURROUNDING CHARACTERS] Track each one\'s score with the player independently.';
      activeNpcs.forEach(n => {
        const rt = RELATION_TYPES[n.relationType||'neutral'] || RELATION_TYPES.neutral;
        const injName = (n.nameEn?.trim()) || n.name.trim();
        p += '\n- '+n.name.trim()+(injName !== n.name.trim() ? ' / '+injName : '')+': '+rt.label+' '+n.score+'/'+n.maxScore;
        if (n.isRival)   p += ' ⚔RIVAL (competes for the main character; their gains strain the player\'s standing)';
        if (n.score < 0) p += ' ⚠hostile';
        if (n.description?.trim() && !n.skipDescInject) p += ' — '+n.description.trim().slice(0,250);
      });
      p += '\nRules: portray each by their score/type; warmth raises, cruelty lowers; update only NPCs who interact this scene';
      if (hasRival) p += '; rivals pull at the main character\'s loyalty';
      if (c.gradualProgression) p += '; SlowBurn caps ±2 per NPC';
      p += '.';
      const rtKeys = Object.keys(RELATION_TYPES).join('|');
      npcTagLines.push('<!-- [NPC_SCORE:EnglishName:X] -->  per changed NPC, EN name, X = new score');
      npcTagLines.push('<!-- [NPC_TYPE:EnglishName:key] -->  when an NPC\'s type becomes clear; key: '+rtKeys);
    }
  }

  // ── Единый OUTPUT-блок: все теги в самом конце ──
  const _rtKeys = Object.keys(RELATION_TYPES).join('|');
  const tags = [];
  const wantReason = c.scoreReason !== false;
  let scoreDesc = '  every response; X = updated score '+MIN_SCORE+'..'+d.maxScore+(c.hardcoreMode ? ' (decimals ok, e.g. '+(roundScore(d.score + (c.hardcorePositiveCap ?? 0.5)))+')' : '');
  if (wantReason) scoreDesc += '; reason = a SHORT phrase (2-6 words) in the language of the conversation naming what caused the change — omit ":reason" if the score did not change';
  tags.push((wantReason ? '<!-- [LOVE_SCORE:X:reason] -->' : '<!-- [LOVE_SCORE:X] -->')+scoreDesc);
  if (d.relationType === 'neutral' || !d.relationType)
    tags.push('<!-- [RELATION_TYPE:key] -->  once type is evident; key: '+_rtKeys);
  else
    tags.push('<!-- [RELATION_TYPE:key] -->  if type changes; key: '+_rtKeys);
  if (pending.length > 0) tags.push('<!-- [MILESTONE:threshold] -->  per completed event');
  if (c.scarsEnabled) tags.push('<!-- [SCAR:short wound] -->  only on serious betrayal, cruelty or broken trust');
  if (c.hardcoreMode && (d._hcBreakthroughCD || 0) <= 0) tags.push('<!-- [HC_BREAKTHROUGH:N] -->  rare, story-defining jump (N e.g. 3-5); almost never');
  tags.push(...npcTagLines);
  p += '\n\nOUTPUT — append at the very end, only what applies:\n'+tags.join('\n');

  return p;
}

export function updatePromptInjection() {
  try { setExtensionPrompt(PROMPT_KEY, cfg().isEnabled ? buildPrompt() : '', extension_prompt_types.IN_CHAT, 0); }
  catch(e) { toast('error', 'Ошибка промпта: '+e.message); }
}

// ─── Ядро подсчёта: применить теги одного поста AI к состоянию ─────────────────
// Используется и при живом приёме сообщения (S — реальные сайд-эффекты: тосты,
// биение/переворот сердца, перерисовка), и при пересчёте после удаления (S —
// заглушки). Чистая логика состояния одинакова, поэтому пересчёт из чата даёт
// ровно тот же счёт, что и живое накопление.
function applyScoring(d, c, text, S) {
  // Счёт (необязательная причина после второго двоеточия: [LOVE_SCORE:47:признание сближает])
  const sm = text.match(/<!--\s*\[LOVE_SCORE:(-?\d+(?:\.\d+)?)(?::([^\]]*))?\]\s*-->/i);

  // Breakthrough (только в hardcore, только если кулдаун истёк)
  let breakthroughAmt = 0;
  if (c.hardcoreMode) {
    const bm = text.match(/<!--\s*\[HC_BREAKTHROUGH:(-?\d+(?:\.\d+)?)\]\s*-->/i);
    if (bm && (d._hcBreakthroughCD || 0) <= 0) breakthroughAmt = parseFloat(bm[1]) || 0;
  }

  if (sm) {
    let nv = parseFloat(sm[1]); const ov = d.score;
    const aiReason = (sm[2] || '').replace(/\s+/g, ' ').trim().slice(0, 60);  // обоснование от AI (если есть)
    const rawDelta = nv - ov;
    // Стрик активен, если серия плюсов уже набрана в предыдущих ходах
    const streakActive = (c.streakEnabled !== false) && (d._streakCount || 0) >= Math.max(2, c.streakNeeded ?? 3);
    let streakFired = false;

    if (c.hardcoreMode) {
      let cap       = c.hardcorePositiveCap  ?? 0.5;
      const negMult = c.hardcoreNegativeMult ?? 2.0;
      const exactRule = findMatchingRule(d, rawDelta, ov);
      // Награда за стабильность: стрик разово поднимает кап (но не выше +1)
      if (streakActive && rawDelta > 0 && !exactRule && breakthroughAmt === 0) { cap = Math.max(cap, Math.min(1, cap * 2)); streakFired = true; }
      if (breakthroughAmt > 0) {
        nv = ov + breakthroughAmt;                       // редкий прорыв — обходит кап
        d._hcBreakthroughCD = c.hardcoreBreakthroughCD ?? 10;
      } else if (exactRule) {
        nv = ov + rawDelta;                              // заданное правило — полная дельта
      } else if (rawDelta > 0) {
        nv = ov + Math.min(rawDelta, cap);               // прирост обрезан до «труда» (с учётом стрика)
      } else if (rawDelta < 0) {
        nv = ov + rawDelta * negMult;                    // штраф усилен
      }
    } else if (c.gradualProgression) {
      const _sbRule = findMatchingRule(d, rawDelta, ov);
      if (!_sbRule) {
        let target = nv;
        if (streakActive && rawDelta > 0) { target = ov + rawDelta * (c.streakMult ?? 1.5); streakFired = true; }  // бонус за серию
        const md = 2; nv = Math.max(ov-md, Math.min(ov+md, target));   // SlowBurn-кап всё равно держит ±2
      }
    } else {
      // Без режима: стрик слегка усиливает прирост
      const _r = findMatchingRule(d, rawDelta, ov);
      if (!_r && streakActive && rawDelta > 0) { nv = ov + rawDelta * (c.streakMult ?? 1.5); streakFired = true; }
    }

    d.score = roundScore(Math.max(MIN_SCORE, Math.min(nv, d.maxScore)));
    if (d._coldStarted && d.score >= 0) d._coldStarted = false;  // доверие установлено — больше не «холодный незнакомец»
    const delta = roundScore(d.score - ov);
    if (delta !== 0) {
      const mr = findMatchingRule(d, rawDelta, ov) || findMatchingRule(d, delta, ov);
      let reason = aiReason || mr?.description?.slice(0,35) || '';   // приоритет — обоснование от AI
      if (breakthroughAmt > 0 && !reason) reason = '✦ прорыв';
      addToLog(d, delta, reason);
      const crossed = (ov >= 0 && d.score < 0) || (ov < 0 && d.score >= 0);
      if (crossed) S.flip(); else S.pulse();
    }

    // Hardcore: decay при простое + тик кулдауна breakthrough
    if (c.hardcoreMode) {
      if (delta > 0) {
        d._hcStaleCounter = 0;
      } else {
        d._hcStaleCounter = (d._hcStaleCounter || 0) + 1;
        if (c.hardcoreDecayEnabled && d.score > 0) {
          const interval = Math.max(1, c.hardcoreDecayInterval ?? 3);
          if (d._hcStaleCounter >= interval) {
            d._hcStaleCounter = 0;
            const before = d.score;
            d.score = roundScore(Math.max(0, d.score - (c.hardcoreDecayPerStep ?? 0.3)));
            const dec = roundScore(d.score - before);
            if (dec !== 0) { addToLog(d, dec, '❄ остывание'); S.pulse(); }
          }
        }
      }
      if (breakthroughAmt === 0 && d._hcBreakthroughCD > 0) d._hcBreakthroughCD = Math.max(0, d._hcBreakthroughCD - 1);
    }

    // Стрик: серия положительных ответов. Сработавший бонус «тратит» серию.
    if (c.streakEnabled !== false) {
      if (streakFired) {
        d._streakCount = 0;
        S.toast('success', '🔥 Серия! Бонус к близости');
      } else if (delta > 0) {
        d._streakCount = (d._streakCount || 0) + 1;
      } else if (delta < 0) {
        d._streakCount = 0;
      }
      // delta === 0 — серию не наращиваем, но и не рвём
    }

    // Импульс: крупный сдвиг оставляет эхо на несколько ходов
    if (c.momentumEnabled !== false) {
      const mthr = Math.max(1, c.momentumThreshold ?? 8);
      if (Math.abs(delta) >= mthr) {
        d._momentumTurns = Math.max(1, c.momentumTurns ?? 2);
        d._momentumDir = delta > 0 ? 1 : -1;
      } else if ((d._momentumTurns || 0) > 0) {
        d._momentumTurns -= 1;
        if (d._momentumTurns === 0) d._momentumDir = 0;
      }
    }

    // Шрамы: тег [SCAR:...] от AI, авто-шрам при крупном падении, заживление при восстановлении
    if (c.scarsEnabled) {
      let scarredThisTurn = false;
      [...text.matchAll(/<!--\s*\[SCAR:([^\]]+)\]\s*-->/gi)].forEach(st => {
        const t = st[1].trim();
        if (t) { const s = addScar(d, t, delta); S.toast('error', '🩹 Шрам: '+s.text.slice(0,50)); scarredThisTurn = true; }
      });
      const thr = Math.max(1, c.scarThreshold ?? 10);
      if (!scarredThisTurn && delta <= -thr) {
        const mrs = findMatchingRule(d, delta, ov) || (d.scoreChanges || []).find(r => r.delta === delta && (r.description||'').trim());
        const s = addScar(d, mrs?.description || ('Глубокая обида (−'+Math.abs(delta)+')'), delta);
        S.toast('error', '🩹 Шрам: '+s.text.slice(0,50));
      }
      const margin = c.scarHealMargin ?? 30;
      if (margin > 0) getActiveScars(d).forEach(s => {
        if (d.score >= s.atScore + margin) { s.healed = true; S.toast('success', '🩹 Шрам зажил: '+s.text.slice(0,45)); }
      });
    }

    S.refresh(); S.syncUI(); S.renderScoreLog();
  }

  // Майлстоны
  const msm = [...text.matchAll(/<!--\s*\[MILESTONE:(\d+)\]\s*-->/gi)];
  msm.forEach(mm => {
    const thr = parseInt(mm[1], 10);
    const ms  = (d.milestones || []).find(m => m.threshold === thr && !m.done);
    if (ms) { ms.done = true; S.toast('success', 'Событие: '+ms.description.slice(0,55)); S.renderMilestones(); }
  });

  // Тип отношений
  const rtm = text.match(/<!--\s*\[RELATION_TYPE:([\w]+)\]\s*-->/i);
  if (rtm) {
    const key = rtm[1].toLowerCase();
    if (RELATION_TYPES[key] && key !== d.relationType) {
      d.relationType = key;
      S.toast('info', 'Тип отношений: '+RELATION_TYPES[key].label);
      S.syncUI();
    }
  }

  // Маршруты: активная ветка зависит от типа отношений — сообщаем о смене
  if (c.routesEnabled) {
    const routeNow = getCurrentRoute(d);
    const routeNowId = routeNow ? routeNow.id : null;
    if (routeNowId !== d._currentRoute) {
      d._currentRoute = routeNowId;
      if (routeNow) S.toast('info', '🛤 Маршрут: ' + routeNow.name);
    }
  }

  // Групповой режим — парсинг NPC
  if (c.groupMode && (d.groupNpcs || []).length > 0) {
    const allNpcs = d.groupNpcs;
    let npcChanged = false;
    const npcScoreMatches = [...text.matchAll(/<!--\s*\[NPC_SCORE:([^\]:]+):(-?\d+)\]\s*-->/gi)];
    npcScoreMatches.forEach(m => {
      const name = m[1].trim(), newScore = parseInt(m[2], 10);
      const npc  = allNpcs.find(n => (n.nameEn||n.name).trim().toLowerCase() === name.toLowerCase() || n.name.trim().toLowerCase() === name.toLowerCase());
      if (npc) {
        const old = npc.score;
        npc.score = Math.max(MIN_SCORE, Math.min(newScore, npc.maxScore));
        if (npc.score !== old) {
          const ndelta = npc.score - old;
          S.toast('info', (npc.name||name)+': '+(ndelta>0?'+':'')+ndelta+' → '+npc.score);
          npcChanged = true;
          // Соперник: его рост давит на основной счёт игрока
          if (npc.isRival && ndelta > 0) {
            const press = roundScore(ndelta * (npc.pressure ?? c.rivalPressure ?? 0.5));
            if (press > 0) {
              const before = d.score;
              d.score = roundScore(Math.max(MIN_SCORE, d.score - press));
              const applied = roundScore(d.score - before);
              if (applied !== 0) { addToLog(d, applied, '⚔ соперник: '+(npc.name||name).slice(0,20)); S.pulse(); S.refresh(); S.renderScoreLog(); }
            }
          }
        }
      }
    });
    const npcTypeMatches = [...text.matchAll(/<!--\s*\[NPC_TYPE:([^\]:]+):([\w]+)\]\s*-->/gi)];
    npcTypeMatches.forEach(m => {
      const name = m[1].trim(), key = m[2].toLowerCase();
      const npc  = allNpcs.find(n => (n.nameEn||n.name).trim().toLowerCase() === name.toLowerCase() || n.name.trim().toLowerCase() === name.toLowerCase());
      if (npc && RELATION_TYPES[key] && key !== npc.relationType) {
        npc.relationType = key;
        S.toast('info', (npc.name||name)+' → '+RELATION_TYPES[key].label);
        npcChanged = true;
      }
    });
    if (npcChanged) S.renderGroupNpcs();
  }
}

// Заглушки сайд-эффектов — для «тихого» пересчёта (без тостов и перерисовки).
const SILENT = { toast(){}, pulse(){}, flip(){}, refresh(){}, syncUI(){}, renderScoreLog(){}, renderMilestones(){}, renderGroupNpcs(){} };

// Пересчитать счёт и состояние с нуля из тегов всех оставшихся постов AI.
// Не зависит от заранее сохранённых снимков — поэтому работает и в старых чатах
// (где постов до установки расширения снимков нет), и при удалении любого поста.
// Корректно при условии, что счёт ведёт только AI (ручные правки счёта пересчёт
// не сохраняет — он берёт значения из тегов [LOVE_SCORE] в самих сообщениях).
function recomputeFromChat(d, c) {
  const chat = getChat();
  // Сброс рантайма счёта в начальное (правила/шкалу/настройки/описания майлстоунов не трогаем).
  d.score = c.coldStartEnabled ? roundScore(Math.max(MIN_SCORE, Math.min(0, c.coldStartScore ?? -30))) : 0;
  d._coldStarted = !!c.coldStartEnabled;
  d.scoreLog = [];
  d._hcStaleCounter = 0; d._hcBreakthroughCD = 0;
  d._streakCount = 0; d._momentumTurns = 0; d._momentumDir = 0;
  d.relationType = 'neutral'; d._currentRoute = null;
  d.scars = [];
  (d.milestones || []).forEach(m => { m.done = false; });
  if (c.groupMode) (d.groupNpcs || []).forEach(n => { n.score = 0; n.relationType = 'neutral'; });
  d._msgSnapshots = [];
  for (let i = 0; i < chat.length; i++) {
    const m = chat[i];
    if (!m || m.is_user) continue;
    // Снимок «до сообщения» — чтобы свайп/рерол и последующие удаления работали точно.
    d._msgSnapshots.push({ idx: i, key: msgFp(m), snap: takeMsgSnapshot(d, c) });
    applyScoring(d, c, m.mes || '', SILENT);
  }
  if (d._msgSnapshots.length > SNAP_CAP) d._msgSnapshots.splice(0, d._msgSnapshots.length - SNAP_CAP);
}

// ─── Обработчик входящих сообщений ───────────────────────────────────────────
export function onMessageReceived(syncUI, renderScoreLog, renderMilestones, renderGroupNpcs, showAutoRegenStatus, autoRegenAll, type) {
  if (!cfg().isEnabled) return;
  try {
    const chat = typeof SillyTavern?.getContext === 'function' ? SillyTavern.getContext().chat : window.chat;
    if (!chat?.length) return;
    const msg = chat[chat.length-1]; if (!msg || msg.is_user) return;
    const text = msg.mes || '';
    const d = chatLoveData();
    const c = cfg();

    // Рерол/свайп: то же сообщение перегенерировано — откатить эффект отклонённого
    // ответа к снимку «до сообщения», затем применить новый свайп от исходного счёта.
    // Снимки храним стеком по индексам сообщений — этот же стек даёт точный откат
    // при удалении сообщений в таверне (см. onMessageDeleted).
    const idx = chat.length - 1;
    const isReroll = (type === 'swipe' || type === 'regenerate');
    const stack = d._msgSnapshots || (d._msgSnapshots = []);
    const existing = isReroll ? stack.find(e => e.idx === idx) : null;
    if (existing) {
      restoreMsgSnapshot(d, c, existing.snap);   // снимок оставляем для следующих реролов
      existing.key = msgFp(msg);                 // обновить отпечаток под текущий свайп
    } else {
      const snap = takeMsgSnapshot(d, c);        // новое сообщение — фиксируем базу
      const at = stack.findIndex(e => e.idx === idx);
      if (at >= 0) stack[at]  = { idx, key: msgFp(msg), snap };
      else         stack.push({ idx, key: msgFp(msg), snap });
      if (stack.length > SNAP_CAP) stack.splice(0, stack.length - SNAP_CAP);
    }

    // Применить теги поста к состоянию — с живыми сайд-эффектами (тосты, сердце, UI).
    applyScoring(d, c, text, {
      toast, pulse: pulseWidget, flip: flipWidget, refresh: refreshWidget,
      syncUI, renderScoreLog, renderMilestones, renderGroupNpcs,
    });

    saveSettingsDebounced(); updatePromptInjection();

    // Авто-регенерация правил (только живой путь)
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
          showAutoRegenStatus('⏳ Авто-реген через '+remaining+' '+_pluralMsg(remaining)+'...');
        }
      }
    }
  } catch(e) { toast('error', 'Ошибка: '+e.message); }
}

// ─── Старт свайпа/рерола: показать AI базовый счёт ДО генерации ────────────────
// AI пишет в теге АБСОЛЮТНЫЙ счёт и отталкивается от числа, которое видит в инжекте.
// Свайп (в отличие от рерола-кнопки) не шлёт MESSAGE_DELETED, поэтому без этого
// инжект всё ещё показывает счёт ОТКЛОНЁННОГО варианта — и новый свайп считается
// поверх него (был 2 → стал 2.3 вместо ожидаемого от базы 1.5). Откатываем ТОЛЬКО
// показ счёта к снимку «до поста» и пересобираем инжект; текущее состояние не
// трогаем (его вернём сразу), чтобы отмена свайпа ничего не сдвинула. Реальный
// пересчёт счёта по новому варианту делает onMessageReceived (его existing-ветка).
export function onSwipeGenerationStart(type, dryRun) {
  if (dryRun || type !== 'swipe' || !cfg().isEnabled) return;
  try {
    const d = chatLoveData(), c = cfg();
    const idx = getChat().length - 1;
    if (idx < 0) return;
    const base = (d._msgSnapshots || []).find(e => e.idx === idx)?.snap;
    if (!base) return;                         // старый пост без снимка — базу не знаем, инжект не трогаем
    const cur = takeMsgSnapshot(d, c);         // запомнить отклонённый вариант
    restoreMsgSnapshot(d, c, base);            // временно — состояние «до поста»
    updatePromptInjection();                   // инжект увидит базовый счёт
    restoreMsgSnapshot(d, c, cur);             // вернуть как было (на случай отмены свайпа)
  } catch (e) { toast('error', 'Ошибка свайпа: ' + e.message); }
}

// ─── Откат при удалении сообщений в таверне ───────────────────────────────────
// Таверна шлёт MESSAGE_DELETED с НОВОЙ длиной чата (а не индексом удалённого).
// 1) Чистое усечение хвоста (удалили последний/последние посты) и есть снимок —
//    точный откат по снимку «до поста»: сохраняет всё, включая ручные правки.
// 2) Среднее удаление (сообщения сместились) или снимка нет (старый пост до
//    установки расширения) — честный пересчёт счёта из тегов оставшихся постов.
export function onMessageDeleted(newLen, ui) {
  if (!cfg().isEnabled) return;
  try {
    const d = chatLoveData(), c = cfg();
    const chat = getChat();
    const stack = (d._msgSnapshots || []).slice().sort((a, b) => a.idx - b.idx);

    let cut = -1, shifted = false;
    for (let i = 0; i < stack.length; i++) {
      const e = stack[i];
      if (e.idx >= newLen) { cut = i; break; }                 // снимок удалённого хвоста
      if (msgFp(chat[e.idx]) !== e.key) { shifted = true; cut = i; break; }  // сообщение сместилось
    }

    if (cut >= 0 && !shifted) {
      restoreMsgSnapshot(d, c, stack[cut].snap);   // точный откат к состоянию «до удалённого поста»
      d._msgSnapshots = stack.slice(0, cut);
    } else {
      recomputeFromChat(d, c);                      // снимка нет / сдвиг — пересчёт из чата
    }

    saveSettingsDebounced();
    updatePromptInjection();
    try { ui && ui(); } catch {}
  } catch (e) { toast('error', 'Ошибка отката: ' + e.message); }
}

function _pluralMsg(n) { return n===1?'сообщение':n<5?'сообщения':'сообщений'; }
