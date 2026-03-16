import { saveSettingsDebounced } from '../../../../script.js';
import { cfg, loveData, chatLoveData, MIN_SCORE, RELATION_TYPES, defaultSettings, escHtml, getActiveInterp, toast, addToLog } from './config.js';
import { refreshWidget, pulseWidget, flipWidget, applyWidgetSize, _h2r } from './heart.js';
import { updatePromptInjection, buildPrompt }            from './prompt.js';
import { savePreset, importPresetFromJSON, exportPresetJSON, deletePreset, loadPresetUI, autoSnapshot } from './state.js';
import { renderGroupNpcs, renderGenLorebookPicker, _syncSourceCards, _updateGenLbCounter, onGenerateClick, onAnalyzeClick, onRefreshModels, autoRegenAll, showAutoRegenStatus, scanChatForNpcs, renderLorebookPicker, mkNpc, saveGroupNpcs, getCurrentCharacterCard, updateCharPreview, _getValidLbIds } from './ai.js';

// ─── Стили ────────────────────────────────────────────────────────────────────
export function injectStyles() {
  if (document.getElementById('ls-styles')) return;
  const el = document.createElement('style');
  el.id = 'ls-styles';
  el.textContent = `
/* ── Widget ── */
#ls-widget {
  position:fixed;top:100px;left:18px;bottom:auto;right:auto;
  width:64px;height:60px;cursor:grab;z-index:999999;
  user-select:none;touch-action:none;
  filter:var(--ls-glow,drop-shadow(0 4px 14px rgba(200,200,200,.25)));
  transition:filter .3s ease,transform .35s ease;
}
#ls-widget:hover{filter:var(--ls-hover-glow,drop-shadow(0 6px 22px rgba(200,200,200,.5)));}
#ls-widget:active{cursor:grabbing;}
#ls-widget.ls-beat{animation:ls-hb .55s cubic-bezier(.36,1.8,.5,1) forwards;}
#ls-widget.ls-flip{animation:ls-flip-anim .55s ease forwards;}
@keyframes ls-hb{0%{transform:scale(1)}40%{transform:scale(1.30)}70%{transform:scale(.92)}100%{transform:scale(1)}}
@keyframes ls-flip-anim{0%{transform:scaleY(1)}35%{transform:scaleY(0) scale(1.15)}65%{transform:scaleY(0) scale(1.15)}100%{transform:scaleY(1)}}
#ls-heart-fill{transition:y .6s ease,height .6s ease,fill .5s ease;}
#ls-status-tip, .ls-tip{
  position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);
  background:rgba(18,18,22,.96);backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.1);border-radius:8px;
  padding:7px 11px;font-size:11px;line-height:1.5;color:rgba(255,255,255,.8);
  pointer-events:none;opacity:0;white-space:normal;text-align:center;
  max-width:210px;min-width:90px;transition:opacity .18s ease;z-index:1000000;
}
#ls-widget:hover #ls-status-tip, #ls-widget:hover .ls-tip{opacity:1;}
.ls-tip-type{font-weight:700;margin-bottom:3px;font-size:12px;}
.ls-tip-desc{font-size:10px;opacity:.75;line-height:1.45;}
.ls-heart-wrap{position:relative;width:100%;height:100%;}
.ls-heart-blur{position:absolute;inset:0;transition:filter .4s ease;}
.ls-heart-blur svg{display:block;width:100%;height:100%;overflow:visible;}
.ls-heart-blur path{transition:fill .5s ease;}
.ls-heart-score{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:2;}
.ls-heart-num{font-size:16px;font-weight:800;line-height:1;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6),0 0 20px rgba(0,0,0,.3);}
.ls-heart-denom{font-size:9px;line-height:1;margin-top:1px;color:rgba(255,255,255,.6);text-shadow:0 1px 4px rgba(0,0,0,.5);}
.ls-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.ls-section-title{font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--SmartThemeBodyColor,#aaa);opacity:.55;margin:14px 0 5px;padding-bottom:4px;border-bottom:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-hint{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.4;line-height:1.5;margin-bottom:6px;}
.ls-num-input{background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:4px 6px;text-align:center;font-size:13px;transition:border-color .15s;}
.ls-num-input:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4));}
.ls-range-input{background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:4px 6px;text-align:center;font-size:13px;width:68px;box-sizing:border-box;transition:border-color .15s;}
.ls-range-input:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4));}
.ls-textarea-field{flex:1;resize:vertical;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:6px 8px;font-family:inherit;font-size:12px;line-height:1.55;box-sizing:border-box;min-height:52px;transition:border-color .15s;}
.ls-textarea-field:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35));}
.ls-card{display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;padding:8px;border-radius:6px;border:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-card-pos{background:rgba(255,180,200,.04);border-color:rgba(255,150,180,.15);}
.ls-card-neg{background:rgba(40,40,50,.3);border-color:rgba(80,80,100,.2);}
.ls-card-neu{background:var(--input-background-fill,rgba(255,255,255,.02));}
.ls-card-milestone{background:rgba(255,220,160,.04);border-color:rgba(220,180,120,.15);}
.ls-card-milestone.ls-done{opacity:.4;}
.ls-heart-box{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:44px;}
.ls-heart-icon{font-size:18px;line-height:1;display:block;}
.ls-heart-icon.ls-icon-pos{color:rgba(255,100,140,.85);filter:drop-shadow(0 0 4px rgba(255,80,120,.4));}
.ls-heart-icon.ls-icon-neg{color:rgba(110,110,155,.75);}
.ls-del-btn{padding:3px 7px!important;min-width:unset!important;align-self:flex-start;opacity:.35;transition:opacity .15s;}
.ls-del-btn:hover{opacity:.8;}
.ls-range-box{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:148px;}
.ls-range-label{font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--SmartThemeBodyColor,#aaa);opacity:.45;line-height:1;}
.ls-range-inner{display:flex;align-items:center;gap:6px;}
.ls-range-sep{opacity:.3;font-size:12px;}
.ls-add-btn{width:100%;margin-top:4px;opacity:.7;}
.ls-add-btn:hover{opacity:1;}
.ls-milestone-left{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:72px;}
.ls-milestone-threshold-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;}
.ls-milestone-threshold-label{font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.4;line-height:1;}
.ls-milestone-done-cb{width:15px;height:15px;cursor:pointer;accent-color:var(--SmartThemeBodyColor,#aaa);margin-top:2px;}
.ls-milestone-status{font-size:9px;opacity:.4;text-align:center;line-height:1.3;}
.ls-milestone-status.ls-status-due{opacity:.8;font-weight:600;}
.ls-milestone-reset-row{display:flex;justify-content:flex-end;margin-bottom:6px;}
#ls-active-state{margin-bottom:8px;padding:8px 10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.1));font-size:12px;line-height:1.55;color:var(--SmartThemeBodyColor,#ccc);}
#ls-active-state strong{opacity:.7;}
input[type=range].ls-size-slider{flex:1;accent-color:var(--SmartThemeBodyColor,#aaa);}
.ls-rel-type-row{display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:4px 0;flex-wrap:nowrap;}
.ls-rel-type-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;cursor:pointer;opacity:.22;transition:opacity .15s,filter .15s;user-select:none;flex-shrink:0;}
.ls-rel-type-btn:hover{opacity:.6;}
.ls-rel-type-btn.ls-rt-active{opacity:1;filter:drop-shadow(0 2px 8px currentColor);}
#ls-type-info{display:none;font-size:11px;line-height:1.55;padding:7px 10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));color:var(--SmartThemeBodyColor,#ccc);margin-bottom:6px;}
.ls-rt-neutral{color:#c0c0c0}.ls-rt-romance{color:#ff2d55}.ls-rt-friendship{color:#ff9d2e}.ls-rt-family{color:#f0c000}.ls-rt-platonic{color:#00c49a}.ls-rt-rival{color:#2979ff}.ls-rt-obsession{color:#a855f7}.ls-rt-hostile{color:#2e8b00}
.ls-rel-type-label{font-size:11px;opacity:.45;color:var(--SmartThemeBodyColor,#aaa);margin-left:4px;min-width:70px;}
.ls-preset-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;padding:7px 9px;border-radius:5px;background:var(--input-background-fill,rgba(255,255,255,.02));border:1px solid var(--border-color,rgba(255,255,255,.08));}
.ls-preset-row.ls-preset-snap{border-left:3px solid rgba(100,180,100,.35);opacity:.7;}
.ls-preset-info{flex:1;min-width:0;}
.ls-preset-name{font-size:12px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ls-preset-meta{font-size:10px;opacity:.35;margin-top:1px;}
.ls-preset-actions{display:flex;gap:4px;flex-shrink:0;}
.ls-preset-btn{padding:3px 7px!important;min-width:unset!important;font-size:11px!important;}
#ls-load-mode-box{padding:8px;border-radius:5px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.08));margin-bottom:8px;}
.ls-load-mode-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px;}
.ls-load-checks{display:flex;gap:8px;flex-wrap:wrap;}
.ls-api-label{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.45;margin:6px 0 3px;display:block;}
.ls-api-field{width:100%;box-sizing:border-box;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:5px 8px;font-size:12px;transition:border-color .15s;}
.ls-api-field:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35));}
.ls-model-row{display:flex;gap:6px;align-items:center;margin-bottom:2px;}
.ls-model-row select{flex:1;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:5px 8px;font-size:12px;}
.ls-refresh-btn{padding:5px 9px!important;min-width:unset!important;flex-shrink:0;}
.ls-refresh-btn.ls-loading i{animation:ls-spin .7s linear infinite;}
@keyframes ls-spin{to{transform:rotate(360deg)}}
.ls-scope-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-bottom:8px;}
.ls-scope-item{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--SmartThemeBodyColor,#ccc);}
#ls-char-preview{display:flex;align-items:center;gap:10px;padding:8px 10px;margin:8px 0 4px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.08));}
#ls-char-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--border-color,rgba(255,255,255,.2));flex-shrink:0;background:var(--input-background-fill,rgba(255,255,255,.06));transition:opacity .2s;box-shadow:0 2px 10px rgba(0,0,0,.4);}
#ls-char-avatar.ls-avatar-hidden{display:none;}
#ls-char-avatar-name{font-size:13px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;}
#ls-gen-status{font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.6;margin-top:5px;min-height:15px;line-height:1.4;}
.ls-log-entry{display:flex;align-items:center;gap:8px;padding:4px 8px;margin-bottom:2px;border-radius:4px;font-size:11px;}
.ls-log-delta{font-size:12px;font-weight:800;min-width:36px;white-space:nowrap;}
.ls-log-reason{color:var(--SmartThemeBodyColor,#ccc);opacity:.7;line-height:1.4;}
.ls-log-clear{padding:2px 8px!important;min-width:unset!important;font-size:10px!important;opacity:.4;}
.ls-log-clear:hover{opacity:.8;}
#ls-analyze-result{margin-top:8px;padding:10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.12));display:none;}
.ls-analyze-score{font-size:13px;font-weight:600;color:var(--SmartThemeBodyColor,#eee);margin-bottom:6px;}
.ls-analyze-text{font-size:12px;line-height:1.55;color:var(--SmartThemeBodyColor,#ccc);opacity:.85;margin-bottom:5px;}
.ls-analyze-reason{font-size:11px;line-height:1.4;color:var(--SmartThemeBodyColor,#aaa);opacity:.55;font-style:italic;}
.ls-analyze-reltype{display:flex;align-items:center;padding:6px 0 8px 0;margin-bottom:4px;border-bottom:1px solid var(--border-color,rgba(255,255,255,.08));}
#ls-autosuggest-result{margin-top:8px;padding:10px;border-radius:6px;background:rgba(255,200,100,.04);border:1px dashed rgba(255,200,100,.25);display:none;font-size:12px;line-height:1.6;color:var(--SmartThemeBodyColor,#ccc);}
#ls-autosuggest-result .ls-as-title{font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.5;margin-bottom:6px;}
#ls-debug-prompt{width:100%;box-sizing:border-box;min-height:140px;max-height:320px;overflow-y:auto;resize:vertical;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.07);border-radius:6px;color:rgba(180,255,180,.8);font-family:'Courier New',monospace;font-size:10px;line-height:1.6;padding:10px;white-space:pre-wrap;word-break:break-word;outline:none;}
.ls-debug-block{margin-bottom:12px;}
.ls-debug-label{font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;opacity:.35;margin-bottom:4px;display:flex;align-items:center;gap:6px;}
.ls-debug-label i{opacity:.7;}
.ls-debug-copy{padding:2px 8px!important;min-width:unset!important;font-size:10px!important;opacity:.4;margin-left:auto;}
.ls-debug-copy:hover{opacity:.9;}
.ls-debug-npc-state{display:flex;flex-direction:column;gap:4px;}
.ls-debug-npc-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);font-size:11px;}
.ls-debug-npc-name{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ls-debug-npc-score{font-size:12px;font-weight:800;min-width:36px;text-align:right;}
.ls-debug-npc-rt{font-size:10px;opacity:.5;min-width:70px;}
.ls-debug-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
.ls-debug-stat{display:flex;flex-direction:column;padding:6px 10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:5px;}
.ls-debug-stat-val{font-size:14px;font-weight:800;color:var(--SmartThemeBodyColor,#eee);}
.ls-debug-stat-key{font-size:9px;opacity:.35;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;}
.ls-debug-refresh{font-size:11px!important;padding:4px 10px!important;min-width:unset!important;}
.ls-npc-card{position:relative;margin-bottom:8px;border-radius:10px;border:1px solid rgba(255,255,255,.08);overflow:hidden;background:rgba(255,255,255,.015);transition:border-color .2s,box-shadow .2s;}
.ls-npc-card:hover{border-color:rgba(255,255,255,.15);box-shadow:0 4px 20px rgba(0,0,0,.25);}
.ls-npc-av-wrap{position:relative;width:46px;height:46px;flex-shrink:0;cursor:pointer;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);box-shadow:0 2px 10px rgba(0,0,0,.4);transition:border-color .2s;}
.ls-npc-av-wrap:hover .ls-npc-av-overlay{opacity:1;}
.ls-npc-av-wrap:hover{border-color:rgba(255,255,255,.4);}
.ls-npc-av-img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}
.ls-npc-av-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;color:rgba(255,255,255,.25);}
.ls-npc-av-overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;opacity:0;transition:opacity .15s;border-radius:50%;}
.ls-npc-top{display:flex;align-items:center;gap:10px;padding:10px 10px 8px 12px;}
.ls-npc-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;}
.ls-npc-names{display:flex;gap:6px;align-items:center;}
.ls-npc-name{font-size:13px;font-weight:700;color:var(--SmartThemeBodyColor,#eee);background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.08);outline:none;flex:1;min-width:0;padding:1px 2px;transition:border-color .15s;}
.ls-npc-name:focus{border-bottom-color:rgba(255,255,255,.35);}
.ls-npc-name-en{font-size:10px;color:rgba(255,255,255,.35);background:transparent;border:none;border-bottom:1px dashed rgba(255,255,255,.08);outline:none;width:80px;flex-shrink:0;padding:1px 2px;transition:border-color .15s;font-style:italic;}
.ls-npc-name-en:focus{border-bottom-color:rgba(255,255,255,.25);color:rgba(255,255,255,.6);}
.ls-npc-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.ls-npc-rt-row{display:flex;gap:3px;align-items:center;}
.ls-npc-rt-btn{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;cursor:pointer;opacity:.18;transition:opacity .15s,filter .15s;flex-shrink:0;border-radius:50%;}
.ls-npc-rt-btn:hover{opacity:.5;}
.ls-npc-rt-btn.ls-rt-active{opacity:1;filter:drop-shadow(0 1px 5px currentColor);}
.ls-npc-rt-label{font-size:10px;font-weight:600;margin-left:3px;opacity:.8;}
.ls-npc-sep{opacity:.15;font-size:10px;}
.ls-npc-score-row{display:flex;align-items:center;gap:3px;margin-left:auto;flex-shrink:0;}
.ls-npc-adj-btn{width:20px;height:20px;padding:0!important;min-width:unset!important;font-size:10px!important;display:flex;align-items:center;justify-content:center;opacity:.6;}
.ls-npc-adj-btn:hover{opacity:1;}
.ls-npc-score-val{font-size:13px;font-weight:800;min-width:26px;text-align:center;}
.ls-npc-score-sep{font-size:10px;opacity:.25;}
.ls-npc-score-max{width:36px;font-size:10px;background:transparent;border:none;border-bottom:1px dashed rgba(255,255,255,.1);color:rgba(255,255,255,.4);outline:none;text-align:center;padding:0;}
.ls-npc-score-max:focus{border-bottom-color:rgba(255,255,255,.3);color:rgba(255,255,255,.7);}
.ls-npc-del-btn{opacity:.2;transition:opacity .15s;padding:3px 6px!important;min-width:unset!important;font-size:11px!important;flex-shrink:0;}
.ls-npc-del-btn:hover{opacity:.8;}
.ls-npc-bar-wrap{height:4px;background:rgba(255,255,255,.05);position:relative;overflow:hidden;}
.ls-npc-bar-fill{height:100%;transition:width .5s cubic-bezier(.4,0,.2,1),background .4s;}
.ls-npc-bar-neg{position:absolute;top:0;right:0;height:100%;transition:width .5s cubic-bezier(.4,0,.2,1);}
.ls-npc-fields{padding:6px 12px 10px;}
.ls-npc-field{width:100%;box-sizing:border-box;resize:vertical;background:transparent;border:none;border-top:1px solid rgba(255,255,255,.05);color:var(--SmartThemeBodyColor,#bbb);font-family:inherit;font-size:11px;line-height:1.55;padding:5px 0 0;min-height:32px;outline:none;opacity:.65;transition:opacity .15s;}
.ls-npc-field:focus{opacity:1;border-top-color:rgba(255,255,255,.18);}
.ls-npc-lb-toggle{display:flex;align-items:center;gap:5px;padding:4px 0 5px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;user-select:none;}
.ls-npc-lb-toggle input{cursor:pointer;accent-color:#a78bfa;}
.ls-npc-add-row{display:flex;gap:6px;margin-bottom:8px;}
.ls-npc-add-row .menu_button{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px!important;}
#ls-lorebook-picker{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;margin-bottom:10px;max-height:320px;overflow-y:auto;}
.ls-lb-header{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;background:rgba(20,15,25,.95);backdrop-filter:blur(8px);z-index:2;}
.ls-lb-group{border-bottom:1px solid rgba(255,255,255,.05);}
.ls-lb-group:last-child{border-bottom:none;}
.ls-lb-group-title{font-size:10px;letter-spacing:.5px;text-transform:uppercase;opacity:.3;padding:6px 10px 4px;font-weight:600;}
.ls-lb-entry{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;gap:1px 8px;padding:7px 10px;cursor:pointer;border-top:1px solid rgba(255,255,255,.04);transition:background .12s;}
.ls-lb-entry:hover{background:rgba(255,255,255,.04);}
.ls-lb-entry-name{font-size:12px;font-weight:600;color:var(--SmartThemeBodyColor,#ddd);grid-row:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ls-lb-entry-preview{font-size:10px;opacity:.35;line-height:1.4;grid-row:2;overflow:hidden;max-height:1.5em;transition:max-height .25s;}
.ls-lb-entry.ls-lb-expanded .ls-lb-entry-preview{max-height:12em;white-space:pre-wrap;opacity:.55;}
.ls-lb-add-btn{grid-row:1/3;align-self:center;width:24px!important;height:24px!important;padding:0!important;min-width:unset!important;font-size:11px!important;opacity:.45;flex-shrink:0;}
.ls-lb-add-btn:hover:not(:disabled){opacity:1;}
.ls-lb-add-btn:disabled{opacity:.2;cursor:default;}
.ls-group-empty{font-size:12px;opacity:.3;padding:16px;text-align:center;font-style:italic;}
.ls-sub-acc{margin-left:6px;}
.ls-sub-acc+.ls-sub-acc{margin-top:1px;}
.ls-sub-acc-header{padding-left:10px!important;font-size:12px!important;opacity:.78;}
.ls-sub-acc-header:hover{opacity:1;}
.ls-gen-lb-entry{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-top:1px solid rgba(255,255,255,.04);transition:background .12s;}
.ls-gen-lb-entry:hover{background:rgba(255,255,255,.04);}
.ls-gen-lb-entry input[type=checkbox]{cursor:pointer;accent-color:#a78bfa;flex-shrink:0;width:13px;height:13px;}
.ls-gen-lb-info{flex:1;min-width:0;}
.ls-source-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:6px 0 4px;}
.ls-source-card{position:relative;display:flex;flex-direction:column;border:1.5px solid rgba(255,255,255,.07);border-radius:10px;padding:11px 10px 10px 12px;cursor:pointer;transition:border-color .2s,background .2s,box-shadow .2s;background:rgba(255,255,255,.02);overflow:hidden;user-select:none;}
.ls-source-card:hover{border-color:rgba(255,68,102,.22);background:rgba(255,68,102,.03);}
.ls-source-card input[type=checkbox]{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}
.ls-source-card.ls-src-active{border-color:rgba(255,68,102,.45);background:rgba(255,68,102,.05);box-shadow:0 0 14px rgba(255,68,102,.08) inset;}
.ls-source-card.ls-src-active .ls-source-icon{color:#ff4466;opacity:.9;}
.ls-source-card.ls-src-active .ls-source-check{opacity:1;transform:scale(1);}
.ls-source-card.ls-src-active .ls-source-card-title{color:#ff7a94;}
.ls-source-card-inner{display:flex;flex-direction:column;gap:3px;}
.ls-source-icon{font-size:16px;color:var(--SmartThemeBodyColor,#ccc);opacity:.25;margin-bottom:4px;transition:color .2s,opacity .2s;}
.ls-source-card-title{font-size:11px;font-weight:700;color:var(--SmartThemeBodyColor,#ddd);line-height:1.3;transition:color .2s;}
.ls-source-card-sub{font-size:10px;opacity:.35;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:13px;}
.ls-source-check{position:absolute;top:7px;right:8px;width:16px;height:16px;border-radius:50%;background:#ff4466;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;opacity:0;transform:scale(.5);transition:opacity .18s,transform .18s;}
.ls-source-card-open{border-color:rgba(255,68,102,.4)!important;background:rgba(255,68,102,.05)!important;}
.ls-source-card-open .ls-source-icon{color:#ff4466!important;opacity:.8!important;}
.ls-source-summary{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);margin:4px 0 10px;min-height:32px;flex-wrap:wrap;}
.ls-source-summary-empty{font-size:11px;opacity:.28;font-style:italic;width:100%;text-align:center;}
.ls-src-tag{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:600;white-space:nowrap;}
.ls-src-tag-card{background:rgba(255,68,102,.1);border:1px solid rgba(255,68,102,.25);color:#ff7a94;}
.ls-src-tag-lb{background:rgba(255,157,46,.08);border:1px solid rgba(255,157,46,.22);color:#ffb566;}
.ls-src-plus{font-size:13px;opacity:.3;font-weight:300;line-height:1;}
.ls-gen-lb-panel-header{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;background:rgba(12,8,18,.97);backdrop-filter:blur(10px);z-index:2;}
.ls-gen-lb-panel-title{font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;opacity:.45;display:flex;align-items:center;}
.ls-gen-lb-hbtn{padding:2px 7px!important;font-size:10px!important;opacity:.45;transition:opacity .15s;}
.ls-gen-lb-hbtn:hover{opacity:.9;}
.ls-gen-lb-entry input[type=checkbox]{display:none;}
.ls-gen-lb-checked{background:rgba(255,68,102,.05);}
.ls-gen-lb-check-icon{flex-shrink:0;width:16px;display:flex;align-items:center;justify-content:center;}
`;
  document.head.appendChild(el);
}

