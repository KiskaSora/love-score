import { saveSettingsDebounced } from '../../../../script.js';
import { cfg, loveData, chatLoveData, MIN_SCORE, RELATION_TYPES, defaultSettings, escHtml, getActiveInterp, toast, addToLog, roundScore, fmtScore, addScar, getActiveScars, getScoreHistory, getCurrentRoute } from './config.js';
import { refreshWidget, pulseWidget, flipWidget, applyWidgetSize, _h2r } from './heart.js';
import { updatePromptInjection, buildPrompt }            from './prompt.js';
import { savePreset, importPresetFromJSON, exportPresetJSON, deletePreset, loadPresetUI, autoSnapshot } from './state.js';
import { renderGroupNpcs, renderGenLorebookPicker, _syncSourceCards, _updateGenLbCounter, onGenerateClick, onGenerateEventsClick, onGenerateRoutesClick, onAnalyzeClick, onRefreshModels, autoRegenAll, showAutoRegenStatus, scanChatForNpcs, renderLorebookPicker, mkNpc, saveGroupNpcs, getCurrentCharacterCard, updateCharPreview, _getValidLbIds } from './ai.js';
import { observeTree, tr } from './i18n.js';

// ─── Стили ────────────────────────────────────────────────────────────────────
export function injectStyles() {
  if (document.getElementById('ls-styles')) return;
  const el = document.createElement('style');
  el.id = 'ls-styles';
  el.textContent = `
/* ── Wand-menu popup ── */
.ls-wand-item{display:flex;align-items:center;gap:10px;cursor:pointer;}
.ls-wand-item .fa-heart{color:#ff4466;}
.ls-popup-root{text-align:left;max-width:100%;}
.ls-popup-title{font-size:18px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;}
.ls-panel-inner{display:flex;flex-direction:column;gap:6px;}
/* Попап Love Score: широкий на ПК, на всю ширину на мобилке */
.ls-popup-wide.popup{--ls-popup-w:min(680px,92vw);width:var(--ls-popup-w)!important;max-width:96vw!important;margin-inline:auto;}
.ls-popup-wide .popup-content{width:100%;max-width:100%;max-height:78vh;overflow-y:auto;box-sizing:border-box;}
.ls-popup-wide .popup-body{width:100%;}
@media (max-width:600px){
  .ls-popup-wide.popup{--ls-popup-w:97vw;}
  .ls-popup-wide .popup-content{max-height:82vh;}
  .ls-popup-title{font-size:16px;}
}
.ls-fallback-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto;}
.ls-fallback-modal{position:relative;background:var(--SmartThemeBlurTintColor,#1e1e22);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px;width:min(680px,94vw);box-shadow:0 12px 48px rgba(0,0,0,.5);}
.ls-fallback-close{position:sticky;top:0;float:right;margin-bottom:6px;}
@media (max-width:600px){ .ls-fallback-modal{width:97vw;padding:12px;} }
/* ── Trend arrow & sparkline ── */
.ls-trend-arrow{
  position:absolute;top:-5%;right:2%;
  display:flex;align-items:center;justify-content:center;
  pointer-events:none;z-index:3;
  filter:drop-shadow(0 0 4px var(--ls-trend-col,#69d66b)) drop-shadow(0 1px 1.5px rgba(0,0,0,.55));
}
.ls-trend-arrow svg{width:100%;height:100%;display:block;overflow:visible;}
.ls-trend-arrow svg path{fill:var(--ls-trend-col,#69d66b);stroke:var(--ls-trend-col,#69d66b);}
.ls-trend-arrow svg rect{fill:var(--ls-trend-col,#69d66b);}
.ls-trend-inner{display:flex;width:100%;height:100%;animation:ls-trend-pop .5s cubic-bezier(.34,1.56,.64,1) both;}
.ls-trend-up .ls-trend-inner{animation:ls-trend-pop .5s cubic-bezier(.34,1.56,.64,1) both,ls-trend-bob-up 2.6s ease-in-out .5s infinite;}
.ls-trend-down .ls-trend-inner{animation:ls-trend-pop .5s cubic-bezier(.34,1.56,.64,1) both,ls-trend-bob-down 2.6s ease-in-out .5s infinite;}
@keyframes ls-trend-pop{0%{transform:scale(0)}100%{transform:scale(1)}}
@keyframes ls-trend-bob-up{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes ls-trend-bob-down{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}
#ls-sparkline-section{margin:6px 0 2px;}
#ls-sparkline{padding:2px 2px 0;}
.ls-sparkline-label{font-size:10px;opacity:.4;letter-spacing:.5px;text-transform:uppercase;margin-bottom:2px;}
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
#ls-widget.ls-show-tip #ls-status-tip, #ls-widget.ls-show-tip .ls-tip{opacity:1;}
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
.ls-textarea-field{flex:1;min-width:140px;resize:vertical;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.1));border-radius:4px;color:var(--SmartThemeBodyColor,#eee);padding:6px 8px;font-family:inherit;font-size:12px;line-height:1.55;box-sizing:border-box;min-height:72px;transition:border-color .15s;}
.ls-textarea-field:focus{outline:none;border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35));}
.ls-card{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin-bottom:6px;padding:8px;border-radius:6px;border:1px solid var(--border-color,rgba(255,255,255,.08));}
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
.ls-gen-events-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:4px 0 2px;}
#ls-active-state{margin-bottom:8px;padding:8px 10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.03));border:1px solid var(--border-color,rgba(255,255,255,.1));font-size:12px;line-height:1.55;color:var(--SmartThemeBodyColor,#ccc);}
#ls-active-state strong{opacity:.7;}
input[type=range].ls-size-slider{flex:1;accent-color:var(--SmartThemeBodyColor,#aaa);}
.ls-rel-type-row{display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:4px 0;flex-wrap:nowrap;}
.ls-rel-type-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;font-size:16px;cursor:pointer;opacity:.25;transition:opacity .15s,filter .15s,transform .15s;user-select:none;flex-shrink:0;}
.ls-rel-type-btn:hover{transform:translateY(-1px);}
.ls-rel-type-btn:hover{opacity:.6;}
.ls-rel-type-btn.ls-rt-active{opacity:1;filter:drop-shadow(0 2px 8px currentColor);}
#ls-type-info{display:none;font-size:11px;line-height:1.55;padding:7px 10px;border-radius:6px;background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--border-color,rgba(255,255,255,.1));color:var(--SmartThemeBodyColor,#ccc);margin-bottom:6px;}
.ls-rt-neutral{color:#c0c0c0}.ls-rt-romance{color:#ff2d55}.ls-rt-friendship{color:#ff9d2e}.ls-rt-family{color:#f0c000}.ls-rt-platonic{color:#00c49a}.ls-rt-rival{color:#2979ff}.ls-rt-obsession{color:#a855f7}.ls-rt-hostile{color:#2e8b00}
.ls-rel-type-label{font-size:11px;opacity:.45;color:var(--SmartThemeBodyColor,#aaa);margin-left:4px;min-width:70px;}
/* ── Кастомный селектор типа отношений ── */
.ls-rt-select{position:relative;display:inline-block;min-width:150px;}
.ls-rt-select.ls-rt-grow{flex:1;min-width:140px;}
.ls-rt-trigger{display:flex;align-items:center;gap:8px;width:100%;cursor:pointer;box-sizing:border-box;
  background:var(--input-background-fill,rgba(255,255,255,.04));border:1px solid var(--rt-col,rgba(255,255,255,.14));
  border-radius:6px;padding:5px 9px;font-size:12.5px;color:var(--SmartThemeBodyColor,#eee);
  transition:border-color .15s,box-shadow .15s,background .15s;text-align:left;}
.ls-rt-trigger:hover{border-color:var(--rt-col,rgba(255,255,255,.3));background:rgba(255,255,255,.06);}
.ls-rt-select.ls-rt-open .ls-rt-trigger{border-color:var(--rt-col,rgba(255,255,255,.4));box-shadow:0 0 0 2px color-mix(in srgb,var(--rt-col,#888) 22%,transparent);}
.ls-rt-trigger .ls-rt-ic{color:var(--rt-col,#aaa);font-size:14px;width:17px;text-align:center;flex-shrink:0;filter:drop-shadow(0 1px 3px color-mix(in srgb,var(--rt-col,#000) 45%,transparent));}
.ls-rt-trigger .ls-rt-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;}
.ls-rt-trigger .ls-rt-caret{font-size:10px;opacity:.45;transition:transform .18s;flex-shrink:0;}
.ls-rt-select.ls-rt-open .ls-rt-caret{transform:rotate(180deg);opacity:.8;}
.ls-rt-menu{position:absolute;top:calc(100% + 5px);left:0;min-width:100%;width:max-content;max-width:260px;z-index:10005;
  background:var(--SmartThemeBlurTintColor,#1c1c20);border:1px solid rgba(255,255,255,.12);border-radius:8px;
  padding:4px;box-shadow:0 10px 34px rgba(0,0,0,.55);display:none;flex-direction:column;gap:1px;
  max-height:288px;overflow-y:auto;backdrop-filter:blur(14px);}
.ls-rt-select.ls-rt-up .ls-rt-menu{top:auto;bottom:calc(100% + 5px);}
.ls-rt-select.ls-rt-open .ls-rt-menu{display:flex;animation:ls-rt-pop .14s ease;}
@keyframes ls-rt-pop{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}
.ls-rt-opt{display:flex;align-items:center;gap:9px;padding:6px 9px;border-radius:5px;cursor:pointer;font-size:12.5px;
  color:var(--SmartThemeBodyColor,#ddd);transition:background .12s;white-space:nowrap;}
.ls-rt-opt:hover{background:color-mix(in srgb,var(--opt-col,#888) 18%,transparent);}
.ls-rt-opt .ls-rt-ic{color:var(--opt-col,#aaa);font-size:14px;width:17px;text-align:center;flex-shrink:0;}
.ls-rt-opt.ls-rt-sel{background:color-mix(in srgb,var(--opt-col,#888) 14%,transparent);font-weight:600;}
.ls-rt-opt.ls-rt-sel::after{content:"\\f00c";font-family:"Font Awesome 6 Free";font-weight:900;margin-left:auto;font-size:10px;color:var(--opt-col,#aaa);opacity:.85;}
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
.ls-log-reason{color:var(--SmartThemeBodyColor,#ccc);opacity:.7;line-height:1.4;flex:1;min-width:0;}
.ls-log-date{font-size:9px;opacity:.35;white-space:nowrap;margin-left:auto;padding-left:4px;}
.ls-log-clear{padding:2px 8px!important;min-width:unset!important;font-size:10px!important;opacity:.4;}
#ls-score-log{max-height:230px;overflow-y:auto;}
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
.ls-npc-rt-btn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;font-size:11px;cursor:pointer;opacity:.18;transition:opacity .15s,filter .15s;flex-shrink:0;border-radius:50%;}
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
.ls-npc-rival-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:6px 0 0;margin-top:5px;border-top:1px solid rgba(255,255,255,.05);}
.ls-npc-rival-toggle{display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;}
.ls-npc-rival-toggle input{cursor:pointer;accent-color:#e0795a;}
.ls-npc-pressure-wrap{display:flex;align-items:center;gap:5px;}
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
/* ── Дашборд-шапка ── */
.ls-dash{position:relative;display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(255,45,85,.12),rgba(168,85,247,.06));border:1px solid rgba(255,255,255,.08);}
.ls-dash-collapse{position:absolute;top:7px;right:8px;width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:rgba(255,255,255,.5);cursor:pointer;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0;transition:color .15s,background .15s;}
.ls-dash-collapse:hover{color:#fff;background:rgba(0,0,0,.45);}
.ls-dash-heart{position:relative;width:52px;height:48px;flex-shrink:0;filter:drop-shadow(0 4px 14px color-mix(in srgb,var(--ls-dash-col,#ff2d55) 45%,transparent));transition:width .25s,height .25s,filter .4s;}
.ls-dash-heart svg{width:100%;height:100%;display:block;}
.ls-dash-heart svg path{fill:var(--ls-dash-col,#ff2d55);transition:fill .4s;}
.ls-dash-score{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;}
.ls-dash-score .hh-num{font-size:16px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6);line-height:1;}
.ls-dash-score .hh-den{font-size:8.5px;color:rgba(255,255,255,.65);line-height:1;margin-top:1px;}
.ls-dash-trend{position:absolute;top:-3px;right:-5px;font-size:12px;filter:drop-shadow(0 0 5px currentColor);}
.ls-dash-info{flex:1;min-width:0;}
.ls-dash-title{font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.ls-dash-title .fa-heart{color:#ff4466;}
.ls-dash-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:20px;font-size:12px;font-weight:600;color:#ff2d55;background:color-mix(in srgb,currentColor 13%,transparent);border:1px solid color-mix(in srgb,currentColor 35%,transparent);}
.ls-dash-spark{flex-shrink:0;width:116px;height:38px;opacity:.85;}
.ls-dash-spark svg{width:100%;height:100%;overflow:visible;}
.ls-panel-inner.ls-collapsed .ls-dash{padding:7px 12px;gap:9px;}
.ls-panel-inner.ls-collapsed .ls-dash-heart{width:30px;height:28px;}
.ls-panel-inner.ls-collapsed .ls-dash-score .hh-num{font-size:11px;}
.ls-panel-inner.ls-collapsed .ls-dash-score .hh-den{display:none;}
.ls-panel-inner.ls-collapsed .ls-dash-title{font-size:14px;margin-bottom:0;}
.ls-panel-inner.ls-collapsed .ls-dash-chip,.ls-panel-inner.ls-collapsed .ls-dash-spark,.ls-panel-inner.ls-collapsed .ls-dash-trend{display:none;}
.ls-panel-inner.ls-collapsed .ls-dash-collapse i{transform:rotate(180deg);}
/* ── Вкладки ── */
.ls-nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:2px;}
.ls-nav::-webkit-scrollbar{display:none;height:0;}
.ls-nav-tab{display:flex;align-items:center;gap:7px;padding:9px 13px;cursor:pointer;font-size:12.5px;font-weight:600;color:rgba(255,255,255,.42);white-space:nowrap;border-bottom:2px solid transparent;transition:color .15s,border-color .15s,background .15s;border-radius:6px 6px 0 0;}
.ls-nav-tab i{font-size:13px;}
.ls-nav-tab:hover{color:rgba(255,255,255,.8);background:rgba(255,255,255,.03);}
.ls-nav-tab.active{color:#ff4466;border-bottom-color:#ff4466;}
.ls-tab-pane{display:none;}
.ls-tab-pane.active{display:block;animation:ls-fade .2s ease;}
@keyframes ls-fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
/* ── Карточки-модификаторы ── */
.ls-mod-grid{column-count:2;column-gap:9px;margin-bottom:4px;}
.ls-mod-card{position:relative;border:1.5px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02);transition:border-color .2s,background .2s,box-shadow .2s;overflow:hidden;break-inside:avoid;margin-bottom:9px;}
.ls-mod-card>.ls-mod-toggle{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}
.ls-mod-card:has(>.ls-mod-toggle:checked){border-color:var(--mc,rgba(255,68,102,.5));background:color-mix(in srgb,var(--mc,#ff4466) 7%,transparent);box-shadow:0 0 22px color-mix(in srgb,var(--mc,#ff4466) 9%,transparent) inset;}
.ls-mod-head{display:flex;align-items:flex-start;gap:10px;padding:13px 14px;cursor:pointer;margin:0;}
.ls-mod-ic{font-size:17px;opacity:.3;transition:.2s;flex-shrink:0;margin-top:1px;}
.ls-mod-card:has(>.ls-mod-toggle:checked) .ls-mod-ic{opacity:1;color:var(--mc);filter:drop-shadow(0 0 6px color-mix(in srgb,var(--mc) 50%,transparent));}
.ls-mod-txt{flex:1;min-width:0;}
.ls-mod-name{font-size:12.5px;font-weight:700;line-height:1.25;}
.ls-mod-card:has(>.ls-mod-toggle:checked) .ls-mod-name{color:var(--mc);}
.ls-mod-desc{font-size:10px;opacity:.4;line-height:1.45;margin-top:3px;}
.ls-switch{position:relative;width:34px;height:19px;border-radius:20px;background:rgba(255,255,255,.12);flex-shrink:0;transition:background .2s;margin-top:1px;}
.ls-mod-card:has(>.ls-mod-toggle:checked) .ls-switch{background:var(--mc);}
.ls-switch::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.4);}
.ls-mod-card:has(>.ls-mod-toggle:checked) .ls-switch::after{transform:translateX(15px);}
.ls-mod-body{margin:0 14px 13px;padding-top:11px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;}
.ls-mod-body .ls-row{margin-bottom:7px;}
.ls-mod-body .ls-row:last-child{margin-bottom:0;}
.ls-mod-body .ls-hint{margin-bottom:7px;}
@media (max-width:560px){.ls-mod-grid{column-count:1;} .ls-nav-tab span{display:none;} .ls-dash-spark{display:none;}}
/* ── Скроллбары под тему (вместо системного белого) ── */
.ls-popup-wide .popup-content,.ls-fallback-overlay,.ls-rt-menu,#ls-lorebook-picker,#ls-gen-lb-panel,#ls-debug-prompt,.ls-textarea-field{scrollbar-width:thin;scrollbar-color:rgba(255,68,102,.4) transparent;}
.ls-popup-wide .popup-content::-webkit-scrollbar,.ls-fallback-overlay::-webkit-scrollbar,.ls-rt-menu::-webkit-scrollbar,#ls-lorebook-picker::-webkit-scrollbar,#ls-gen-lb-panel::-webkit-scrollbar,#ls-debug-prompt::-webkit-scrollbar,.ls-textarea-field::-webkit-scrollbar{width:9px;height:9px;}
.ls-popup-wide .popup-content::-webkit-scrollbar-track,.ls-fallback-overlay::-webkit-scrollbar-track,.ls-rt-menu::-webkit-scrollbar-track,#ls-lorebook-picker::-webkit-scrollbar-track,#ls-gen-lb-panel::-webkit-scrollbar-track,#ls-debug-prompt::-webkit-scrollbar-track,.ls-textarea-field::-webkit-scrollbar-track{background:transparent;}
.ls-popup-wide .popup-content::-webkit-scrollbar-thumb,.ls-fallback-overlay::-webkit-scrollbar-thumb,.ls-rt-menu::-webkit-scrollbar-thumb,#ls-lorebook-picker::-webkit-scrollbar-thumb,#ls-gen-lb-panel::-webkit-scrollbar-thumb,#ls-debug-prompt::-webkit-scrollbar-thumb,.ls-textarea-field::-webkit-scrollbar-thumb{background:rgba(255,68,102,.32);border-radius:8px;border:2px solid transparent;background-clip:padding-box;}
.ls-popup-wide .popup-content::-webkit-scrollbar-thumb:hover,.ls-fallback-overlay::-webkit-scrollbar-thumb:hover,.ls-rt-menu::-webkit-scrollbar-thumb:hover,#ls-lorebook-picker::-webkit-scrollbar-thumb:hover,#ls-gen-lb-panel::-webkit-scrollbar-thumb:hover,#ls-debug-prompt::-webkit-scrollbar-thumb:hover,.ls-textarea-field::-webkit-scrollbar-thumb:hover{background:rgba(255,68,102,.55);background-clip:padding-box;}
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

// FA-иконка типа отношений
export function rtIcon(rt, extra = '') {
  const t = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
  return `<i class="fa-solid ${t.icon || 'fa-heart'}"${extra ? ' ' + extra : ''}></i>`;
}

// Кастомный селектор типа отношений (вместо нативного <select>).
// opts: { id, idx, auto, grow } — id/idx переносятся на скрытый input,
// change-событие которого слушают старые обработчики.
export function rtSelectHTML(curKey, opts = {}) {
  const { id = '', idx = null, auto = false, grow = false, inputCls = '' } = opts;
  const cur = (curKey && RELATION_TYPES[curKey]) ? RELATION_TYPES[curKey] : null;
  const curCol = cur ? cur.color : '#9a9a9a';
  const curIc  = cur ? `<i class="fa-solid ${cur.icon}"></i>` : '<i class="fa-solid fa-shuffle"></i>';
  const curLbl = cur ? cur.label : '— авто (по чату) —';
  const opt = (k, col, icHtml, lbl, sel) =>
    `<div class="ls-rt-opt${sel ? ' ls-rt-sel' : ''}" data-val="${k}" style="--opt-col:${col};"><span class="ls-rt-ic">${icHtml}</span><span>${escHtml(lbl)}</span></div>`;
  let menu = '';
  if (auto) menu += opt('', '#9a9a9a', '<i class="fa-solid fa-shuffle"></i>', '— авто (по чату) —', !curKey);
  Object.entries(RELATION_TYPES).filter(([k]) => k !== 'neutral')
    .forEach(([k, v]) => { menu += opt(k, v.color, `<i class="fa-solid ${v.icon}"></i>`, v.label, curKey === k); });
  const inputAttrs = `${id ? `id="${id}" ` : ''}${idx != null ? `data-idx="${idx}" ` : ''}`;
  return `<div class="ls-rt-select${grow ? ' ls-rt-grow' : ''}" style="--rt-col:${curCol};">
    <input type="hidden" class="ls-rt-value${inputCls ? ' ' + inputCls : ''}" ${inputAttrs}value="${curKey || ''}">
    <button type="button" class="ls-rt-trigger"><span class="ls-rt-ic">${curIc}</span><span class="ls-rt-name">${escHtml(curLbl)}</span><i class="fa-solid fa-chevron-down ls-rt-caret"></i></button>
    <div class="ls-rt-menu">${menu}</div>
  </div>`;
}

// ─── Панель настроек ──────────────────────────────────────────────────────────
export function settingsPanelHTML() {
  const c = cfg(), curModel = escHtml(c.genModel||''), curEndpoint = escHtml(c.genEndpoint||'');
  const curKey = escHtml(c.genApiKey||''), lang = c.genLang||'ru', curNotes = escHtml(c.genUserNotes||'');
  const sc  = c.genScope || defaultSettings.genScope;
  const chk = (id, val, label) => `<label class="ls-scope-item"><input type="checkbox" id="${id}"${val?' checked':''}> ${label}</label>`;
  const _curRt = loveData().relationType;
  const curGenRt = (_curRt && _curRt !== 'neutral') ? _curRt : '';
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

  // Карточка-модификатор: скрытый чекбокс (тот же id, что и раньше) + кликабельный заголовок-label.
  // Визуал вкл/выкл и раскрытие — через :has(:checked) в CSS; тело сохраняет свой id (управляется syncUI).
  const modCard = (id, col, icon, name, desc, on, body='') =>
    `<div class="ls-mod-card" style="--mc:${col};">
      <input type="checkbox" id="${id}" class="ls-mod-toggle"${on?' checked':''}>
      <label class="ls-mod-head" for="${id}">
        <i class="ls-mod-ic fa-solid ${icon}"></i>
        <div class="ls-mod-txt"><div class="ls-mod-name">${name}</div><div class="ls-mod-desc">${desc}</div></div>
        <span class="ls-switch"></span>
      </label>${body}
    </div>`;

  const hardcoreBody = `<div id="ls-hardcore-body" class="ls-mod-body" style="${c.hardcoreMode?'':'display:none;'}">
      <div class="ls-hint" style="opacity:.5;">Прирост обрезается, штрафы усилены, очки остывают при простое. Перекрывает SlowBurn.</div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Макс. прирост за ответ:</span>
        <input type="number" id="ls-hc-cap" class="ls-num-input" min="0.1" max="5" step="0.1" style="width:58px;">
      </div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Множитель штрафов:</span>
        <input type="number" id="ls-hc-negmult" class="ls-num-input" min="1" max="5" step="0.1" style="width:58px;">
        <span style="font-size:11px;opacity:.35;">× к минусам</span>
      </div>
      <div class="ls-row"><label class="checkbox_label" for="ls-hc-decay"><input type="checkbox" id="ls-hc-decay"><span>Decay — очки остывают при простое</span></label></div>
      <div id="ls-hc-decay-body" style="${c.hardcoreDecayEnabled?'':'display:none;'}">
        <div class="ls-row" style="gap:6px;">
          <span style="font-size:12px;opacity:.6;white-space:nowrap;">Остывать на</span>
          <input type="number" id="ls-hc-decay-step" class="ls-num-input" min="0.1" max="5" step="0.1" style="width:52px;">
          <span style="font-size:12px;opacity:.6;white-space:nowrap;">каждые</span>
          <input type="number" id="ls-hc-decay-int" class="ls-num-input" min="1" max="20" step="1" style="width:48px;">
          <span style="font-size:12px;opacity:.6;">ходов</span>
        </div>
      </div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Кулдаун прорыва:</span>
        <input type="number" id="ls-hc-bt-cd" class="ls-num-input" min="0" max="100" step="1" style="width:52px;">
        <span style="font-size:12px;opacity:.6;">сообщ.</span>
      </div>
    </div>`;

  const coldBody = `<div id="ls-coldstart-body" class="ls-mod-body" style="${c.coldStartEnabled?'':'display:none;'}">
      <div class="ls-hint" style="opacity:.5;">Стена недоверия в начале. Применяется к чатам без данных Love Score. Текущий чат не трогает.</div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Стартовый счёт:</span>
        <input type="number" id="ls-cs-score" class="ls-num-input" min="-100" max="0" step="1" style="width:62px;">
        <button id="ls-cs-apply" class="menu_button" style="white-space:nowrap;font-size:11px;" title="Сбросить текущий чат в стартовое значение">Применить к этому чату</button>
      </div>
    </div>`;

  const scarsBody = `<div id="ls-scars-settings-body" class="ls-mod-body" style="${c.scarsEnabled?'':'display:none;'}">
      <div class="ls-hint" style="opacity:.5;">Крупное падение оставляет шрам — персонаж помнит обиду даже после примирения. AI может отметить рану сам тегом [SCAR:…].</div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Шрам при падении на</span>
        <input type="number" id="ls-scar-threshold" class="ls-num-input" min="1" max="100" step="1" style="width:52px;">
        <span style="font-size:12px;opacity:.6;">и больше</span>
      </div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Заживает при +</span>
        <input type="number" id="ls-scar-heal" class="ls-num-input" min="0" max="200" step="1" style="width:52px;">
        <span style="font-size:12px;opacity:.6;">над точкой обиды</span>
        <span style="font-size:10px;opacity:.35;">0 = навсегда</span>
      </div>
    </div>`;

  const streakBody = `<div id="ls-streak-body" class="ls-mod-body" style="${c.streakEnabled!==false?'':'display:none;'}">
      <div class="ls-hint" style="opacity:.5;">Несколько положительных ответов подряд усиливают следующий прирост. В hardcore разово поднимают кап.</div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Серия от</span>
        <input type="number" id="ls-streak-needed" class="ls-num-input" min="2" max="10" step="1" style="width:48px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">плюсов · множитель ×</span>
        <input type="number" id="ls-streak-mult" class="ls-num-input" min="1" max="3" step="0.1" style="width:52px;">
      </div>
    </div>`;

  const momentumBody = `<div id="ls-momentum-body" class="ls-mod-body" style="${c.momentumEnabled!==false?'':'display:none;'}">
      <div class="ls-hint" style="opacity:.5;">После крупного изменения персонаж несколько ходов «под впечатлением». На счёт не влияет — только на отыгрыш.</div>
      <div class="ls-row" style="gap:6px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">Сдвиг от</span>
        <input type="number" id="ls-momentum-threshold" class="ls-num-input" min="1" max="50" step="1" style="width:48px;">
        <span style="font-size:12px;opacity:.6;white-space:nowrap;">держится</span>
        <input type="number" id="ls-momentum-turns" class="ls-num-input" min="1" max="10" step="1" style="width:48px;">
        <span style="font-size:12px;opacity:.6;">ходов</span>
      </div>
    </div>`;

  // ── Вкладка «Обзор»: живое состояние, история, шрамы ──
  const overviewContent = `
    <div class="ls-row"><label class="checkbox_label" for="ls-enabled"><input type="checkbox" id="ls-enabled"><span>Включено</span></label></div>
    <div class="ls-row">
      <span style="font-size:12px;opacity:.6;">Очки:</span>
      <input id="ls-val" type="number" step="any" class="ls-num-input" style="width:72px;">
      <span style="opacity:.3;">/</span>
      <input id="ls-max" type="number" min="1" class="ls-num-input" style="width:72px;">
      <button id="ls-reset-btn" class="menu_button">Сбросить</button>
    </div>
    <div class="ls-rel-type-row">
      ${Object.entries(RELATION_TYPES).map(([k,v]) => `<span class="ls-rel-type-btn ls-rt-${k}" data-rt="${k}" title="${v.label}">${rtIcon(k)}</span>`).join('')}
      <span class="ls-rel-type-label" id="ls-rt-label"></span>
    </div>
    <div id="ls-type-info"></div>
    <div id="ls-active-state" style="display:none;"><strong>Сейчас:</strong> <span id="ls-active-text"></span></div>
    <div id="ls-sparkline-section" style="display:none;">
      <div class="ls-sparkline-label">Динамика очков</div>
      <div id="ls-sparkline"></div>
    </div>
    <div class="ls-section-title" style="display:flex;align-items:center;justify-content:space-between;">История <button id="ls-log-clear" class="menu_button ls-log-clear">очистить</button></div>
    <div id="ls-score-log"></div>
    <div id="ls-scars-section" style="display:none;">
      <div class="ls-section-title"><i class="fa-solid fa-bandage" style="margin-right:6px;opacity:.7;"></i>Шрамы</div>
      <div class="ls-hint">Глубокие обиды, которые персонаж помнит даже после примирения.</div>
      <div class="ls-row" style="gap:6px;">
        <input type="text" id="ls-scar-add-input" class="ls-api-field" style="flex:1;" placeholder="Записать обиду вручную...">
        <button id="ls-scar-add-btn" class="menu_button" style="white-space:nowrap;">+ Шрам</button>
      </div>
      <div id="ls-scars-container"></div>
    </div>`;

  // ── Вкладка «Режимы»: модификаторы-карточки + вид/инжект ──
  const modesContent = `
    <div class="ls-section-title" style="margin-top:0;">Игровые модификаторы</div>
    <div class="ls-hint">Нажми на карточку, чтобы включить режим и раскрыть его настройки.</div>
    <div class="ls-mod-grid">
      ${modCard('ls-gradual','#7dd6c0','fa-gauge-high','SlowBurn','±2 макс за ответ — медленное сближение', (c.gradualProgression ?? true))}
      ${modCard('ls-hardcore','#ff5577','fa-skull','Hardcore','Сложно набрать, штрафы усилены', c.hardcoreMode, hardcoreBody)}
      ${modCard('ls-coldstart','#5b8fd6','fa-snowflake','Холодный старт','Новые чаты начинаются в минусе', c.coldStartEnabled, coldBody)}
      ${modCard('ls-scars-enabled','#c77d8f','fa-bandage','Шрамы','Память о крупных обидах', c.scarsEnabled, scarsBody)}
      ${modCard('ls-streak-enabled','#e8923a','fa-fire','Серия','Бонус за плюсы подряд', (c.streakEnabled!==false), streakBody)}
      ${modCard('ls-momentum-enabled','#9a7bd6','fa-water','Импульс','Эхо после крупного сдвига', (c.momentumEnabled!==false), momentumBody)}
    </div>
    <div class="ls-section-title">Вид и инжект</div>
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
    <div class="ls-row" style="gap:14px;">
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="checkbox" id="ls-show-trend"${c.showTrend!==false?' checked':''}> <span>Стрелка тренда</span></label>
      <label class="checkbox_label" style="margin:0;gap:5px;"><input type="checkbox" id="ls-show-sparkline"${c.showSparkline!==false?' checked':''}> <span>График истории</span></label>
    </div>
    <div class="ls-row"><label class="checkbox_label" for="ls-open-dblclick"><input type="checkbox" id="ls-open-dblclick"${c.openOnDblClick!==false?' checked':''}><span><i class="fa-solid fa-hand-pointer" style="margin-right:6px;opacity:.85;"></i>Двойной тап по сердечку открывает панель</span></label></div>
    <div class="ls-row" style="gap:6px;align-items:center;">
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">Тон инжекта:</span>
      <select id="ls-inject-tone" class="ls-num-input" style="width:auto;flex:1;max-width:180px;">
        <option value="strict">Строгие правила</option>
        <option value="hints">Подсказки</option>
        <option value="monologue">Внутренний монолог</option>
      </select>
    </div>
    <div class="ls-row"><label class="checkbox_label" for="ls-hide-rules"><input type="checkbox" id="ls-hide-rules"><span><i class="fa-solid fa-mask" style="margin-right:6px;opacity:.85;"></i>Скрытые правила (не показывать боту таблицу очков)</span></label></div>
    <div class="ls-row"><label class="checkbox_label" for="ls-score-reason"><input type="checkbox" id="ls-score-reason"><span><i class="fa-solid fa-comment-dots" style="margin-right:6px;opacity:.85;"></i>Обоснование в логе (AI пишет причину к счёту)</span></label></div>`;

  const rulesContent = `
    <div class="ls-section-title" style="margin-top:0;">Правила изменения</div>
    <div class="ls-hint">За что растут и падают очки.</div>
    <div id="ls-changes-container"></div>
    <div class="ls-section-title">Поведение по диапазонам</div>
    <div class="ls-hint">Описывай поведение для позитивных и негативных значений.</div>
    <div id="ls-interp-container"></div>
    <div class="ls-section-title">Романтические события</div>
    <div class="ls-hint">При достижении порога персонаж инициирует событие.</div>
    <div class="ls-gen-events-row">
      <button id="ls-gen-events-btn" class="menu_button"><i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать события</button>
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">до</span>
      <input type="number" id="ls-gen-events-max" class="ls-num-input" min="10" max="100000" step="10" value="${(loveData().maxScore)||100}" title="Верхний порог событий (поднимет максимум при необходимости)" style="width:84px;">
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">шт.</span>
      <input type="number" id="ls-gen-events-count" class="ls-num-input" min="0" max="40" step="1" value="8" title="Сколько событий сгенерировать (0 = на усмотрение ИИ)" style="width:56px;">
    </div>
    <div class="ls-hint" style="margin-top:2px;">Генерирует только события, растягивая пороги до указанного значения. Правила и диапазоны не трогаются. Источник берётся из вкладки AI.</div>
    <div id="ls-gen-events-status" style="font-size:11px;opacity:.6;margin:2px 0 6px;min-height:14px;"></div>
    <div class="ls-milestone-reset-row"><button id="ls-milestone-reset-all" class="menu_button">Сбросить все</button></div>
    <div id="ls-milestones-container"></div>
    <div class="ls-section-title" style="display:flex;align-items:center;gap:8px;"><span><i class="fa-solid fa-code-fork" style="margin-right:6px;opacity:.7;"></i>Маршруты</span> <label class="checkbox_label" style="margin:0 0 0 auto;gap:5px;font-weight:400;"><input type="checkbox" id="ls-routes-enabled"><span style="font-size:11px;opacity:.7;">вкл</span></label></div>
    <div class="ls-hint">Ветки развития по типу отношений. Активной становится та, чей тип совпадает с текущим (любовь, одержимость, охлаждение…) — она задаёт тон сцены и может включать правила только для этой ветки.</div>
    <div class="ls-gen-events-row">
      <button id="ls-gen-routes-btn" class="menu_button"><i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать маршруты</button>
    </div>
    <div class="ls-hint" style="margin-top:2px;">ИИ создаёт по ветке на каждый тип отношений под этого персонажа (любовь, одержимость, дружба…). Заменяет текущие маршруты. Источник — из вкладки AI.</div>
    <div id="ls-gen-routes-status" style="font-size:11px;opacity:.6;margin:2px 0 6px;min-height:14px;"></div>
    <div id="ls-routes-container" style="${cfg().routesEnabled?'':'display:none;'}"></div>`;

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
    <div class="ls-row" style="margin-bottom:6px;gap:8px;">
      <span style="font-size:12px;opacity:.6;white-space:nowrap;">Тип для генерации:</span>
      ${rtSelectHTML(curGenRt, { id: 'ls-gen-reltype', auto: true, grow: true })}
    </div>
    <div class="ls-hint" style="margin-top:-2px;">Задаёт вайб: ИИ генерит паттерны именно под этот тип (любовь ≠ одержимость). «Авто» — по типу, определённому в чате.</div>
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

  // Внутренность панели — дашборд-шапка + горизонтальные вкладки. Переиспользуется в попапе wand-меню.
  function panelInnerHTML() {
    return `<div id="ls-panel-inner" class="ls-panel-inner">
      <div class="ls-dash">
        <button class="ls-dash-collapse" id="ls-dash-toggle" title="Свернуть / развернуть шапку"><i class="fa-solid fa-chevron-up"></i></button>
        <div class="ls-dash-heart" id="ls-dash-heart">
          <svg viewBox="0 0 20 18"><path d="M10,17 C10,17 1,10.5 1,5 C1,2.2 3,0.5 5.6,0.5 C7.7,0.5 9.2,2 10,3.6 C10.8,2 12.3,0.5 14.4,0.5 C17,0.5 19,2.2 19,5 C19,10.5 10,17 10,17Z"/></svg>
          <div class="ls-dash-score"><div class="hh-num" id="ls-dash-num">0</div><div class="hh-den" id="ls-dash-den">/100</div></div>
          <div class="ls-dash-trend" id="ls-dash-trend"></div>
        </div>
        <div class="ls-dash-info">
          <div class="ls-dash-title"><i class="fa-solid fa-heart"></i> Love Score</div>
          <span class="ls-dash-chip" id="ls-dash-chip"></span>
        </div>
        <div class="ls-dash-spark" id="ls-dash-spark"></div>
      </div>
      <div class="ls-nav">
        <div class="ls-nav-tab active" data-tab="overview"><i class="fa-solid fa-chart-simple"></i><span>Обзор</span></div>
        <div class="ls-nav-tab" data-tab="modes"><i class="fa-solid fa-sliders"></i><span>Режимы</span></div>
        <div class="ls-nav-tab" data-tab="rules"><i class="fa-solid fa-scroll"></i><span>Правила</span></div>
        <div class="ls-nav-tab" data-tab="ai"><i class="fa-solid fa-wand-magic-sparkles"></i><span>AI</span></div>
        <div class="ls-nav-tab" data-tab="group"><i class="fa-solid fa-users"></i><span>Окружение</span></div>
        <div class="ls-nav-tab" data-tab="presets"><i class="fa-solid fa-floppy-disk"></i><span>Пресеты</span></div>
        <div class="ls-nav-tab" data-tab="debug"><i class="fa-solid fa-bug"></i><span>Отладка</span></div>
      </div>
      <div class="ls-tab-pane active" data-pane="overview">${overviewContent}</div>
      <div class="ls-tab-pane" data-pane="modes">${modesContent}</div>
      <div class="ls-tab-pane" data-pane="rules">${rulesContent}</div>
      <div class="ls-tab-pane" data-pane="ai">${aiContent}</div>
      <div class="ls-tab-pane" data-pane="group">${groupContent}</div>
      <div class="ls-tab-pane" data-pane="presets">${presetsContent}</div>
      <div class="ls-tab-pane" data-pane="debug">${debugContent}</div>
    </div>`;
  }
  return { wrapper: `<div id="ls-settings-panel" class="extension-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b><i class="fa-solid fa-heart" style="color:#ff4466;margin-right:6px;"></i>Love Score</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content">${panelInnerHTML()}</div>
    </div>
  </div>`, inner: panelInnerHTML() };
}

// Контент для попапа wand-меню (без drawer-обёртки настроек)
export function panelPopupHTML() {
  return `<div id="ls-popup-root" class="ls-popup-root">${settingsPanelHTML().inner}</div>`;
}

let _lsPopupOpen = false;
// Открыть панель Love Score в адаптивном попапе (wand-меню)
export async function openLoveScorePanel() {
  if (_lsPopupOpen) return;
  let ctx = null;
  try { ctx = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null; } catch {}
  // Закрыть само wand-меню, если открыто
  try { $('#extensionsMenu').hide(); } catch {}

  if (ctx && ctx.Popup && ctx.POPUP_TYPE) {
    _lsPopupOpen = true;
    try {
      const popup = new ctx.Popup(panelPopupHTML(), ctx.POPUP_TYPE.TEXT, '', {
        wide: true, large: true, allowVerticalScrolling: true,
        okButton: tr('Закрыть'), cancelButton: false,
      });
      // Класс на корне попапа для наших медиа-стилей
      try { popup.dlg?.classList?.add('ls-popup-wide'); } catch {}
      // Контент в DOM — навешиваем обработчики и синхронизируем
      setTimeout(() => { try { bindMainEvents(); syncUI(); observeTree(document.getElementById('ls-popup-root')); } catch(e){ console.error('[LoveScore]', e); } }, 0);
      await popup.show();
    } finally { _lsPopupOpen = false; }
    return;
  }

  // Фолбэк без Popup API: своё модальное окно
  if (document.getElementById('ls-fallback-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'ls-fallback-overlay';
  ov.className = 'ls-fallback-overlay';
  ov.innerHTML = `<div class="ls-fallback-modal"><button class="ls-fallback-close menu_button"><i class="fa-solid fa-xmark" style="margin-right:5px;"></i>Закрыть</button>${panelPopupHTML()}</div>`;
  document.body.appendChild(ov);
  _lsPopupOpen = true;
  const close = () => { ov.remove(); _lsPopupOpen = false; };
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('.ls-fallback-close')?.addEventListener('click', close);
  setTimeout(() => { try { bindMainEvents(); syncUI(); observeTree(ov); } catch(e){ console.error('[LoveScore]', e); } }, 0);
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
      +((e.reason||'').trim() ? '<span class="ls-log-reason">'+escHtml(e.reason)+'</span>' : '<span class="ls-log-reason" style="opacity:.25;font-style:italic;">—</span>')
      +(e.date ? '<span class="ls-log-date">'+escHtml(e.date)+'</span>' : '')
      +'</div>';
  }).join('');
}

export function renderScars() {
  const sec = document.getElementById('ls-scars-section');
  const ct  = document.getElementById('ls-scars-container');
  const c = cfg(), d = loveData(), scars = d.scars || [];
  if (sec) sec.style.display = (c.scarsEnabled || scars.length) ? '' : 'none';
  if (!ct) return;
  if (!scars.length) { ct.innerHTML = '<div style="font-size:11px;opacity:.3;padding:5px 6px;">Шрамов пока нет</div>'; return; }
  ct.innerHTML = scars.map(s => {
    const healed = !!s.healed, dc = healed ? 'rgba(120,200,120,.7)' : '#d77d8f', bg = healed ? 'rgba(80,180,80,.05)' : 'rgba(200,80,110,.06)';
    const badge = healed ? '<span style="font-size:10px;color:#7cc97c;">зажил</span>' : '<span style="font-size:10px;color:#d77d8f;">открыт · точка '+escHtml(String(s.atScore))+'</span>';
    return '<div class="ls-scar-row" data-id="'+s.id+'" style="display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-radius:6px;margin-bottom:5px;background:'+bg+';border-left:2px solid '+dc+';">'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-size:12px;color:var(--SmartThemeBodyColor,#ddd);'+(healed?'opacity:.55;text-decoration:line-through;':'')+'line-height:1.4;">'+escHtml(s.text)+'</div>'
      +   '<div style="margin-top:2px;">'+badge+' <span style="font-size:10px;opacity:.3;">'+escHtml(s.date||'')+'</span></div>'
      + '</div>'
      + '<button class="menu_button ls-scar-heal" data-id="'+s.id+'" title="'+(healed?'Открыть заново':'Залечить вручную')+'" style="padding:2px 7px!important;font-size:11px!important;"><i class="fa-solid '+(healed?'fa-rotate-left':'fa-check')+'"></i></button>'
      + '<button class="menu_button ls-del-btn ls-scar-del" data-id="'+s.id+'" title="Удалить" style="padding:2px 7px!important;font-size:11px!important;"><i class="fa-solid fa-xmark"></i></button>'
      + '</div>';
  }).join('');
  $(ct).off('click','.ls-scar-heal').on('click','.ls-scar-heal', function() {
    const sc = (loveData().scars||[]).find(x => x.id === String($(this).data('id')));
    if (sc) { sc.healed = !sc.healed; saveSettingsDebounced(); updatePromptInjection(); renderScars(); }
  });
  $(ct).off('click','.ls-scar-del').on('click','.ls-scar-del', function() {
    const d2 = loveData(); d2.scars = (d2.scars||[]).filter(x => x.id !== String($(this).data('id')));
    saveSettingsDebounced(); updatePromptInjection(); renderScars();
  });
}

export function renderSparkline() {
  const sec = document.getElementById('ls-sparkline-section'), ct = document.getElementById('ls-sparkline');
  const c = cfg(), d = loveData(), pts = getScoreHistory(d, 14);
  const show = (c.showSparkline !== false) && pts.length >= 2;
  if (sec) sec.style.display = show ? '' : 'none';
  if (!ct || !show) return;
  const W = 240, H = 46, pad = 5;
  let lo = Math.min(...pts), hi = Math.max(...pts);
  if (lo === hi) { lo -= 1; hi += 1; }
  const rng = hi - lo;
  const X = i => (pad + i*(W-2*pad)/(pts.length-1)).toFixed(1);
  const Y = v => (H-pad - ((v-lo)/rng)*(H-2*pad)).toFixed(1);
  const path = pts.map((v,i) => (i?'L':'M')+X(i)+' '+Y(v)).join(' ');
  const up = pts[pts.length-1] >= pts[0], col = up ? '#5ad15a' : '#e85a5a';
  let zero = '';
  if (lo < 0 && hi > 0) { const zy = Y(0); zero = '<line x1="'+pad+'" y1="'+zy+'" x2="'+(W-pad)+'" y2="'+zy+'" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-dasharray="3 3"/>'; }
  const last = pts[pts.length-1];
  ct.innerHTML = '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:46px;overflow:visible;">'
    + zero
    + '<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'
    + '<circle cx="'+X(pts.length-1)+'" cy="'+Y(last)+'" r="2.5" fill="'+col+'"/>'
    + '</svg>';
}

// Живая шапка-дашборд: счёт, тип, тренд, мини-график
export function renderHeaderDash() {
  const d = loveData(), c = cfg();
  const rt = RELATION_TYPES[d.relationType||'neutral'] || RELATION_TYPES.neutral;
  const num = document.getElementById('ls-dash-num'); if (num) num.textContent = fmtScore(d.score);
  const den = document.getElementById('ls-dash-den'); if (den) den.textContent = '/'+d.maxScore;
  const heart = document.getElementById('ls-dash-heart');
  if (heart) heart.style.setProperty('--ls-dash-col', d.score < 0 ? (d.relationType==='hostile' ? '#0a8c3a' : '#4ec900') : rt.color);
  const chip = document.getElementById('ls-dash-chip');
  if (chip) { chip.innerHTML = '<i class="fa-solid '+(rt.icon||'fa-heart')+'"></i> '+escHtml(rt.label); chip.style.color = rt.color; }
  const pts = getScoreHistory(d, 14);
  const tr = document.getElementById('ls-dash-trend');
  if (tr) {
    const diff = pts.length >= 2 ? (pts[pts.length-1] - pts[pts.length-2]) : 0;
    if (diff > 0)      { tr.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i>';   tr.style.color = '#69d66b'; tr.style.display = ''; }
    else if (diff < 0) { tr.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i>'; tr.style.color = '#e85a5a'; tr.style.display = ''; }
    else tr.style.display = 'none';
  }
  const spark = document.getElementById('ls-dash-spark');
  if (spark) {
    if (c.showSparkline !== false && pts.length >= 2) {
      const W = 116, H = 38, pad = 4;
      let lo = Math.min(...pts), hi = Math.max(...pts); if (lo === hi) { lo -= 1; hi += 1; }
      const rng = hi - lo;
      const X = i => (pad + i*(W-2*pad)/(pts.length-1)).toFixed(1);
      const Y = v => (H-pad - ((v-lo)/rng)*(H-2*pad)).toFixed(1);
      const line = pts.map((v,i) => X(i)+','+Y(v)).join(' ');
      const up = pts[pts.length-1] >= pts[0], col = up ? '#ff5e7e' : '#e85a5a';
      spark.innerHTML = '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline points="'+line+'" fill="none" stroke="'+col+'" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      spark.style.display = '';
    } else { spark.innerHTML = ''; spark.style.display = 'none'; }
  }
}

export function renderRoutes() {
  const ct = document.getElementById('ls-routes-container'); if (!ct) return;
  const d = loveData(), routes = d.routes || [], cur = getCurrentRoute(d);
  let html = '';
  routes.forEach((rr, i) => {
    const active = cur && cur.id === rr.id;
    const tcol = (RELATION_TYPES[rr.relationType] || RELATION_TYPES.neutral).color;
    html += `<div class="ls-card ls-card-neu" data-idx="${i}" style="${active?'border-color:rgba(150,120,210,.7);':''}">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="ls-route-badge" style="color:${tcol};font-size:10px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">${active?'<i class="fa-solid fa-play" style="font-size:8px;margin-right:3px;"></i>сейчас':'ветка'}</span>
          <input type="text" class="ls-route-name ls-api-field" value="${escHtml(rr.name||'')}" data-idx="${i}" placeholder="Название ветки..." style="flex:1;min-width:110px;">
          ${rtSelectHTML(rr.relationType, { idx: i, inputCls: 'ls-route-type' })}
        </div>
        <textarea class="ls-route-desc ls-textarea-field" data-idx="${i}" rows="2" placeholder="Тон, поведение и ставки этой ветки...">${escHtml(rr.description||'')}</textarea>
      </div>
      <button class="ls-del-route menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
    </div>`;
  });
  html += '<button id="ls-add-route" class="menu_button ls-add-btn"><i class="fa-solid fa-plus"></i> Добавить ветку</button>';
  ct.innerHTML = html;
  $('.ls-route-name').off('input').on('input', function(){ loveData().routes[+$(this).data('idx')].name = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-route-type').off('change').on('change', function(){ loveData().routes[+$(this).data('idx')].relationType = this.value; saveSettingsDebounced(); updatePromptInjection(); renderRoutes(); renderChanges(); });
  $('.ls-route-desc').off('input').on('input', function(){ loveData().routes[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-del-route').off('click').on('click', function(){ loveData().routes.splice(+$(this).data('idx'),1); saveSettingsDebounced(); updatePromptInjection(); renderRoutes(); renderChanges(); });
  $('#ls-add-route').off('click').on('click', () => {
    loveData().routes.push({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,5), name:'', relationType:'romance', description:'' });
    saveSettingsDebounced(); renderRoutes(); renderChanges();
  });
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
      +'<button class="menu_button ls-preset-btn ls-del-btn ls-preset-del" data-id="'+p.id+'"><i class="fa-solid fa-xmark"></i></button>'
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
  const d = loveData(), arr = d.scoreChanges || []; let html = '';
  const cfgRoutes = (d.routes || []).filter(r => (r.name||'').trim());
  const routesOn = cfg().routesEnabled && cfgRoutes.length;
  arr.forEach((c, i) => {
    const pos = c.delta >= 0, cls = pos ? 'ls-card-pos' : 'ls-card-neg';
    const icon = pos ? '<i class="fa-solid fa-heart ls-heart-icon ls-icon-pos"></i>' : '<i class="fa-solid fa-heart-crack ls-heart-icon ls-icon-neg"></i>';
    const ph   = pos ? 'При каких условиях растёт...' : 'При каких условиях падает...';
    const hasCond = c.minScore != null || c.maxScore != null || c.route;
    const routeOpts = '<option value="">любой маршрут</option>' + cfgRoutes.map(r => '<option value="'+r.id+'"'+(c.route===r.id?' selected':'')+'>'+escHtml(r.name)+'</option>').join('');
    html += `<div class="ls-card ${cls}" data-idx="${i}">
      <div class="ls-heart-box">${icon}<input type="number" class="ls-delta-input ls-num-input" value="${c.delta}" data-idx="${i}" style="width:56px;font-weight:600;"></div>
      <textarea class="ls-change-desc ls-textarea-field" data-idx="${i}" rows="2" placeholder="${ph}">${escHtml(c.description)}</textarea>
      <button class="ls-del-change menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
      <div class="ls-cond-row" data-idx="${i}" style="flex-basis:100%;display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.06);">
        <span style="font-size:10px;opacity:.4;text-transform:uppercase;letter-spacing:.04em;">если${hasCond?'':' (необязательно)'}:</span>
        <span style="font-size:11px;opacity:.55;">счёт от</span>
        <input type="number" class="ls-cond-min ls-num-input" data-idx="${i}" value="${c.minScore!=null?c.minScore:''}" placeholder="—" style="width:48px;">
        <span style="font-size:11px;opacity:.55;">до</span>
        <input type="number" class="ls-cond-max ls-num-input" data-idx="${i}" value="${c.maxScore!=null?c.maxScore:''}" placeholder="—" style="width:48px;">
        ${routesOn?`<span style="font-size:11px;opacity:.55;margin-left:4px;">маршрут:</span><select class="ls-cond-route ls-num-input" data-idx="${i}" style="width:auto;max-width:140px;">${routeOpts}</select>`:''}
      </div>
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
    const lbl = act ? '<i class="fa-solid fa-play" style="font-size:8px;margin-right:3px;"></i>активно' : (isNeg ? '<i class="fa-solid fa-skull"></i> негатив' : 'диапазон');
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
  $('.ls-cond-min').off('change').on('change', function(){ const v=this.value.trim(); loveData().scoreChanges[+$(this).data('idx')].minScore = v===''?null:(parseInt(v)||0); saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-cond-max').off('change').on('change', function(){ const v=this.value.trim(); loveData().scoreChanges[+$(this).data('idx')].maxScore = v===''?null:(parseInt(v)||0); saveSettingsDebounced(); updatePromptInjection(); });
  $('.ls-cond-route').off('change').on('change', function(){ const v=this.value; loveData().scoreChanges[+$(this).data('idx')].route = v||null; saveSettingsDebounced(); updatePromptInjection(); });
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
  const prompt  = cfg().isEnabled ? buildPrompt() : tr('(расширение отключено)');
  const msgCtr  = c._autoSuggestMsgCounter || 0, interval = c.autoSuggestInterval || 20;

  const statHTML = `<div class="ls-debug-block">
    <div class="ls-debug-label"><i class="fa-solid fa-gauge-high"></i> Текущее состояние</div>
    <div class="ls-debug-stat-grid">
      <div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:${rt.color};">${d.score} / ${d.maxScore}</span><span class="ls-debug-stat-key">Love Score</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:${rt.color};"><i class="fa-solid ${rt.icon||'fa-heart'}" style="margin-right:5px;font-size:12px;"></i>${escHtml(rt.label)}</span><span class="ls-debug-stat-key">Тип отношений</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${escHtml(interp?.description?.slice(0,30)||'—')}</span><span class="ls-debug-stat-key">Активный диапазон</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${pending.length}</span><span class="ls-debug-stat-key">Событий в очереди</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${c.autoSuggestEnabled?msgCtr+' / '+interval:'выкл'}</span><span class="ls-debug-stat-key">Авто-реген</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${c.gradualProgression?'±2':'без огр.'}</span><span class="ls-debug-stat-key">SlowBurn</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${tr(({strict:'строгий',hints:'подсказки',monologue:'монолог'})[c.injectTone||'strict'])}${c.hideRules?' · '+tr('скрыто'):''}</span><span class="ls-debug-stat-key">Тон инжекта</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val" style="${c.hardcoreMode?'color:#ff5577;':''}">${c.hardcoreMode?('+'+(c.hardcorePositiveCap ?? 0.5)+' / ×'+(c.hardcoreNegativeMult ?? 2)):'выкл'}</span><span class="ls-debug-stat-key">Hardcore</span></div>
      ${c.hardcoreMode?`<div class="ls-debug-stat"><span class="ls-debug-stat-val">${(d._hcStaleCounter||0)} / ${c.hardcoreDecayInterval ?? 3}</span><span class="ls-debug-stat-key">Простой (до decay)</span></div>
      <div class="ls-debug-stat"><span class="ls-debug-stat-val">${(d._hcBreakthroughCD||0)>0?(d._hcBreakthroughCD+' '+tr('сообщ.')):tr('готов')}</span><span class="ls-debug-stat-key">Прорыв</span></div>`:''}
      ${(c.coldStartEnabled||d._coldStarted)?`<div class="ls-debug-stat"><span class="ls-debug-stat-val" style="${d._coldStarted?'color:#5b8fd6;':''}">${d._coldStarted?tr('активен'):tr('старт')+' '+(c.coldStartScore ?? -30)}</span><span class="ls-debug-stat-key">Холодный старт</span></div>`:''}
      ${c.scarsEnabled?`<div class="ls-debug-stat"><span class="ls-debug-stat-val" style="${getActiveScars(d).length?'color:#d77d8f;':''}">${getActiveScars(d).length} ${tr('акт.')} / ${(d.scars||[]).length}</span><span class="ls-debug-stat-key">Шрамы</span></div>`:''}
      ${(c.streakEnabled!==false)?`<div class="ls-debug-stat"><span class="ls-debug-stat-val" style="${(d._streakCount||0)>=(c.streakNeeded??3)?'color:#e8923a;':''}">${d._streakCount||0} / ${c.streakNeeded ?? 3}</span><span class="ls-debug-stat-key">Серия</span></div>`:''}
      ${(c.momentumEnabled!==false&&(d._momentumTurns||0)>0)?`<div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:#9a7bd6;">${d._momentumDir>0?'↑':'↓'} ${d._momentumTurns} ${tr('ход.')}</span><span class="ls-debug-stat-key">Импульс</span></div>`:''}
      ${c.routesEnabled?`<div class="ls-debug-stat"><span class="ls-debug-stat-val">${(()=>{const r=getCurrentRoute(d);return r?escHtml(r.name):'—';})()}</span><span class="ls-debug-stat-key">Маршрут</span></div>`:''}
      ${(()=>{const rivals=(d.groupNpcs||[]).filter(n=>n.isRival&&n.name?.trim());return rivals.length?`<div class="ls-debug-stat"><span class="ls-debug-stat-val" style="color:#e0795a;">${rivals.map(n=>escHtml(n.name)+': '+(n.score??0)).join(', ')}</span><span class="ls-debug-stat-key">Соперник${rivals.length>1?'и':''}</span></div>`:'';})()}
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
    npcHTML = `<div class="ls-debug-block"><div class="ls-debug-label"><i class="fa-solid fa-users"></i> ${tr('Окружение')} (${npcs.length} NPC)</div><div class="ls-debug-npc-state">${rows}</div></div>`;
  } else if (c.groupMode) {
    npcHTML = `<div class="ls-debug-block"><div class="ls-debug-label"><i class="fa-solid fa-users"></i> Окружение</div><div style="font-size:11px;opacity:.3;padding:4px;">Нет NPC в текущем чате</div></div>`;
  }

  const tagsHTML = `<div class="ls-debug-block">
    <div class="ls-debug-label"><i class="fa-solid fa-tags"></i> Теги в ответах AI <button class="menu_button ls-debug-copy" id="ls-debug-copy-tags" title="Скопировать"><i class="fa-solid fa-copy"></i></button></div>
    <pre id="ls-debug-tags-text" style="font-size:10px;line-height:1.8;padding:8px;background:rgba(0,0,0,.3);border-radius:5px;border:1px solid rgba(255,255,255,.06);overflow-x:auto;color:rgba(160,220,255,.85);">${escHtml(
      (c.scoreReason!==false
        ? '<!-- [LOVE_SCORE:X:причина] -->       — '+tr('обновить счёт + причина в лог')
        : '<!-- [LOVE_SCORE:X] -->              — '+tr('обновить счёт главного героя'))+'\n'
      +'<!-- [RELATION_TYPE:key] -->          — '+tr('установить тип отношений')+'\n'
      +'<!-- [MILESTONE:threshold] -->        — '+tr('отметить романтическое событие выполненным')+'\n'
      +(c.hardcoreMode?'<!-- [HC_BREAKTHROUGH:N] -->          — '+tr('редкий большой прыжок (hardcore, обходит кап)')+'\n':'')
      +(c.scarsEnabled?'<!-- [SCAR:описание] -->              — '+tr('отметить глубокую обиду (шрам)')+'\n':'')
      +(c.groupMode&&npcs.length?'\n=== '+tr('NPC Окружение')+' ===\n'+'<!-- [NPC_SCORE:EnName:X] -->         — '+tr('обновить счёт NPC (соперник: его рост давит на твой счёт)')+'\n'+'<!-- [NPC_TYPE:EnName:key] -->         — '+tr('установить тип отношений NPC')+'\n'+'\n'+tr('Доступные типы:')+' '+Object.keys(RELATION_TYPES).join(' | '):'')
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
  const hr = el('ls-hide-rules'); if (hr) hr.checked = c.hideRules || false;
  const sr = el('ls-score-reason'); if (sr) sr.checked = c.scoreReason !== false;
  const it = el('ls-inject-tone'); if (it) it.value = c.injectTone || 'strict';
  const hc = el('ls-hardcore'); if (hc) hc.checked = c.hardcoreMode || false;
  const hcBody = el('ls-hardcore-body'); if (hcBody) hcBody.style.display = c.hardcoreMode ? '' : 'none';
  const hcCap = el('ls-hc-cap'); if (hcCap) hcCap.value = c.hardcorePositiveCap ?? 0.5;
  const hcNeg = el('ls-hc-negmult'); if (hcNeg) hcNeg.value = c.hardcoreNegativeMult ?? 2.0;
  const hcDecay = el('ls-hc-decay'); if (hcDecay) hcDecay.checked = c.hardcoreDecayEnabled ?? true;
  const hcDecayBody = el('ls-hc-decay-body'); if (hcDecayBody) hcDecayBody.style.display = (c.hardcoreDecayEnabled ?? true) ? '' : 'none';
  const hcStep = el('ls-hc-decay-step'); if (hcStep) hcStep.value = c.hardcoreDecayPerStep ?? 0.3;
  const hcInt = el('ls-hc-decay-int'); if (hcInt) hcInt.value = c.hardcoreDecayInterval ?? 3;
  const hcBt = el('ls-hc-bt-cd'); if (hcBt) hcBt.value = c.hardcoreBreakthroughCD ?? 10;
  const cs = el('ls-coldstart'); if (cs) cs.checked = c.coldStartEnabled || false;
  const csBody = el('ls-coldstart-body'); if (csBody) csBody.style.display = c.coldStartEnabled ? '' : 'none';
  const csScore = el('ls-cs-score'); if (csScore) csScore.value = c.coldStartScore ?? -30;
  const se = el('ls-scars-enabled'); if (se) se.checked = c.scarsEnabled || false;
  const seBody = el('ls-scars-settings-body'); if (seBody) seBody.style.display = c.scarsEnabled ? '' : 'none';
  const sThr = el('ls-scar-threshold'); if (sThr) sThr.value = c.scarThreshold ?? 10;
  const sHeal = el('ls-scar-heal'); if (sHeal) sHeal.value = c.scarHealMargin ?? 30;
  const stog = el('ls-show-trend'); if (stog) stog.checked = c.showTrend !== false;
  const sptog = el('ls-show-sparkline'); if (sptog) sptog.checked = c.showSparkline !== false;
  const dctog = el('ls-open-dblclick'); if (dctog) dctog.checked = c.openOnDblClick !== false;
  const stkE = el('ls-streak-enabled'); if (stkE) stkE.checked = c.streakEnabled !== false;
  const stkB = el('ls-streak-body'); if (stkB) stkB.style.display = (c.streakEnabled !== false) ? '' : 'none';
  const stkN = el('ls-streak-needed'); if (stkN) stkN.value = c.streakNeeded ?? 3;
  const stkM = el('ls-streak-mult'); if (stkM) stkM.value = c.streakMult ?? 1.5;
  const momE = el('ls-momentum-enabled'); if (momE) momE.checked = c.momentumEnabled !== false;
  const momB = el('ls-momentum-body'); if (momB) momB.style.display = (c.momentumEnabled !== false) ? '' : 'none';
  const momT = el('ls-momentum-threshold'); if (momT) momT.value = c.momentumThreshold ?? 8;
  const momU = el('ls-momentum-turns'); if (momU) momU.value = c.momentumTurns ?? 2;
  const rtE = el('ls-routes-enabled'); if (rtE) rtE.checked = c.routesEnabled || false;
  const rtC = el('ls-routes-container'); if (rtC) rtC.style.display = c.routesEnabled ? '' : 'none';
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
  renderChanges(); renderInterps(); renderMilestones(); renderScoreLog(); renderScars(); renderSparkline(); renderRoutes(); renderPresets();
  renderHeaderDash();
  if (cfg().groupMode) renderGroupNpcs();
  _updateGenLbCounter(); _syncSourceCards();
  refreshWidget();
}

// ─── Основные события ─────────────────────────────────────────────────────────
export function bindMainEvents() {
  $('#ls-enabled').off('change').on('change', function() { cfg().isEnabled=this.checked; cfg()._savedEnabled=this.checked; saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); });
  $('#ls-val').off('change').on('change', function() {
    const d=loveData(),prev=d.score; d.score=roundScore(Math.max(MIN_SCORE,Math.min(parseFloat(this.value)||0,d.maxScore)));
    const delta=roundScore(d.score-prev); if(delta!==0){addToLog(d,delta,'вручную');renderScoreLog();}
    saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); renderInterps(); renderMilestones();
  });
  $('#ls-max').off('change').on('change', function() {
    const d=loveData(),c=cfg(); d.maxScore=Math.max(1,parseInt(this.value)||100); c.maxScore=d.maxScore;
    if(d.score>d.maxScore) d.score=d.maxScore; saveSettingsDebounced(); updatePromptInjection(); refreshWidget();
  });
  $('#ls-reset-btn').off('click').on('click', () => { loveData().score=0; saveSettingsDebounced(); pulseWidget(); syncUI(); updatePromptInjection(); });
  $('#ls-gradual').off('change').on('change', function() { cfg().gradualProgression=this.checked; saveSettingsDebounced(); updatePromptInjection(); });
  $('#ls-hide-rules').off('change').on('change', function() { cfg().hideRules=this.checked; saveSettingsDebounced(); updatePromptInjection(); toast('info', this.checked?'🎭 Правила скрыты от бота — только поведение и счёт':'Правила снова видны боту'); });
  $('#ls-score-reason').off('change').on('change', function() { cfg().scoreReason=this.checked; saveSettingsDebounced(); updatePromptInjection(); toast('info', this.checked?'📝 AI будет писать причину к счёту в лог':'Обоснование в логе выключено'); });
  $('#ls-inject-tone').off('change').on('change', function() { cfg().injectTone=this.value; saveSettingsDebounced(); updatePromptInjection(); });
  $('#ls-hardcore').off('change').on('change', function() {
    cfg().hardcoreMode=this.checked;
    const b=document.getElementById('ls-hardcore-body'); if(b) b.style.display=this.checked?'':'none';
    saveSettingsDebounced(); updatePromptInjection(); refreshWidget();
    toast(this.checked?'warning':'info', this.checked?'☠️ Hardcore включён — набирать очки будет тяжело':'Hardcore выключен');
  });
  $('#ls-hc-cap').off('change').on('change', function(){ cfg().hardcorePositiveCap=Math.max(0.1, parseFloat(this.value)||0.5); saveSettingsDebounced(); updatePromptInjection(); });
  $('#ls-hc-negmult').off('change').on('change', function(){ cfg().hardcoreNegativeMult=Math.max(1, parseFloat(this.value)||2); saveSettingsDebounced(); updatePromptInjection(); });
  $('#ls-hc-decay').off('change').on('change', function(){ cfg().hardcoreDecayEnabled=this.checked; const b=document.getElementById('ls-hc-decay-body'); if(b) b.style.display=this.checked?'':'none'; saveSettingsDebounced(); updatePromptInjection(); });
  $('#ls-hc-decay-step').off('change').on('change', function(){ cfg().hardcoreDecayPerStep=Math.max(0.1, parseFloat(this.value)||0.3); saveSettingsDebounced(); });
  $('#ls-hc-decay-int').off('change').on('change', function(){ cfg().hardcoreDecayInterval=Math.max(1, parseInt(this.value)||3); saveSettingsDebounced(); });
  $('#ls-hc-bt-cd').off('change').on('change', function(){ cfg().hardcoreBreakthroughCD=Math.max(0, parseInt(this.value)||10); saveSettingsDebounced(); });
  $('#ls-coldstart').off('change').on('change', function() {
    cfg().coldStartEnabled=this.checked;
    const b=document.getElementById('ls-coldstart-body'); if(b) b.style.display=this.checked?'':'none';
    saveSettingsDebounced();
    toast('info', this.checked?'❄️ Холодный старт включён — новые чаты начнутся в минусе':'Холодный старт выключен');
  });
  $('#ls-cs-score').off('change').on('change', function(){ cfg().coldStartScore=Math.max(MIN_SCORE, Math.min(0, parseInt(this.value)||-30)); saveSettingsDebounced(); });
  $('#ls-cs-apply').off('click').on('click', () => {
    const d=loveData(), c=cfg(), prev=d.score;
    const target=Math.max(MIN_SCORE, Math.min(0, c.coldStartScore ?? -30));
    d.score=target; d._coldStarted=true;
    const delta=roundScore(d.score-prev); if(delta!==0) addToLog(d,delta,'❄ холодный старт');
    const crossed=(prev>=0&&d.score<0)||(prev<0&&d.score>=0);
    saveSettingsDebounced(); updatePromptInjection(); syncUI();
    if(crossed) flipWidget(); else pulseWidget();
    toast('info', 'Текущий чат сброшен в холодный старт ('+target+')');
  });
  $('#ls-scars-enabled').off('change').on('change', function() {
    cfg().scarsEnabled=this.checked;
    const b=document.getElementById('ls-scars-settings-body'); if(b) b.style.display=this.checked?'':'none';
    saveSettingsDebounced(); updatePromptInjection(); renderScars();
    toast('info', this.checked?'🩹 Шрамы включены — крупные обиды запоминаются':'Шрамы выключены');
  });
  $('#ls-scar-threshold').off('change').on('change', function(){ cfg().scarThreshold=Math.max(1, parseInt(this.value)||10); saveSettingsDebounced(); });
  $('#ls-scar-heal').off('change').on('change', function(){ cfg().scarHealMargin=Math.max(0, parseInt(this.value)||0); saveSettingsDebounced(); updatePromptInjection(); });
  $('#ls-scar-add-btn').off('click').on('click', () => {
    const inp=document.getElementById('ls-scar-add-input'), t=(inp?.value||'').trim();
    if(!t){ toast('warning','Опиши обиду'); return; }
    addScar(loveData(), t, 0); if(inp) inp.value='';
    saveSettingsDebounced(); updatePromptInjection(); renderScars(); toast('info','🩹 Шрам записан');
  });
  $('#ls-scar-add-input').off('keydown').on('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); $('#ls-scar-add-btn').click(); } });
  $('#ls-show-trend').off('change').on('change', function(){ cfg().showTrend=this.checked; saveSettingsDebounced(); refreshWidget(); });
  $('#ls-show-sparkline').off('change').on('change', function(){ cfg().showSparkline=this.checked; saveSettingsDebounced(); renderSparkline(); });
  $('#ls-open-dblclick').off('change').on('change', function(){ cfg().openOnDblClick=this.checked; saveSettingsDebounced(); });
  $('#ls-streak-enabled').off('change').on('change', function(){ cfg().streakEnabled=this.checked; const b=document.getElementById('ls-streak-body'); if(b) b.style.display=this.checked?'':'none'; saveSettingsDebounced(); });
  $('#ls-streak-needed').off('change').on('change', function(){ cfg().streakNeeded=Math.max(2, parseInt(this.value)||3); saveSettingsDebounced(); });
  $('#ls-streak-mult').off('change').on('change', function(){ cfg().streakMult=Math.max(1, parseFloat(this.value)||1.5); saveSettingsDebounced(); });
  $('#ls-momentum-enabled').off('change').on('change', function(){ cfg().momentumEnabled=this.checked; const b=document.getElementById('ls-momentum-body'); if(b) b.style.display=this.checked?'':'none'; saveSettingsDebounced(); updatePromptInjection(); });
  $('#ls-momentum-threshold').off('change').on('change', function(){ cfg().momentumThreshold=Math.max(1, parseInt(this.value)||8); saveSettingsDebounced(); });
  $('#ls-momentum-turns').off('change').on('change', function(){ cfg().momentumTurns=Math.max(1, parseInt(this.value)||2); saveSettingsDebounced(); });
  $('#ls-routes-enabled').off('change').on('change', function(){ cfg().routesEnabled=this.checked; const b=document.getElementById('ls-routes-container'); if(b) b.style.display=this.checked?'':'none'; saveSettingsDebounced(); updatePromptInjection(); renderRoutes(); renderChanges(); toast('info', this.checked?'🛤 Маршруты включены':'Маршруты выключены'); });
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
    info.innerHTML=`<span style="color:${t.color};font-weight:600;"><i class="fa-solid ${t.icon||'fa-heart'}" style="margin-right:6px;"></i>${escHtml(t.label)}</span> — <span style="opacity:.7;">${escHtml(t.desc)}</span>`
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
  // Кастомный селектор типа отношений (open/close + выбор)
  $(document).off('click.lsrt','.ls-rt-trigger').on('click.lsrt','.ls-rt-trigger', function(e){
    e.preventDefault(); e.stopPropagation();
    const sel=this.closest('.ls-rt-select'), open=sel.classList.contains('ls-rt-open');
    document.querySelectorAll('.ls-rt-select.ls-rt-open').forEach(s=>{ if(s!==sel) s.classList.remove('ls-rt-open'); });
    if(!open){
      // открыть вверх, если снизу мало места (попап скроллится и обрезает меню)
      const r=this.getBoundingClientRect();
      const menuH=Math.min(288, (sel.querySelectorAll('.ls-rt-opt').length)*30+8);
      const sc=sel.closest('.popup-content, .ls-fallback-modal');
      const bottomLimit=sc?sc.getBoundingClientRect().bottom:window.innerHeight;
      sel.classList.toggle('ls-rt-up', (bottomLimit-r.bottom)<menuH+10 && (r.top-(sc?sc.getBoundingClientRect().top:0))>menuH);
    }
    sel.classList.toggle('ls-rt-open', !open);
  });
  $(document).off('click.lsrt','.ls-rt-opt').on('click.lsrt','.ls-rt-opt', function(e){
    e.preventDefault(); e.stopPropagation();
    const sel=this.closest('.ls-rt-select'), val=this.dataset.val||'';
    const input=sel.querySelector('.ls-rt-value');
    sel.classList.remove('ls-rt-open');
    if(!input || input.value===val) return;
    input.value=val;
    const t=val?RELATION_TYPES[val]:null, col=t?t.color:'#9a9a9a';
    sel.style.setProperty('--rt-col', col);
    sel.querySelector('.ls-rt-trigger .ls-rt-ic').innerHTML = t?`<i class="fa-solid ${t.icon}"></i>`:'<i class="fa-solid fa-shuffle"></i>';
    sel.querySelector('.ls-rt-trigger .ls-rt-name').textContent = t?t.label:'— авто (по чату) —';
    sel.querySelectorAll('.ls-rt-opt').forEach(o=>o.classList.toggle('ls-rt-sel', (o.dataset.val||'')===val));
    $(input).trigger('change');
  });
  $(document).off('click.lsrtclose').on('click.lsrtclose', function(){
    document.querySelectorAll('.ls-rt-select.ls-rt-open').forEach(s=>s.classList.remove('ls-rt-open'));
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
  $(document).off('click','#ls-gen-events-btn').on('click','#ls-gen-events-btn', () => onGenerateEventsClick(syncUI));
  $(document).off('click','#ls-gen-routes-btn').on('click','#ls-gen-routes-btn', () => onGenerateRoutesClick(syncUI));
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
    d.groupNpcs.push(mkNpc({name:tr('Новый NPC')}));
    saveGroupNpcs(); renderGroupNpcs();
  });
  $(document).off('click','#ls-npc-scan-chat').on('click','#ls-npc-scan-chat', function(){ scanChatForNpcs(); });
  // Переключение вкладок
  $(document).off('click','.ls-nav-tab').on('click','.ls-nav-tab', function(){
    const tab=this.dataset.tab, root=this.closest('.ls-panel-inner'); if(!root) return;
    root.querySelectorAll('.ls-nav-tab').forEach(t=>t.classList.toggle('active', t===this));
    root.querySelectorAll('.ls-tab-pane').forEach(p=>p.classList.toggle('active', p.dataset.pane===tab));
    if(tab==='group' && cfg().groupMode) setTimeout(()=>renderGroupNpcs(),40);
    if(tab==='debug') setTimeout(renderDebug,60);
  });
  // Сворачивание шапки-дашборда
  $(document).off('click','#ls-dash-toggle').on('click','#ls-dash-toggle', function(){
    const root=this.closest('.ls-panel-inner'); if(root) root.classList.toggle('ls-collapsed');
  });
  $(document).off('click','#ls-debug-refresh-btn').on('click','#ls-debug-refresh-btn', renderDebug);
}
