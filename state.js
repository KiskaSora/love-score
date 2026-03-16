import { saveSettingsDebounced } from '../../../../script.js';
import { cfg, toast, loveData }  from './config.js';

// ─── Пресеты ─────────────────────────────────────────────────────────────────
export function snapshotCurrentData(name) {
  const d = loveData();
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name,
    createdAt: new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
    maxScore: d.maxScore,
    scoreChanges:         JSON.parse(JSON.stringify(d.scoreChanges         || [])),
    scaleInterpretations: JSON.parse(JSON.stringify(d.scaleInterpretations || [])),
    milestones:           JSON.parse(JSON.stringify((d.milestones || []).map(m => ({ ...m, done: false }))))
  };
}

export function savePreset(name) {
  if (!name.trim()) { toast('warning', 'Введи название пресета'); return; }
  const c = cfg();
  if (!c.presets) c.presets = [];
  const existing = c.presets.findIndex(p => p.name === name.trim());
  const snap = snapshotCurrentData(name.trim());
  if (existing >= 0) c.presets[existing] = snap;
  else c.presets.push(snap);
  saveSettingsDebounced();
  toast('success', 'Пресет «' + name.trim() + '» сохранён');
}

export function applyPresetData(src, mode, sections) {
  const d = loveData();
  if (mode === 'replace') {
    if (sections.changes)    d.scoreChanges         = JSON.parse(JSON.stringify(src.scoreChanges         || []));
    if (sections.ranges)     d.scaleInterpretations = JSON.parse(JSON.stringify(src.scaleInterpretations || []));
    if (sections.milestones) d.milestones           = JSON.parse(JSON.stringify(src.milestones           || []));
    if (sections.maxScore)   { d.maxScore = src.maxScore || d.maxScore; cfg().maxScore = d.maxScore; }
  } else {
    if (sections.changes) {
      const existing = new Set(d.scoreChanges.map(x => x.delta+'|'+x.description));
      (src.scoreChanges||[]).forEach(x => { if(!existing.has(x.delta+'|'+x.description)) d.scoreChanges.push(JSON.parse(JSON.stringify(x))); });
    }
    if (sections.ranges) {
      const existing = new Set(d.scaleInterpretations.map(x => x.min+'|'+x.max));
      (src.scaleInterpretations||[]).forEach(x => { if(!existing.has(x.min+'|'+x.max)) d.scaleInterpretations.push(JSON.parse(JSON.stringify(x))); });
    }
    if (sections.milestones) {
      const existing = new Set(d.milestones.map(x => x.threshold));
      (src.milestones||[]).forEach(x => { if(!existing.has(x.threshold)) d.milestones.push(JSON.parse(JSON.stringify(x))); });
    }
  }
  saveSettingsDebounced();
}

export function loadPresetUI(src) {
  const mode     = document.querySelector('input[name=ls-load-mode]:checked')?.value || 'replace';
  const sections = {
    changes:    document.getElementById('ls-load-changes')?.checked    ?? true,
    ranges:     document.getElementById('ls-load-ranges')?.checked     ?? true,
    milestones: document.getElementById('ls-load-milestones')?.checked ?? true,
    maxScore:   document.getElementById('ls-load-maxscore')?.checked   ?? true
  };
  applyPresetData(src, mode, sections);
  toast('success', 'Пресет «' + src.name + '» применён (' + mode + ')');
}

export function deletePreset(id) {
  const c = cfg();
  c.presets = (c.presets || []).filter(p => p.id !== id);
  saveSettingsDebounced();
}

export function exportPresetJSON(src) {
  const blob = new Blob([JSON.stringify(src, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ls-preset-' + (src.name||'preset').replace(/[^a-zа-яё0-9_-]/gi,'_').slice(0,40) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('success', 'Скачиваю «' + (src.name||'preset') + '.json»');
}

export function importPresetFromJSON(json) {
  try {
    const src = JSON.parse(json.trim());
    if (!src.name) src.name = 'Импорт ' + new Date().toLocaleTimeString('ru-RU');
    if (!src.id)   src.id   = Date.now().toString(36);
    if (!src.createdAt) src.createdAt = new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const c = cfg();
    if (!c.presets) c.presets = [];
    c.presets.push(src);
    saveSettingsDebounced();
    toast('success', 'Пресет «' + src.name + '» импортирован');
  } catch(e) { toast('error', 'Неверный JSON: ' + e.message); }
}

export function autoSnapshot(reason) {
  const name = reason + ' ' + new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const c = cfg();
  if (!c.presets) c.presets = [];
  const autoSnaps = c.presets.filter(p => p.name.startsWith('🔄'));
  if (autoSnaps.length >= 5) c.presets.splice(c.presets.indexOf(autoSnaps[0]), 1);
  c.presets.push(snapshotCurrentData('🔄 ' + name));
  saveSettingsDebounced();
}