// ─── Хелперы UI ───────────────────────────────────────────────────────────────
export function acc(id, title, content, open=false) {
  return `<div class="inline-drawer ls-sub-acc" id="${id}">
    <div class="inline-drawer-toggle inline-drawer-header ls-sub-acc-header"><b>${title}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
    <div class="inline-drawer-content"${open ? '' : ' style="display:none"'}>${content}</div>
  </div>`;
}

export function heartSvgMini(rt) {
  const rot = rt === 'hostile' ? 'transform:rotate(180deg);' : '';
  return `<svg viewBox="0 0 20 16" width="20" height="16" style="display:block;fill:currentColor;${rot}"><path d="M10,15.5 C10,15.5 1,9.5 1,4.5 C1,2 3,0.5 5.5,0.5 C7.5,0.5 9.2,2 10,3.5 C10.8,2 12.5,0.5 14.5,0.5 C17,0.5 19,2 19,4.5 C19,9.5 10,15.5 10,15.5Z"/></svg>`;
}

// ─── Панель настроек ──────────────────────────────────────────────────────────
export function settingsPanelHTML() {
  const c = cfg(), curModel = escHtml(c.genModel||''), curEndpoint = escHtml(c.genEndpoint||'');
  const curKey = escHtml(c.genApiKey||''), lang = c.genLang||'ru', curNotes = escHtml(c.genUserNotes||'');
  const sc  = c.genScope || defaultSettings.genScope;
  const chk = (id, val, label) => `<label class="ls-scope-item"><input type="checkbox" id="${id}"${val?' checked':''}> ${label}</label>`;
  const heartStyleSvgChecked  = (c.heartStyle||'svg') === 'svg'  ? ' checked' : '';
  const heartStyleBlurChecked = (c.heartStyle||'svg') === 'blur' ? ' checked' : '';

  const groupContent = `
    <div class="ls-hint">Отслеживай отношения с несколькими персонажами. Тяни записи из лорбука главного героя или создавай вручную. Данные хранятся отдельно для каждого чата.</div>
    <div class="ls-row"><label class="checkbox_label" for="ls-group-enabled"><input type="checkbox" id="ls-group-enabled"${c.groupMode?' checked':''}><span>Включить режим окружения</span></label></div>
    <div id="ls-group-body" style="${c.groupMode?'':'display:none'}">
      <div class="ls-npc-add-row">
        <button id="ls-npc-from-lorebook" class="menu_button"><i class="fa-solid fa-book-open"></i> Из лорбука</button>
        <button id="ls-npc-add-manual" class="menu_button"><i class="fa-solid fa-pen-to-square"></i> Создать вручную</button>
      </div>
      <div class="ls-npc-add-row" style="margin-top:0;margin-bottom:6px;">
        <button id="ls-npc-scan-chat" class="menu_button" style="flex:1;" title="Найти упомянутых NPC из лорбука в истории чата"><i class="fa-solid fa-magnifying-glass"></i> Найти NPC в чате</button>
      </div>
      <div id="ls-scan-result" style="display:none;margin-bottom:8px;padding:8px;border-radius:6px;background:rgba(167,139,250,.05);border:1px dashed rgba(167,139,250,.25);font-size:11px;line-height:1.6;color:var(--SmartThemeBodyColor,#ccc);"></div>
      <div id="ls-lorebook-picker" style="display:none;">
        <div class="ls-lb-header">
          <span style="font-size:11px;opacity:.5;"><i class="fa-solid fa-book-open" style="margin-right:4px;"></i>Выбери записи для добавления</span>
          <button id="ls-lb-close" class="menu_button" style="padding:2px 8px!important;font-size:11px!important;opacity:.5;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="ls-lorebook-picker-list"></div>
      </div>
      <div id="ls-group-list"></div>
    </div>`;

  const mainContent = `
    <div class="ls-row"><label class="checkbox_label" for="ls-enabled"><input type="checkbox" id="ls-enabled"><span>Включено</span></label></div>
    <div class="ls-row">
      <span style="font-size:12px;opacity:.6;">Очки:</span>
      <input id="ls-val" type="number" class="ls-num-input" style="width:72px;">
      <span style="opacity:.3;">/</span>
      <input id="ls-max" type="number" min="1" class="ls-num-input" style="width:72px;">
      <button id="ls-reset-btn" class="menu_button">Сбросить</button>
    </div>
    <div class="ls-rel-type-row">
      ${Object.entries(RELATION_TYPES).map(([k,v]) => `<span class="ls-rel-type-btn ls-rt-${k}" data-rt="${k}" title="${v.label}">${heartSvgMini(k)}</span>`).join('')}
      <span class="ls-rel-type-label" id="ls-rt-label"></span>
    </div>
    <div id="ls-type-info"></div>
    <div class="ls-row">
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">Размер:</span>
      <input type="range" id="ls-size" min="36" max="128" step="4" class="ls-size-slider" style="flex:1;">
      <span id="ls-size-label" style="font-size:12px;min-width:36px;text-align:right;opacity:.5;">64px</span>
      <button id="ls-reset-pos" class="menu_button" title="Вернуть в угол">Позиция</button>
    </div>
    <div class="ls-row">
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">Сердечко:</span>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-heart-style" value="svg"${heartStyleSvgChecked}> <span>Заливка</span></label>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-heart-style" value="blur"${heartStyleBlurChecked}> <span>Размытое</span></label>
    </div>
    <div class="ls-row"><label class="checkbox_label" for="ls-gradual"><input type="checkbox" id="ls-gradual"><span>SlowBurn (±2 макс за ответ)</span></label></div>
    <div id="ls-active-state" style="display:none;"><strong>Сейчас:</strong> <span id="ls-active-text"></span></div>
    <div class="ls-section-title" style="display:flex;align-items:center;justify-content:space-between;">История <button id="ls-log-clear" class="menu_button ls-log-clear">очистить</button></div>
    <div id="ls-score-log"></div>`;

  const rulesContent = `
    <div class="ls-section-title" style="margin-top:0;">Правила изменения</div>
    <div class="ls-hint">За что растут и падают очки.</div>
    <div id="ls-changes-container"></div>
    <div class="ls-section-title">Поведение по диапазонам</div>
    <div class="ls-hint">Описывай поведение для позитивных и негативных значений.</div>
    <div id="ls-interp-container"></div>
    <div class="ls-section-title">Романтические события</div>
    <div class="ls-hint">При достижении порога персонаж инициирует событие.</div>
    <div class="ls-milestone-reset-row"><button id="ls-milestone-reset-all" class="menu_button">Сбросить все</button></div>
    <div id="ls-milestones-container"></div>`;

  const aiContent = `
    <div class="ls-hint">Выбери что генерировать, подключи API и нажми кнопку.</div>
    <div style="font-size:11px;opacity:.5;font-weight:600;letter-spacing:.4px;text-transform:uppercase;margin-bottom:5px;">Что генерировать</div>
    <div class="ls-scope-grid">
      ${chk('ls-scope-changes',sc.changes,'Правила изменений')}
      ${chk('ls-scope-pos-ranges',sc.positiveRanges,'Диапазоны позитив')}
      ${chk('ls-scope-neg-ranges',sc.negativeRanges,'Диапазоны негатив (-100…-1)')}
      ${chk('ls-scope-milestones',sc.milestones,'Романтические события')}
      ${chk('ls-scope-max',sc.suggestedMax,'Предложить макс. очки')}
    </div>
    <div class="ls-row" style="margin-bottom:6px;gap:12px;"><span style="font-size:12px;opacity:.6;white-space:nowrap;">Язык:</span>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-ru" value="ru"${lang==='ru'?' checked':''}> <span>Русский</span></label>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-lang" id="ls-lang-en" value="en"${lang==='en'?' checked':''}> <span>English</span></label>
    </div>
    <label class="ls-api-label">Особые пожелания</label>
    <textarea id="ls-gen-notes" class="ls-api-field" rows="2" placeholder="Например: не добавляй события про брак..." style="resize:vertical;font-family:inherit;font-size:12px;line-height:1.5;">${curNotes}</textarea>
    <label class="ls-api-label">Endpoint</label>
    <input id="ls-gen-endpoint" class="ls-api-field" type="text" placeholder="https://api.example.com/v1" value="${curEndpoint}">
    <label class="ls-api-label">API Key</label>
    <input id="ls-gen-apikey" class="ls-api-field" type="password" placeholder="sk-..." value="${curKey}">
    <label class="ls-api-label">Модель</label>
    <div class="ls-model-row">
      <select id="ls-gen-model-select">${curModel?`<option value="${curModel}" selected>${curModel}</option>`:'<option value="">-- нажми обновить --</option>'}</select>
      <button id="ls-refresh-models" class="menu_button ls-refresh-btn" title="Загрузить модели"><i class="fa-solid fa-sync"></i></button>
    </div>
    <div class="ls-section-title" style="margin-top:10px;"><i class="fa-solid fa-database" style="margin-right:6px;opacity:.7;"></i>Источник данных</div>
    <div class="ls-hint">Выбери один или оба — ИИ получит всю инфу вместе.</div>
    <div class="ls-source-grid">
      <label class="ls-source-card" id="ls-src-card-label">
        <input type="checkbox" id="ls-gen-use-card"${c.genUseCard!==false?' checked':''}>
        <div class="ls-source-card-inner"><i class="fa-solid fa-address-card ls-source-icon"></i><div class="ls-source-card-title">Карточка</div><div class="ls-source-card-sub" id="ls-src-card-name">&nbsp;</div></div>
        <div class="ls-source-check"><i class="fa-solid fa-check"></i></div>
      </label>
      <label class="ls-source-card" id="ls-src-lb-label">
        <input type="checkbox" id="ls-gen-use-lb"${(cfg().genLorebookEntryIds||[]).length>0?' checked':''} style="display:none">
        <div class="ls-source-card-inner"><i class="fa-solid fa-book-bookmark ls-source-icon"></i><div class="ls-source-card-title">Лорбук</div><div class="ls-source-card-sub" id="ls-src-lb-sub">&nbsp;</div></div>
        <div class="ls-source-check"><i class="fa-solid fa-check"></i></div>
      </label>
    </div>
    <div id="ls-gen-lb-panel" style="display:none;border:1px solid rgba(255,68,102,.15);border-radius:10px;overflow:hidden;margin:4px 0 6px;max-height:300px;overflow-y:auto;background:rgba(10,4,8,.4);backdrop-filter:blur(6px);">
      <div class="ls-gen-lb-panel-header">
        <span class="ls-gen-lb-panel-title"><i class="fa-solid fa-book-open" style="margin-right:6px;color:#ff4466;opacity:.7;"></i>Записи лорбука &nbsp;<span id="ls-gen-lb-count" style="font-weight:400;opacity:.5;text-transform:none;letter-spacing:0;"></span></span>
        <div style="display:flex;gap:4px;align-items:center;">
          <button id="ls-gen-lb-refresh" class="menu_button ls-gen-lb-hbtn" title="Обновить список"><i class="fa-solid fa-arrows-rotate"></i></button>
          <button id="ls-gen-lb-close" class="menu_button ls-gen-lb-hbtn" title="Свернуть"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
      </div>
      <div id="ls-gen-lb-list"></div>
    </div>
    <div id="ls-source-summary" class="ls-source-summary"></div>
    <div id="ls-char-preview" style="margin-bottom:6px;"><img id="ls-char-avatar" class="ls-avatar-hidden" src="" alt=""><span id="ls-char-avatar-name" style="font-size:12px;opacity:.6;"></span></div>
    <div class="ls-row" style="margin-bottom:6px;gap:6px;">
      <span style="font-size:12px;opacity:.6;white-space:nowrap">Сообщений из чата:&nbsp;</span>
      <input type="number" id="ls-gen-msg-count" class="ls-num-input" min="0" max="200" style="width:60px" value="${c.chatAnalysisMsgCount||20}">
      <span style="font-size:10px;opacity:.35;margin-left:2px">0 = без истории</span>
    </div>
    <button id="ls-gen-btn" class="menu_button" style="width:100%;display:flex;align-items:center;justify-content:center;gap:7px;"><i class="fa-solid fa-wand-magic-sparkles"></i>Сгенерировать</button>
    <div id="ls-gen-status"></div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color,rgba(255,255,255,.08));">
      <div class="ls-section-title" style="margin-top:0;">Анализ чата</div>
      <div class="ls-hint">ИИ читает историю чата + карту персонажа и предлагает счёт отношений</div>
      <button id="ls-analyze-btn" class="menu_button" style="width:100%"><i class="fa-solid fa-chart-line"></i> Анализировать чат</button>
      <div id="ls-analyze-status" style="font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.6;margin-top:5px;min-height:14px;"></div>
      <div id="ls-analyze-result"></div>
    </div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color,rgba(255,255,255,.08));">
      <div class="ls-section-title" style="margin-top:0;"><i class="fa-solid fa-rotate" style="margin-right:5px;"></i>Авто-регенерация</div>
      <div class="ls-hint">Каждые N сообщений ИИ полностью пересоздаёт правила изменений, диапазоны и события.</div>
      <div class="ls-row"><label class="checkbox_label" for="ls-autosuggest-enabled"><input type="checkbox" id="ls-autosuggest-enabled"${c.autoSuggestEnabled?' checked':''}><span>Включить авто-регенерацию</span></label></div>
      <div class="ls-row" style="gap:8px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Каждые</span>
        <input type="number" id="ls-autosuggest-interval" class="ls-num-input" min="5" max="100" style="width:60px;" value="${c.autoSuggestInterval||20}">
        <span style="font-size:12px;opacity:.6;">сообщений</span>
        <button id="ls-autosuggest-now" class="menu_button" title="Регенерировать прямо сейчас"><i class="fa-solid fa-rotate"></i></button>
      </div>
      <div id="ls-autosuggest-progress" style="font-size:11px;opacity:.45;margin-bottom:4px;min-height:14px;"></div>
      <div id="ls-autosuggest-result"></div>
    </div>`;

  const presetsContent = `
    <div class="ls-hint">Сохраняй и загружай наборы правил. Авто-снапшот делается перед каждой генерацией.</div>
    <div id="ls-load-mode-box">
      <div style="font-size:11px;opacity:.5;margin-bottom:5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">Режим применения</div>
      <div class="ls-load-mode-row">
        <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-load-mode" value="replace" checked> <span>Заменить</span></label>
        <label class="checkbox_label" style="margin:0;gap:5px;"><input type="radio" name="ls-load-mode" value="merge"> <span>Дополнить</span></label>
      </div>
      <div class="ls-load-checks">
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-changes" checked> Правила</label>
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-ranges" checked> Диапазоны</label>
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-milestones" checked> События</label>
        <label class="ls-scope-item"><input type="checkbox" id="ls-load-maxscore" checked> Макс. очки</label>
      </div>
    </div>
    <div class="ls-row" style="margin-top:8px;">
      <input type="text" id="ls-preset-name-input" class="ls-api-field" style="flex:1;" placeholder="Название пресета...">
      <button id="ls-preset-save" class="menu_button" style="white-space:nowrap;">Сохранить</button>
    </div>
    <div class="ls-row">
      <button id="ls-preset-import-file-btn" class="menu_button"><i class="fa-solid fa-folder-open"></i> Импорт из файла</button>
      <input type="file" id="ls-preset-file-input" accept=".json,application/json" style="display:none;">
    </div>
    <div id="ls-preset-list"></div>`;

  const debugContent = `
    <div class="ls-hint">Просмотр текущего состояния системы, активных инжектов и как они работают.</div>
    <div class="ls-row" style="justify-content:space-between;">
      <span style="font-size:12px;opacity:.5;"><i class="fa-solid fa-circle-info" style="margin-right:5px;"></i>Данные обновляются при открытии вкладки</span>
      <button id="ls-debug-refresh-btn" class="menu_button ls-debug-refresh"><i class="fa-solid fa-rotate"></i> Обновить</button>
    </div>
    <div id="ls-debug-content"></div>`;

  return `<div id="ls-settings-panel" class="extension-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b><i class="fa-solid fa-heart" style="color:#ff4466;margin-right:6px;"></i>Love Score</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content">
        ${acc('ls-acc-main',   'Основное',     mainContent,    true)}
        ${acc('ls-acc-rules',  'Правила',      rulesContent,   false)}
        ${acc('ls-acc-ai',     'AI генерация', aiContent,      false)}
        ${acc('ls-acc-presets','Пресеты',      presetsContent, false)}
        ${acc('ls-acc-group',  'Окружение',    groupContent,   false)}
        ${acc('ls-acc-debug',  'Отладка',      debugContent,   false)}
      </div>
    </div>
  </div>`;
}

