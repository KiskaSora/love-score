// Стадии отношений для авто-режима (чистые функции, без зависимостей).
// Считаются по доле очков от максимума; цвет сердечка и подпись в шапке следуют стадии.
export const AUTO_STAGES = [
  { id: 'tense',   label: 'Напряжение',      icon: 'fa-snowflake',    color: '#8a93a6', deep: '#5b6372' },
  { id: 'meet',    label: 'Знакомство',      icon: 'fa-hand',         color: '#7fa8d6', deep: '#4f7bb0' },
  { id: 'watch',   label: 'Присматривается', icon: 'fa-eye',          color: '#8e8ee0', deep: '#5f5fb8' },
  { id: 'near',    label: 'Сближение',       icon: 'fa-link',         color: '#c27be0', deep: '#9248b8' },
  { id: 'trust',   label: 'Доверие',         icon: 'fa-handshake',    color: '#ff6f9c', deep: '#d83f73' },
  { id: 'bond',    label: 'Привязанность',   icon: 'fa-heart',        color: '#ff4466', deep: '#c81f42' },
  { id: 'intimate',label: 'Близость',        icon: 'fa-heart-circle-check', color: '#ff2d55', deep: '#a8112f' },
];
export function autoStage(score, max) {
  const r = (Number(score) || 0) / Math.max(1, Number(max) || 100);
  const i = r < 0 ? 0 : r < 0.10 ? 1 : r < 0.25 ? 2 : r < 0.45 ? 3 : r < 0.65 ? 4 : r < 0.85 ? 5 : 6;
  return AUTO_STAGES[i];
}
export function autoStageOn(c) { return c?.autoSlowBurn === true && !c?.groupMode; }
// Куда ставить очки, когда уровень отношений выбирают вручную: середина стадии (для «Напряжения» — небольшой минус).
const MID = [-0.1, 0.05, 0.175, 0.35, 0.55, 0.75, 0.92];
export function stagePoint(i, max) { const m = Math.max(1, Number(max) || 100); return Math.round(m * MID[i] * 10) / 10; }
