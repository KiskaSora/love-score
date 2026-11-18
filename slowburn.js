import { cfg, chatLoveData, getNativeGroup, toast } from './config.js';
import { callLLM, buildCharacterCardText, getCurrentCharacterCard, getLorebookTextForGen } from './ai.js';
import { AUTO_POLICY, autoPrompt, parseReview, previousMemory, reviewedRecord, stripScoreTags } from './slowburn-core.js';

let epoch = 0;
const inFlight = new WeakSet();
export function invalidateAutoReview() { epoch++; }
export function autoModeActive() { return cfg().autoSlowBurn === true && !cfg().groupMode && !getNativeGroup(); }
export function buildAutoPrompt(d) {
  const chat = SillyTavern.getContext().chat || [];
  // Generation of a swipe/continuation must not use that same message as its own history.
  const before = chat.length && !chat[chat.length - 1].is_user ? chat.length - 1 : chat.length;
  return autoPrompt(d.score, d.maxScore, previousMemory(chat, before), cfg().autoSlowBurnPace);
}

export async function reviewAutoMessage(msg, baseScore) {
  const ctx = SillyTavern.getContext(), chat = ctx.chat, d = chatLoveData();
  const idx = chat.indexOf(msg), original = msg.mes, swipe = msg.swipe_id ?? 0, ticket = epoch;
  if (reviewedRecord(msg)) return true;
  if (inFlight.has(msg)) return false;
  inFlight.add(msg);
  msg.extra ||= {};
  msg.extra.lsAutoUnverified = original;
  const historyStamp = JSON.stringify(chat.slice(0, idx).map(m => [m.mes, m.swipe_id]));
  const current = () => ticket === epoch && cfg().isEnabled && autoModeActive()
    && chatLoveData() === d && SillyTavern.getContext().chat === chat && chat.length === idx + 1
    && chat[idx] === msg && msg.mes === original && (msg.swipe_id ?? 0) === swipe && d.score === baseScore
    && historyStamp === JSON.stringify(chat.slice(0, idx).map(m => [m.mes, m.swipe_id]));
  const settings = cfg();
  const payload = {
    card: buildCharacterCardText(getCurrentCharacterCard()).slice(0, 30000),
    selectedLore: getLorebookTextForGen().slice(0, 16000),
    memory: previousMemory(chat, idx), score: baseScore, maxScore: d.maxScore,
    pace: settings.autoSlowBurnPace || 'slow',
    history: chat.slice(Math.max(0, idx - 20), idx).map(m => ({ name:m.name, role:m.is_user?'user':'assistant', text:stripScoreTags(m.mes).slice(-6000) })),
    draft: stripScoreTags(original),
  };
  let timer;
  try {
    const raw = await Promise.race([
      callLLM({ system: AUTO_POLICY + `\nReview the draft for unearned intimacy, implausible trust or stage skipping.
Return ONLY JSON: {"violation":boolean,"replacement":"full corrected story if violation, otherwise empty",
"delta":number,"breakthrough":boolean,"evidence":"specific prior/player event supporting breakthrough",
"reason":"short reason in conversation language","memory":"compact updated feelings, trust, readiness,
barriers and established milestones, retaining important past facts"}.
Ordinary delta is -2..+2 (very_slow: positive max 1). Breakthrough max +10, only with concrete evidence.
Evaluate the final corrected scene when proposing memory; never keep facts removed by the correction.
Rewrite only if necessary; keep plot facts and voice. No score tags in replacement.`,
        user: JSON.stringify(payload), temperature:0.2, maxTokens:6000, includePreset:false }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Проверка превысила 60 секунд')), 60000); }),
    ]);
    const result = parseReview(raw, payload.pace);
    if (!current()) return false;
    const score = Math.round(Math.max(-100, Math.min(d.maxScore, baseScore + result.delta)) * 10) / 10;
    const story = result.violation ? stripScoreTags(result.replacement) : stripScoreTags(original);
    const text = story + '\n<!-- [LOVE_SCORE:' + score + ':' + result.reason + '] -->';
    msg.extra ||= {};
    msg.extra.lsAutoReviews ||= {};
    msg.extra.lsAutoReviews[swipe] = { version:1, text, memory:result.memory, delta:score-baseScore,
      reason:result.reason, corrected:result.violation, breakthrough:result.breakthrough };
    msg.mes = text;
    delete msg.extra.lsAutoUnverified;
    if (Array.isArray(msg.swipes)) msg.swipes[swipe] = text;
    if (msg.swipe_info?.[swipe]) msg.swipe_info[swipe].extra = structuredClone(msg.extra);
    // Use the host renderer; never insert model HTML directly into the DOM.
    try { ctx.updateMessageBlock?.(idx, msg); }
    catch { toast('warning', 'Ответ исправлен, но отображение не обновилось. Переоткрой чат.'); }
    // Do not yield between committing the message and the caller committing its score.
    try { Promise.resolve(ctx.saveChat?.()).catch(() => toast('warning', 'Не удалось сохранить проверенный ответ')); }
    catch { toast('warning', 'Не удалось сохранить проверенный ответ'); }
    return true;
  } catch (err) {
    if (current()) {
      toast('warning', 'Слоубёрн: ответ не проверен, очки за него не начислены. ' + err.message);
      Promise.resolve(ctx.saveChat?.()).catch(() => {});
    }
    return false;
  } finally { clearTimeout(timer); inFlight.delete(msg); }
}