// ─── Рендер секций ────────────────────────────────────────────────────────────
export function renderScoreLog() {
  const ct = document.getElementById('ls-score-log'); if (!ct) return;
  const log = (loveData().scoreLog || []);
  if (!log.length) { ct.innerHTML = '<div style="font-size:11px;opacity:.3;padding:5px 6px;">Пока пусто</div>'; return; }
  ct.innerHTML = log.map(e => {
    const pos = e.delta > 0, neg = e.delta < 0;
    const dc  = pos ? '#6ee86e' : neg ? '#ff6b6b' : '#b0b0b0', bg = pos ? 'rgba(80,200,80,.06)' : neg ? 'rgba(220,60,60,.06)' : 'rgba(180,180,180,.03)';
    const arr = pos ? '↑' : neg ? '↓' : '→', sig = e.sign || (e.delta >= 0 ? '+'+e.delta : String(e.delta));
    return '<div class="ls-log-entry" style="background:'+bg+';">'
      +'<span class="ls-log-delta" style="color:'+dc+';">'+arr+'&thinsp;'+escHtml(sig)+'</span>'
      +((e.reason||'').trim() ? '<span class="ls-log-reason">'+escHtml(e.reason)+'</span>' : '<span style="font-size:11px;opacity:.25;font-style:italic;">—</span>')
      +'</div>';
  }).join('');
}

