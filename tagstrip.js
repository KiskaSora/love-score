// Вырезание старых тегов Love Score из ИСХОДЯЩЕГО промпта (сам чат не трогаем).
// Теги вида <!-- [LOVE_SCORE:47:причина] --> остаются в каждом посте и уходят
// модели при каждой генерации — на длинном чате это тысячи токенов мусора.
// Последние N постов оставляем с тегами как образец, чтобы модель не разучилась их писать.

export const LS_TAG_RE = /<!--\s*\[(?:LOVE_SCORE|RELATION_TYPE|MILESTONE|SCAR|HC_BREAKTHROUGH|NPC_SCORE|NPC_TYPE):[^\]]*\]\s*-->/gi;
const HAS_TAG = /<!--\s*\[(?:LOVE_SCORE|RELATION_TYPE|MILESTONE|SCAR|HC_BREAKTHROUGH|NPC_SCORE|NPC_TYPE):/i;
const OOC_MARK = '[OOC: LOVE SCORE]';

function stripStr(s) {
  const out = s.replace(LS_TAG_RE, '');
  return out === s ? s : out.replace(/\s+$/, '');
}

// Chat Completion: массив {role, content}. Чистим только assistant-посты.
export function stripOldTagsFromMessages(messages, keepN) {
  if (!Array.isArray(messages)) return 0;
  const keep = Math.max(0, keepN | 0);
  let seen = 0, changed = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    const isStr = typeof m.content === 'string';
    const hasTag = isStr ? HAS_TAG.test(m.content)
      : Array.isArray(m.content) && m.content.some(p => p && typeof p.text === 'string' && HAS_TAG.test(p.text));
    if (!hasTag) continue;
    if (seen < keep) { seen++; continue; }          // свежие посты — с тегами
    if (isStr) {
      if (m.content.includes(OOC_MARK)) continue;   // страховка: это не пост, а наш инжект
      const n = stripStr(m.content);
      if (n !== m.content) { m.content = n; changed++; }
    } else {
      m.content.forEach(p => {
        if (p && typeof p.text === 'string') { const n = stripStr(p.text); if (n !== p.text) { p.text = n; changed++; } }
      });
    }
  }
  return changed;
}

// Text Completion: один большой текст. Свой инжект (с примерами тегов) защищаем
// по точному совпадению; не нашли — ничего не трогаем, лучше пропустить, чем сломать.
export function stripOldTagsFromPrompt(prompt, keepN, protect) {
  if (typeof prompt !== 'string' || !protect) return prompt;
  const ps = prompt.indexOf(protect);
  if (ps < 0) return prompt;
  const pe = ps + protect.length;
  const keep = Math.max(0, keepN | 0);
  const all = [];
  for (const m of prompt.matchAll(LS_TAG_RE)) {
    if (m.index >= ps && m.index < pe) continue;
    all.push({ start: m.index, end: m.index + m[0].length, score: /^<!--\s*\[LOVE_SCORE:/i.test(m[0]) });
  }
  const scoreIdx = all.filter(t => t.score).map(t => t.start);
  if (scoreIdx.length <= keep) return prompt;
  const threshold = keep === 0 ? Infinity : scoreIdx[scoreIdx.length - keep];
  let out = '', pos = 0;
  for (const t of all) {
    if (t.start >= threshold) break;
    out += prompt.slice(pos, t.start);
    pos = t.end;
  }
  return out + prompt.slice(pos);
}