export function renderPresets() {
  const ct = document.getElementById('ls-preset-list'); if (!ct) return;
  const presets = cfg().presets || [];
  if (!presets.length) { ct.innerHTML = '<div style="font-size:11px;opacity:.3;padding:5px;">Нет сохранённых пресетов</div>'; return; }
  ct.innerHTML = [...presets].reverse().map(p => {
    const isSnap = p.name.startsWith('🔄');
    return '<div class="ls-preset-row'+(isSnap?' ls-preset-snap':'')+'">'
      +'<div class="ls-preset-info"><div class="ls-preset-name">'+escHtml(p.name)+'</div><div class="ls-preset-meta">'+escHtml(p.createdAt||'')+(p.maxScore?' · макс '+p.maxScore:'')+'</div></div>'
      +'<div class="ls-preset-actions">'
      +'<button class="menu_button ls-preset-btn ls-preset-load" data-id="'+p.id+'">Загрузить</button>'
      +'<button class="menu_button ls-preset-btn ls-preset-export" data-id="'+p.id+'">JSON</button>'
      +'<button class="menu_button ls-preset-btn ls-del-btn ls-preset-del" data-id="'+p.id+'">✕</button>'
      +'</div></div>';
  }).join('');
  $(ct).off('click','.ls-preset-load').on('click','.ls-preset-load', function() {
    const id = $(this).data('id'), p = (cfg().presets||[]).find(x => x.id === String(id)); if (p) loadPresetUI(p);
  });
  $(ct).off('click','.ls-preset-export').on('click','.ls-preset-export', function() {
    const id = $(this).data('id'), p = (cfg().presets||[]).find(x => x.id === String(id)); if (p) exportPresetJSON(p);
  });
  $(ct).off('click','.ls-preset-del').on('click','.ls-preset-del', function() { deletePreset(String($(this).data('id'))); renderPresets(); });
}

export function renderChanges() {
  const ct = document.getElementById('ls-changes-container'); if (!ct) return;
  const arr = loveData().scoreChanges || []; let html = '';
  arr.forEach((c, i) => {
    const pos = c.delta >= 0, cls = pos ? 'ls-card-pos' : 'ls-card-neg';
    const icon = pos ? '<i class="fa-solid fa-heart ls-heart-icon ls-icon-pos"></i>' : '<i class="fa-solid fa-heart-crack ls-heart-icon ls-icon-neg"></i>';
    const ph   = pos ? 'При каких условиях растёт...' : 'При каких условиях падает...';
    html += `<div class="ls-card ${cls}" data-idx="${i}">
      <div class="ls-heart-box">${icon}<input type="number" class="ls-delta-input ls-num-input" value="${c.delta}" data-idx="${i}" style="width:56px;font-weight:600;"></div>
      <textarea class="ls-change-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="${ph}">${escHtml(c.description)}</textarea>
      <button class="ls-del-change menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
    </div>`;
  });
  html += '<button id="ls-add-change" class="menu_button ls-add-btn"><i class="fa-solid fa-plus"></i> Добавить правило</button>';
  ct.innerHTML = html; bindChangesEv();
}

export function renderInterps() {
  const ct = document.getElementById('ls-interp-container'); if (!ct) return;
  const d = loveData(), arr = d.scaleInterpretations || []; let html = '';
  arr.forEach((ip, i) => {
    const act = d.score >= ip.min && d.score <= ip.max, isNeg = ip.max < 0;
    const bst = act ? (isNeg ? 'border-color:rgba(80,200,0,.7);' : 'border-color:rgba(180,100,120,.6);') : '';
    const cls = isNeg ? 'ls-card-neg' : 'ls-card-neu';
    const lbl = act ? '▶ активно' : (isNeg ? '<i class="fa-solid fa-skull"></i> негатив' : 'диапазон');
    html += `<div class="ls-card ${cls}" data-idx="${i}" style="${bst}">
      <div class="ls-range-box"><span class="ls-range-label">${lbl}</span>
        <div class="ls-range-inner">
          <input type="number" class="ls-interp-min ls-range-input" value="${ip.min}" data-idx="${i}">
          <span class="ls-range-sep">—</span>
          <input type="number" class="ls-interp-max ls-range-input" value="${ip.max}" data-idx="${i}">
        </div>
      </div>
      <textarea class="ls-interp-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="Описание поведения...">${escHtml(ip.description)}</textarea>
      <button class="ls-del-interp menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
    </div>`;
  });
  html += '<button id="ls-add-interp" class="menu_button ls-add-btn"><i class="fa-solid fa-plus"></i> Добавить диапазон</button>';
  ct.innerHTML = html;
  const act = getActiveInterp(), box = document.getElementById('ls-active-state'), txt = document.getElementById('ls-active-text');
  if (box && txt) { if (act?.description?.trim()) { txt.textContent = act.description.trim(); box.style.display = 'block'; } else box.style.display = 'none'; }
  bindInterpEv();
}

export function renderMilestones() {
  const ct = document.getElementById('ls-milestones-container'); if (!ct) return;
  const d = loveData(), arr = d.milestones || []; let html = '';
  arr.forEach((m, i) => {
    const reached = d.score >= m.threshold, dc = m.done ? ' ls-done' : '';
    const rs = reached && !m.done ? 'border-color:rgba(200,160,80,.65);' : '';
    const st = m.done ? 'выполнено' : (reached ? 'пора!' : 'ждёт'), sc = (!m.done && reached) ? ' ls-status-due' : '';
    html += `<div class="ls-card ls-card-milestone${dc}" data-idx="${i}" style="${rs}">
      <div class="ls-milestone-left">
        <div class="ls-milestone-threshold-wrap">
          <span class="ls-milestone-threshold-label">от</span>
          <input type="number" class="ls-milestone-thr-input ls-num-input" value="${m.threshold}" data-idx="${i}" min="0" style="width:56px;">
        </div>
        <input type="checkbox" class="ls-milestone-done-cb" data-idx="${i}" ${m.done ? 'checked' : ''}>
        <span class="ls-milestone-status${sc}">${st}</span>
      </div>
      <textarea class="ls-milestone-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="Что должен сделать персонаж...">${escHtml(m.description)}</textarea>
      <button class="ls-del-milestone menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
    </div>`;
  });
  html += '<button id="ls-add-milestone" class="menu_button ls-add-btn"><i class="fa-solid fa-plus"></i> Добавить событие</button>';
  ct.innerHTML = html; bindMilestonesEv();
}

// ─── Привязка событий форм ────────────────────────────────────────────────────
function bindChangesEv() {
  $('.ls-delta-input').off('change').on('change', function() { loveData().scoreChanges[+$(this).data('idx')].delta = parseInt(this.value)||0; saveSettingsDebounced(); updatePromptInjection(); renderChanges(); });
  $('.ls-change-desc').off('input').on('input',  function() { loveData().scoreChanges[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-del-change').off('click').on('click',   function() { loveData().scoreChanges.splice(+$(this).data('idx'),1); saveSettingsDebounced(); updatePromptInjection(); renderChanges(); });
  $('#ls-add-change').off('click').on('click',   () => { loveData().scoreChanges.push({delta:1,description:''}); saveSettingsDebounced(); renderChanges(); });
}
function bindInterpEv() {
  $('.ls-interp-min').off('change').on('change',  function() { loveData().scaleInterpretations[+$(this).data('idx')].min = parseInt(this.value)||0; saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
  $('.ls-interp-max').off('change').on('change',  function() { loveData().scaleInterpretations[+$(this).data('idx')].max = parseInt(this.value)||0; saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
  $('.ls-interp-desc').off('input').on('input',   function() { loveData().scaleInterpretations[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-del-interp').off('click').on('click',    function() { loveData().scaleInterpretations.splice(+$(this).data('idx'),1); saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
  $('#ls-add-interp').off('click').on('click',    () => { const a=loveData().scaleInterpretations, lm=a[a.length-1]?.max??0; a.push({min:lm+1,max:lm+10,description:''}); saveSettingsDebounced(); renderInterps(); });
}
function bindMilestonesEv() {
  $('.ls-milestone-thr-input').off('change').on('change', function() { loveData().milestones[+$(this).data('idx')].threshold = parseInt(this.value)||0; saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
  $('.ls-milestone-done-cb').off('change').on('change',   function() { loveData().milestones[+$(this).data('idx')].done = this.checked; saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
  $('.ls-milestone-desc').off('input').on('input',        function() { loveData().milestones[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-del-milestone').off('click').on('click',         function() { loveData().milestones.splice(+$(this).data('idx'),1); saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
  $('#ls-add-milestone').off('click').on('click', () => { const a=loveData().milestones, l=a[a.length-1]?.threshold??0; a.push({threshold:l+10,description:'',done:false}); saveSettingsDebounced(); renderMilestones(); });
  $('#ls-milestone-reset-all').off('click').on('click', () => { loveData().milestones.forEach(m => m.done = false); saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); toast('info','Все события сброшены'); });
}

// ─── Отладка ──────────────────────────────────────────────────────────────────
export function renderDebug() {
  const ct = document.getElementById('ls-debug-content'); if (!ct) return;
  const c = cfg(), d = chatLoveData();
  const npcs    = d.groupNpcs || [];
  const rt      = RELATION_TYPES[d.relationType||'neutral'] || RELATION_TYPES.neutral;
  const interp  = getActiveInterp();
  const pending = (d.milestones||[]).filter(m => !m.done && d.score >= m.threshold);
  const prompt  = cfg().isEnabled ? buildPrompt() : '(расширение отключено)';
  const msgCtr  = c._autoSuggestMsgCounter || 0, interval = c.autoSuggestInterval || 20;

  const statHTML = `<div class="ls-debug-block">
    <div class="ls-debug-label"><i class="fa-solid fa-gauge-high"></i> Текущее состояние</div>
    <div class="ls-debug-stat-grid">
      <div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:${rt.color};">${d.score} / ${d.maxScore}</span><span class="ls-debug-stat-key">Love Score</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:${rt.color};">${escHtml(rt.label)}</span><span class="ls-debug-stat-key">Тип отношений</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${escHtml(interp?.description?.slice(0,30)||'—')}</span><span class="ls-debug-stat-key">Активный диапазон</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${pending.length}</span><span class="ls-debug-stat-key">Событий в очереди</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${c.autoSuggestEnabled?msgCtr+' / '+interval:'выкл'}</span><span class="ls-debug-stat-key">Авто-реген</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${c.gradualProgression?'±2':'без огр.'}</span><span class="ls-debug-stat-key">SlowBurn</span></div>
    </div>
  </div>`;

  let npcHTML = '';
  if (c.groupMode && npcs.length) {
    const rows = npcs.map(n => {
      const nrt = RELATION_TYPES[n.relationType||'neutral'] || RELATION_TYPES.neutral;
      return `<div class="ls-debug-npc-row">
        <span class="ls-debug-npc-name">${escHtml(n.name)}${n.nameEn&&n.nameEn!==n.name?' <span style="opacity:.4;font-size:10px;">('+escHtml(n.nameEn)+')</span>':''}</span>
        <span class="ls-debug-npc-rt" style="color:${nrt.color};">${escHtml(nrt.label)}</span>
        <span class="ls-debug-npc-score" style="color:${n.score<0?'#4ec900':nrt.color};">${n.score}/${n.maxScore}</span>
      </div>`;
    }).join('');
    npcHTML = `<div class="ls-debug-block"><div class="ls-debug-label"><i class="fa-solid fa-users"></i> Окружение (${npcs.length} NPC)</div><div class="ls-debug-npc-state">${rows}</div></div>`;
  } else if (c.groupMode) {
    npcHTML = `<div class="ls-debug-block"><div class="ls-debug-label"><i class="fa-solid fa-users"></i> Окружение</div><div style="font-size:11px;opacity:.3;padding:4px;">Нет NPC в текущем чате</div></div>`;
  }

  const tagsHTML = `<div class="ls-debug-block">
    <div class="ls-debug-label"><i class="fa-solid fa-tags"></i> Теги в ответах AI <button class="menu_button ls-debug-copy" id="ls-debug-copy-tags" title="Скопировать"><i class="fa-solid fa-copy"></i></button></div>
    <pre id="ls-debug-tags-text" style="font-size:10px;line-height:1.8;padding:8px;background:rgba(0,0,0,.3);border-radius:5px;border:1px solid rgba(255,255,255,.06);overflow-x:auto;color:rgba(160,220,255,.85);">${escHtml(
      '<!-- [LOVE_SCORE:X] -->              — обновить счёт главного героя\n'
      +'<!-- [RELATION_TYPE:key] -->          — установить тип отношений\n'
      +'<!-- [MILESTONE:threshold] -->        — отметить романтическое событие выполненным\n'
      +(c.groupMode&&npcs.length?'\n=== NPC Окружение ===\n'+'<!-- [NPC_SCORE:EnName:X] -->         — обновить счёт NPC\n'+'<!-- [NPC_TYPE:EnName:key] -->         — установить тип отношений NPC\n'+'\nДоступные типы: '+Object.keys(RELATION_TYPES).join(' | '):'')
    )}</pre>
  </div>`;

  const promptHTML = `<div class="ls-debug-block">
    <div class="ls-debug-label"><i class="fa-solid fa-code"></i> Текущий промпт-инжект <button class="menu_button ls-debug-copy" id="ls-debug-copy-prompt" title="Скопировать всё"><i class="fa-solid fa-copy"></i></button></div>
    <textarea id="ls-debug-prompt" readonly>${escHtml(prompt)}</textarea>
  </div>`;

  ct.innerHTML = statHTML + npcHTML + tagsHTML + promptHTML;
  document.getElementById('ls-debug-copy-prompt')?.addEventListener('click', () => { navigator.clipboard?.writeText(prompt).then(() => toast('success','Промпт скопирован')).catch(()=>{}); });
  document.getElementById('ls-debug-copy-tags')?.addEventListener('click', () => {
    const tagsEl = document.getElementById('ls-debug-tags-text');
    navigator.clipboard?.writeText(tagsEl?.textContent||'').then(() => toast('success','Теги скопированы')).catch(()=>{});
  });
}

// ─── Синхронизация UI ─────────────────────────────────────────────────────────
export function syncUI() {
  const c = cfg(), d = loveData(), el = id => document.getElementById(id);
  const cb = el('ls-enabled'); if (cb) cb.checked = c.isEnabled;
  const v  = el('ls-val');     if (v)  v.value = d.score;
  const m  = el('ls-max');     if (m)  m.value = d.maxScore;
  const gr = el('ls-gradual'); if (gr) gr.checked = c.gradualProgression ?? true;
  const sz = el('ls-size'), lb = el('ls-size-label'); if (sz) { sz.value = c.widgetSize||64; if(lb) lb.textContent=(c.widgetSize||64)+'px'; }
  const rRu = el('ls-lang-ru'), rEn = el('ls-lang-en'), lang = c.genLang||'ru';
  if (rRu) rRu.checked = lang === 'ru'; if (rEn) rEn.checked = lang === 'en';
  const nt = el('ls-gen-notes'); if (nt && document.activeElement !== nt) nt.value = c.genUserNotes||'';
  const sc = c.genScope || defaultSettings.genScope;
  const scMap = {'ls-scope-changes':'changes','ls-scope-pos-ranges':'positiveRanges','ls-scope-neg-ranges':'negativeRanges','ls-scope-milestones':'milestones','ls-scope-max':'suggestedMax'};
  Object.entries(scMap).forEach(([id,key]) => { const e=el(id); if(e) e.checked=sc[key]??true; });
  const _rtd = d.relationType || 'neutral';
  document.querySelectorAll('.ls-rel-type-btn').forEach(b => b.classList.toggle('ls-rt-active', b.dataset.rt === _rtd));
  const _rtlbl = el('ls-rt-label'); if (_rtlbl) _rtlbl.textContent = RELATION_TYPES[_rtd]?.label || '';
  const hsStyle = c.heartStyle || 'svg';
  document.querySelectorAll('input[name="ls-heart-style"]').forEach(r => r.checked = (r.value === hsStyle));
  const asEn = el('ls-autosuggest-enabled');  if (asEn)  asEn.checked = c.autoSuggestEnabled || false;
  const asInt = el('ls-autosuggest-interval'); if (asInt) asInt.value = c.autoSuggestInterval || 20;
  const asProg = el('ls-autosuggest-progress');
  if (asProg) {
    if (c.autoSuggestEnabled) {
      const _cnt = c._autoSuggestMsgCounter||0, _intv = c.autoSuggestInterval||20;
      asProg.textContent = _cnt > 0 ? ('Прогресс: '+_cnt+' / '+_intv+' сообщений') : 'Счётчик сброшен — жду следующих сообщений';
    } else { asProg.textContent = ''; }
  }
  updateCharPreview(getCurrentCharacterCard());
  renderChanges(); renderInterps(); renderMilestones(); renderScoreLog(); renderPresets();
  if (cfg().groupMode) renderGroupNpcs();
  _updateGenLbCounter(); _syncSourceCards();
  refreshWidget();
}

// ─── Основные события ─────────────────────────────────────────────────────────
export function bindMainEvents() {
  $('#ls-enabled').off('change').on('change', function() { cfg().isEnabled=this.checked; cfg()._savedEnabled=this.checked; saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); });
  $('#ls-val').off('change').on('change', function() {
    const d=loveData(),prev=d.score; d.score=Math.max(MIN_SCORE,Math.min(parseInt(this.value)||0,d.maxScore));
    const delta=d.score-prev; if(delta!==0){addToLog(d,delta,'вручную');renderScoreLog();}
    saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); renderInterps(); renderMilestones();
  });
  $('#ls-max').off('change').on('change', function() {
    const d=loveData(),c=cfg(); d.maxScore=Math.max(1,parseInt(this.value)||100); c.maxScore=d.maxScore;
    if(d.score>d.maxScore) d.score=d.maxScore; saveSettingsDebounced(); updatePromptInjection(); refreshWidget();
  });
  $('#ls-reset-btn').off('click').on('click', () => { loveData().score=0; saveSettingsDebounced(); pulseWidget(); syncUI(); updatePromptInjection(); });
  $('#ls-gradual').off('change').on('change', function() { cfg().gradualProgression=this.checked; saveSettingsDebounced(); updatePromptInjection(); });
  $(document).off('click','#ls-log-clear').on('click','#ls-log-clear', () => { loveData().scoreLog=[]; saveSettingsDebounced(); renderScoreLog(); });
  $(document).off('input','#ls-size').on('input','#ls-size', function() {
    const sz=parseInt(this.value), lb=document.getElementById('ls-size-label'); if(lb) lb.textContent=sz+'px';
    applyWidgetSize(sz); cfg().widgetSize=sz; saveSettingsDebounced(); refreshWidget();
  });
  $(document).off('click','#ls-reset-pos').on('click','#ls-reset-pos', () => {
    cfg().widgetPos=null; saveSettingsDebounced();
    const w=document.getElementById('ls-widget'); if(w){w.style.top='100px';w.style.bottom='auto';w.style.left='18px';w.style.right='auto';}
    toast('info','Позиция сброшена');
  });
  $(document).off('change','input[name="ls-heart-style"]').on('change','input[name="ls-heart-style"]', function() {
    cfg().heartStyle=this.value; saveSettingsDebounced(); refreshWidget();
    toast('info', this.value==='blur'?'Размытое сердце':'SVG сердце с заливкой');
  });
  $(document).off('click','.ls-rel-type-btn').on('click','.ls-rel-type-btn', function() {
    const k=this.dataset.rt, t=RELATION_TYPES[k], info=document.getElementById('ls-type-info');
    if(!info||!t) return;
    if(info.dataset.showing===k){info.style.display='none';info.dataset.showing='';return;}
    info.dataset.showing=k;
    const isActive=loveData().relationType===k;
    info.innerHTML=`<span style="color:${t.color};font-weight:600;">${escHtml(t.label)}</span> — <span style="opacity:.7;">${escHtml(t.desc)}</span>`
      +(isActive?'<div style="font-size:10px;opacity:.4;margin-top:4px;">Текущий тип</div>'
        :`<button class="menu_button" style="margin-top:6px;width:100%;font-size:11px;" id="ls-set-rt" data-rt="${k}"><i class="fa-solid fa-check" style="margin-right:4px;"></i>Применить</button>`);
    info.style.display='block';
    document.getElementById('ls-set-rt')?.addEventListener('click', function() {
      const d=loveData(), wasHostile=d.relationType==='hostile';
      d.relationType=this.dataset.rt;
      saveSettingsDebounced(); updatePromptInjection();
      const isHostile=this.dataset.rt==='hostile';
      if(wasHostile!==isHostile) flipWidget(); else pulseWidget();
      syncUI(); toast('success','Тип: '+RELATION_TYPES[this.dataset.rt]?.label);
    });
  });
  // AI events
  $(document).off('input','#ls-gen-endpoint').on('input','#ls-gen-endpoint', function(){cfg().genEndpoint=this.value;saveSettingsDebounced();});
  $(document).off('input','#ls-gen-apikey').on('input','#ls-gen-apikey', function(){cfg().genApiKey=this.value;saveSettingsDebounced();});
  $(document).off('input','#ls-gen-notes').on('input','#ls-gen-notes', function(){cfg().genUserNotes=this.value;saveSettingsDebounced();});
  $(document).off('change','#ls-gen-model-select').on('change','#ls-gen-model-select', function(){cfg().genModel=this.value;saveSettingsDebounced();});
  $(document).off('change','input[name=ls-lang]').on('change','input[name=ls-lang]', function(){cfg().genLang=this.value;saveSettingsDebounced();});
  const scMap={'#ls-scope-changes':'changes','#ls-scope-pos-ranges':'positiveRanges','#ls-scope-neg-ranges':'negativeRanges','#ls-scope-milestones':'milestones','#ls-scope-max':'suggestedMax'};
  Object.entries(scMap).forEach(([sel,key]) => {
    $(document).off('change',sel).on('change',sel, function() { if(!cfg().genScope) cfg().genScope={...defaultSettings.genScope}; cfg().genScope[key]=this.checked; saveSettingsDebounced(); });
  });
  $(document).off('click','#ls-refresh-models').on('click','#ls-refresh-models', onRefreshModels);
  $(document).off('click','#ls-gen-btn').on('click','#ls-gen-btn', () => onGenerateClick(syncUI));
  $(document).off('change','#ls-gen-msg-count').on('change','#ls-gen-msg-count', function(){cfg().chatAnalysisMsgCount=parseInt(this.value)||0;saveSettingsDebounced();});
  $(document).off('click','#ls-analyze-btn').on('click','#ls-analyze-btn', () => onAnalyzeClick(syncUI, renderScoreLog, renderMilestones));
  $(document).off('change','#ls-gen-use-card').on('change','#ls-gen-use-card', function(){ cfg().genUseCard=this.checked; saveSettingsDebounced(); _syncSourceCards(); toast('info', this.checked?'Карточка включена':'Карточка отключена'); });
  $(document).off('click','#ls-src-lb-label').on('click','#ls-src-lb-label', function(ev){
    ev.preventDefault();
    const panel=document.getElementById('ls-gen-lb-panel'); if(!panel) return;
    const isOpen=panel.style.display!=='none';
    if(isOpen){panel.style.display='none';this.classList.remove('ls-source-card-open');}
    else{panel.style.display='block';this.classList.add('ls-source-card-open');renderGenLorebookPicker();}
  });
  $(document).off('click','#ls-gen-lb-close').on('click','#ls-gen-lb-close', function(){
    const panel=document.getElementById('ls-gen-lb-panel'),lbLbl=document.getElementById('ls-src-lb-label');
    if(panel) panel.style.display='none'; if(lbLbl) lbLbl.classList.remove('ls-source-card-open');
  });
  $(document).off('click','#ls-gen-lb-refresh').on('click','#ls-gen-lb-refresh', function(){renderGenLorebookPicker();toast('info','Список обновлён');});
  $(document).off('change','#ls-autosuggest-enabled').on('change','#ls-autosuggest-enabled', function(){
    cfg().autoSuggestEnabled=this.checked; cfg()._autoSuggestMsgCounter=0; saveSettingsDebounced();
    toast('info', this.checked?'Авто-регенерация включена':'Авто-регенерация выключена');
  });
  $(document).off('change','#ls-autosuggest-interval').on('change','#ls-autosuggest-interval', function(){cfg().autoSuggestInterval=Math.max(5,parseInt(this.value)||20);saveSettingsDebounced();});
  $(document).off('click','#ls-autosuggest-now').on('click','#ls-autosuggest-now', () => {
    const btn=document.getElementById('ls-autosuggest-now');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>';}
    autoRegenAll(syncUI).finally(()=>{if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-rotate"></i>';}});
  });
  // Пресеты
  $(document).off('click','#ls-preset-save').on('click','#ls-preset-save', () => { const inp=document.getElementById('ls-preset-name-input'); savePreset(inp?.value||''); if(inp) inp.value=''; renderPresets(); });
  $(document).off('click','#ls-preset-import-file-btn').on('click','#ls-preset-import-file-btn', () => { document.getElementById('ls-preset-file-input')?.click(); });
  $(document).off('change','#ls-preset-file-input').on('change','#ls-preset-file-input', function() {
    const file=this.files?.[0]; if(!file) return;
    const reader=new FileReader(); reader.onload=e=>{ importPresetFromJSON(e.target.result); this.value=''; renderPresets(); }; reader.readAsText(file,'utf-8');
  });
  // Окружение NPC
  $(document).off('change','#ls-group-enabled').on('change','#ls-group-enabled', function(){
    cfg().groupMode=this.checked; saveSettingsDebounced(); updatePromptInjection();
    const body=document.getElementById('ls-group-body'); if(body){body.style.display=this.checked?'':'none';}
    if(this.checked) renderGroupNpcs();
    toast('info', this.checked?'Режим окружения включён':'Режим окружения выключен');
  });
  $(document).off('click','#ls-npc-from-lorebook').on('click','#ls-npc-from-lorebook', function(){
    const panel=document.getElementById('ls-lorebook-picker'); if(!panel) return;
    const isOpen=panel.style.display!=='none';
    if(isOpen){panel.style.display='none';return;}
    panel.style.display='block'; renderLorebookPicker();
  });
  $(document).off('click','#ls-lb-close').on('click','#ls-lb-close', function(){ const panel=document.getElementById('ls-lorebook-picker'); if(panel) panel.style.display='none'; });
  $(document).off('click','#ls-npc-add-manual').on('click','#ls-npc-add-manual', function(){
    const d=chatLoveData(); if(!d.groupNpcs) d.groupNpcs=[];
    d.groupNpcs.push(mkNpc({name:'Новый NPC'}));
    saveGroupNpcs(); renderGroupNpcs();
  });
  $(document).off('click','#ls-npc-scan-chat').on('click','#ls-npc-scan-chat', function(){ scanChatForNpcs(); });
  $(document).off('click','#ls-acc-group .inline-drawer-toggle').on('click','#ls-acc-group .inline-drawer-toggle', function(){ setTimeout(()=>{ if(cfg().groupMode) renderGroupNpcs(); },50); });
  $(document).off('click','#ls-acc-debug .inline-drawer-toggle').on('click','#ls-acc-debug .inline-drawer-toggle', function(){ setTimeout(renderDebug, 80); });
  $(document).off('click','#ls-debug-refresh-btn').on('click','#ls-debug-refresh-btn', renderDebug);
}
