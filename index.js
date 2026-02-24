import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXT_NAME = 'love-score';
const PROMPT_KEY = EXT_NAME + '_injection';
const defaultSettings = { isEnabled:true, maxScore:100, gradualProgression:true, widgetPos:null, widgetSize:64, lastCheckedMessageId:null, chatLoveData:{} };
const mkLoveData = () => ({
  score:0, maxScore:100,
  scoreChanges:[{delta:1,description:''},{delta:2,description:''},{delta:-1,description:''},{delta:-2,description:''}],
  scaleInterpretations:[{min:0,max:10,description:''},{min:11,max:30,description:''},{min:31,max:50,description:''},{min:51,max:70,description:''},{min:71,max:85,description:''},{min:86,max:95,description:''},{min:96,max:100,description:''}]
});
const cfg = () => extension_settings[EXT_NAME];
function getChatId(){ try{ const x=SillyTavern?.getContext?.()??{}; return x.chatId??x.chat_metadata?.chat_id??'__global__'; } catch{ return '__global__'; } }
function loveData(){
  const c=cfg(); if(!c.chatLoveData)c.chatLoveData={};
  const id=getChatId(); if(!c.chatLoveData[id])c.chatLoveData[id]=mkLoveData();
  const d=c.chatLoveData[id];
  if(!d.scoreChanges)d.scoreChanges=mkLoveData().scoreChanges;
  if(!d.scaleInterpretations)d.scaleInterpretations=mkLoveData().scaleInterpretations;
  return d;
}
function escHtml(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function getActiveInterp(){ const d=loveData(); return (d.scaleInterpretations||[]).find(ip=>d.score>=ip.min&&d.score<=ip.max)??null; }
function heartColor(score,max){ const r=score/max; if(r>=0.85)return'#e8003d'; if(r>=0.65)return'#ff2d55'; if(r>=0.45)return'#ff6b8a'; if(r>=0.25)return'#ff9eb5'; if(r>0)return'#ffc8d5'; return'transparent'; }

function injectStyles(){
  if(document.getElementById('ls-styles'))return;
  const el=document.createElement('style'); el.id='ls-styles';
  el.textContent=`
#ls-widget{position:fixed;cursor:grab;z-index:9998;user-select:none;touch-action:none;filter:drop-shadow(0 4px 14px rgba(255,60,100,.35));transition:filter .2s ease;}
#ls-widget:hover{filter:drop-shadow(0 6px 22px rgba(255,60,100,.6));}
#ls-widget:active{cursor:grabbing;}
#ls-widget.ls-beat{animation:ls-hb .55s cubic-bezier(.36,1.8,.5,1) forwards;}
@keyframes ls-hb{0%{transform:scale(1)}40%{transform:scale(1.32)}70%{transform:scale(.92)}100%{transform:scale(1)}}
#ls-heart-fill{transition:y .6s ease,height .6s ease,fill .5s ease;}
#ls-status-tip{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(15,10,20,.95);border:1px solid rgba(255,90,120,.4);border-radius:8px;padding:6px 11px;font-size:11px;color:rgba(255,215,225,.9);pointer-events:none;opacity:0;white-space:normal;text-align:center;max-width:190px;min-width:100px;backdrop-filter:blur(10px);transition:opacity .2s ease;z-index:10000;line-height:1.45;}
#ls-widget:hover #ls-status-tip{opacity:1;}
.ls-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.ls-section-title{font-weight:700;font-size:12px;color:rgba(255,140,165,.9);margin:14px 0 4px;letter-spacing:.4px;text-transform:uppercase;}
.ls-hint{font-size:10px;color:rgba(255,255,255,.35);line-height:1.45;margin-bottom:6px;}
.ls-num-input{background:rgba(255,255,255,.04);border:1px solid rgba(255,100,130,.3);border-radius:6px;color:inherit;padding:4px 6px;text-align:center;font-size:13px;}
.ls-textarea-field{flex:1;resize:vertical;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.12);border-radius:6px;color:inherit;padding:7px 9px;font-family:inherit;font-size:12px;line-height:1.5;box-sizing:border-box;min-height:52px;transition:border-color .2s,box-shadow .2s;}
.ls-textarea-field:focus{outline:none;border-color:rgba(255,70,110,.6);box-shadow:0 0 0 2px rgba(255,70,110,.1);}
.ls-card{display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;padding:8px;border-radius:8px;background:rgba(255,255,255,.02);}
.ls-card-pos{border:1px solid rgba(80,220,120,.3);}.ls-card-neg{border:1px solid rgba(255,90,90,.3);}.ls-card-neu{border:1px solid rgba(140,110,220,.25);}
.ls-heart-box{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:44px;}.ls-heart-icon{font-size:20px;line-height:1;}
.ls-del-btn{padding:3px 7px!important;min-width:unset!important;align-self:flex-start;opacity:.5;transition:opacity .15s;}.ls-del-btn:hover{opacity:1;}
.ls-range-box{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:108px;}.ls-range-box span{font-size:9px;font-weight:700;color:rgba(160,130,230,.8);line-height:1;}.ls-range-inner{display:flex;align-items:center;gap:4px;}
.ls-add-btn{width:100%;margin-top:4px;}
#ls-active-state{margin-bottom:6px;padding:8px 10px;border-radius:8px;background:rgba(255,80,110,.08);border:1px solid rgba(255,80,110,.3);font-size:12px;line-height:1.5;color:rgba(255,210,220,.9);}
#ls-active-state strong{color:rgba(255,120,150,1);}
input[type=range].ls-size-slider{flex:1;accent-color:#ff4d6d;}
`;
  document.head.appendChild(el);
}

function buildHeartSVG(score,max){
  const ratio=Math.max(0,Math.min(1,score/max)),fY=(95*(1-ratio)).toFixed(2),fH=(95*ratio).toFixed(2),col=heartColor(score,max);
  const P='M50,85 C50,85 8,58 8,32 C8,16 20,6 34,6 C43,6 49,11 50,16 C51,11 57,6 66,6 C80,6 92,16 92,32 C92,58 50,85 50,85 Z';
  return `<svg id="ls-heart-svg" viewBox="0 0 100 95" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible;">
  <defs><clipPath id="ls-hclip"><path d="${P}"/></clipPath></defs>
  <path d="${P}" fill="rgba(22,10,16,.88)" stroke="rgba(255,90,120,.45)" stroke-width="2.5"/>
  <rect id="ls-heart-fill" x="0" y="${fY}" width="100" height="${fH}" clip-path="url(#ls-hclip)" fill="${col}" opacity="0.92"/>
  <text id="ls-score-main" x="50" y="43" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="17" font-weight="700" font-family="system-ui,sans-serif">${score}</text>
  <text id="ls-score-denom" x="50" y="62" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,.6)" font-size="10" font-family="system-ui,sans-serif">/${max}</text>
  </svg><div id="ls-status-tip"></div>`;
}

function applyWidgetSize(sz){
  const w=document.getElementById('ls-widget'); if(!w) return;
  w.style.width=sz+'px'; w.style.height=Math.round(sz*0.94)+'px';
}

function clampWidget(){
  const w=document.getElementById('ls-widget'); if(!w) return;
  const wW=w.offsetWidth||64, wH=w.offsetHeight||60;
  const vW=window.innerWidth, vH=window.innerHeight;
  let left=parseFloat(w.style.left), bot=parseFloat(w.style.bottom);
  if(isNaN(left)) left=vW/2-wW/2;
  if(isNaN(bot))  bot=84;
  left=Math.max(8,Math.min(vW-wW-8,left));
  bot =Math.max(8,Math.min(vH-wH-8,bot));
  w.style.left=left+'px'; w.style.right='auto'; w.style.bottom=bot+'px'; w.style.top='auto';
}

function createWidget(){
  if(document.getElementById('ls-widget'))return;
  injectStyles();
  const d=loveData(),c=cfg(),w=document.createElement('div');
  w.id='ls-widget';
  w.innerHTML=buildHeartSVG(d.score,d.maxScore);
  document.body.appendChild(w);
  applyWidgetSize(c.widgetSize||64);
  const pos=c.widgetPos;
  if(pos){ w.style.left=pos.left; w.style.right='auto'; w.style.bottom=pos.bottom; w.style.top='auto'; }
  else   { w.style.left=(window.innerWidth/2-(c.widgetSize||64)/2)+'px'; w.style.right='auto'; w.style.bottom='84px'; w.style.top='auto'; }
  setTimeout(clampWidget,0);
  window.addEventListener('resize',clampWidget);
  window.addEventListener('orientationchange',()=>setTimeout(clampWidget,250));
  makeDraggable(w);
}

function makeDraggable(w){
  let drag=false,moved=false,ox,oy,sL,sB;
  w.addEventListener('pointerdown',e=>{
    drag=true;moved=false;ox=e.clientX;oy=e.clientY;
    const r=w.getBoundingClientRect();sL=r.left;sB=window.innerHeight-r.bottom;
    w.setPointerCapture(e.pointerId);w.style.transition='none';
    w.style.filter='drop-shadow(0 8px 28px rgba(255,60,100,.7))';
  });
  w.addEventListener('pointermove',e=>{
    if(!drag)return;
    const dx=e.clientX-ox,dy=e.clientY-oy;
    if(!moved&&(Math.abs(dx)>5||Math.abs(dy)>5))moved=true;
    if(!moved)return;
    const nL=Math.max(8,Math.min(window.innerWidth -w.offsetWidth -8,sL+dx));
    const nB=Math.max(8,Math.min(window.innerHeight-w.offsetHeight-8,sB-dy));
    w.style.left=nL+'px';w.style.right='auto';w.style.bottom=nB+'px';w.style.top='auto';
  });
  w.addEventListener('pointerup',()=>{
    if(!drag)return;drag=false;
    w.style.transition='filter .2s ease';
    w.style.filter='drop-shadow(0 4px 14px rgba(255,60,100,.35))';
    if(!moved){
      document.getElementById('extensionsMenuButton')?.click();
      setTimeout(()=>document.getElementById('ls-settings-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),300);
    } else { clampWidget(); cfg().widgetPos={left:w.style.left,bottom:w.style.bottom}; saveSettingsDebounced(); }
  });
}

function refreshWidget(){
  const c=cfg(),d=loveData(),w=document.getElementById('ls-widget');
  if(!w)return;
  w.style.display=c.isEnabled?'block':'none';
  const ratio=Math.max(0,Math.min(1,d.score/d.maxScore));
  const fill=document.getElementById('ls-heart-fill');
  if(fill){fill.setAttribute('y',(95*(1-ratio)).toFixed(2));fill.setAttribute('height',(95*ratio).toFixed(2));fill.setAttribute('fill',heartColor(d.score,d.maxScore));}
  const main=document.getElementById('ls-score-main');if(main)main.textContent=d.score;
  const den=document.getElementById('ls-score-denom');if(den)den.textContent='/'+d.maxScore;
  const tip=document.getElementById('ls-status-tip');if(tip)tip.textContent=getActiveInterp()?.description?.trim()||('Расположение: '+d.score+'/'+d.maxScore);
}
function pulseWidget(){const w=document.getElementById('ls-widget');if(!w)return;w.classList.remove('ls-beat');void w.offsetWidth;w.classList.add('ls-beat');}

function settingsPanelHTML(){
  return `<div id="ls-settings-panel" class="extension-settings">
<div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>&#10084;&#65039; Расположение</b>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    <div class="ls-row">
      <label class="checkbox_label" for="ls-enabled"><input type="checkbox" id="ls-enabled"><span>Включено</span></label>
    </div>
    <div class="ls-row">
      <span style="font-size:13px;">Значение:</span>
      <input id="ls-val" type="number" min="0" class="ls-num-input" style="width:64px;">
      <span style="opacity:.5;">/</span>
      <input id="ls-max" type="number" min="1" class="ls-num-input" style="width:64px;">
      <button id="ls-reset-btn" class="menu_button">&#8635; Сбросить</button>
    </div>
    <div class="ls-row" style="align-items:center;gap:10px;">
      <span style="font-size:12px;white-space:nowrap;">&#128149; Размер:</span>
      <input type="range" id="ls-size" min="36" max="128" step="4" class="ls-size-slider" style="flex:1;">
      <span id="ls-size-label" style="font-size:12px;min-width:38px;text-align:right;">64px</span>
      <button id="ls-center-btn" class="menu_button" title="Поставить по центру экрана">&#8982; Центр</button>
    </div>
    <div id="ls-active-state" style="display:none;"><strong>Сейчас:</strong><br><span id="ls-active-text"></span></div>
    <div class="ls-section-title">&#128200; Правила изменения</div>
    <div class="ls-hint">&#10084;&#65039; &mdash; насколько растёт &nbsp;&nbsp; &#128148; &mdash; насколько падает</div>
    <div id="ls-changes-container"></div>
    <div class="ls-section-title">&#127917; Поведение персонажа</div>
    <div class="ls-hint">Активный диапазон напрямую влияет на поведение ИИ.</div>
    <div id="ls-interp-container"></div>
    <div class="ls-row" style="margin-top:10px;">
      <label class="checkbox_label" for="ls-gradual">
        <input type="checkbox" id="ls-gradual">
        <span>Медленное изменение (без резких скачков)</span>
      </label>
    </div>
  </div>
</div>
</div>`;
}

function renderChanges(){
  const ct=document.getElementById('ls-changes-container');if(!ct)return;
  const d=loveData(),ch=d.scoreChanges||[];let html='';
  ch.forEach((c,i)=>{
    const pos=c.delta>=0,cls=pos?'ls-card-pos':'ls-card-neg';
    const icon=pos?'\u2764\uFE0F':'\uD83D\uDC94';
    const ph=pos?'Что заставляет сердце потеплеть...':'Что ранит или отталкивает...';
    html+=`<div class="ls-card ${cls}" data-idx="${i}">
  <div class="ls-heart-box">
    <span class="ls-heart-icon">${icon}</span>
    <input type="number" class="ls-delta-input ls-num-input" value="${c.delta}" data-idx="${i}" style="width:52px;font-weight:700;font-size:14px;">
  </div>
  <textarea class="ls-change-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="${ph}">${escHtml(c.description)}</textarea>
  <button class="ls-del-change menu_button ls-del-btn" data-idx="${i}" title="Удалить">&#10005;</button>
</div>`;
  });
  html+='<button id="ls-add-change" class="menu_button ls-add-btn">&#10084;&#65039; Добавить правило</button>';
  ct.innerHTML=html; bindChangesEv();
}

function renderInterps(){
  const ct=document.getElementById('ls-interp-container');if(!ct)return;
  const d=loveData(),arr=d.scaleInterpretations||[];let html='';
  arr.forEach((ip,i)=>{
    const act=d.score>=ip.min&&d.score<=ip.max;
    const st=act?'border-color:rgba(255,80,110,.7);background:rgba(255,80,110,.07);':'';
    html+=`<div class="ls-card ls-card-neu" data-idx="${i}" style="${st}">
  <div class="ls-range-box">
    <span>${act?'&#9658; сейчас':'диапазон'}</span>
    <div class="ls-range-inner">
      <input type="number" class="ls-interp-min ls-num-input" value="${ip.min}" data-idx="${i}" style="width:44px;" min="0">
      <span style="opacity:.45;">&#8211;</span>
      <input type="number" class="ls-interp-max ls-num-input" value="${ip.max}" data-idx="${i}" style="width:44px;" min="0">
    </div>
  </div>
  <textarea class="ls-interp-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="Как персонаж говорит, смотрит, держится при этом уровне...">${escHtml(ip.description)}</textarea>
  <button class="ls-del-interp menu_button ls-del-btn" data-idx="${i}" title="Удалить">&#10005;</button>
</div>`;
  });
  html+='<button id="ls-add-interp" class="menu_button ls-add-btn">+ Добавить диапазон</button>';
  ct.innerHTML=html;
  const act=getActiveInterp(),box=document.getElementById('ls-active-state'),txt=document.getElementById('ls-active-text');
  if(box&&txt){if(act?.description?.trim()){txt.textContent=act.description.trim();box.style.display='block';}else{box.style.display='none';}}
  bindInterpEv();
}

function bindChangesEv(){
  $('.ls-delta-input').off('change').on('change',function(){loveData().scoreChanges[+$(this).data('idx')].delta=parseInt(this.value)||0;saveSettingsDebounced();updatePromptInjection();renderChanges();});
  $('.ls-change-desc').off('input').on('input',function(){loveData().scoreChanges[+$(this).data('idx')].description=this.value;saveSettingsDebounced();updatePromptInjection();});
  $('.ls-del-change').off('click').on('click',function(){loveData().scoreChanges.splice(+$(this).data('idx'),1);saveSettingsDebounced();updatePromptInjection();renderChanges();});
  $('#ls-add-change').off('click').on('click',()=>{loveData().scoreChanges.push({delta:1,description:''});saveSettingsDebounced();renderChanges();});
}
function bindInterpEv(){
  $('.ls-interp-min').off('change').on('change',function(){loveData().scaleInterpretations[+$(this).data('idx')].min=parseInt(this.value)||0;saveSettingsDebounced();updatePromptInjection();renderInterps();});
  $('.ls-interp-max').off('change').on('change',function(){loveData().scaleInterpretations[+$(this).data('idx')].max=parseInt(this.value)||0;saveSettingsDebounced();updatePromptInjection();renderInterps();});
  // NO renderInterps() here — prevents focus loss while typing
  $('.ls-interp-desc').off('input').on('input',function(){loveData().scaleInterpretations[+$(this).data('idx')].description=this.value;saveSettingsDebounced();updatePromptInjection();});
  $('.ls-del-interp').off('click').on('click',function(){loveData().scaleInterpretations.splice(+$(this).data('idx'),1);saveSettingsDebounced();updatePromptInjection();renderInterps();});
  $('#ls-add-interp').off('click').on('click',()=>{const a=loveData().scaleInterpretations;const lm=a[a.length-1]?.max??0;a.push({min:lm+1,max:lm+10,description:''});saveSettingsDebounced();renderInterps();});
}

function buildPrompt(){
  const c=cfg(),d=loveData();if(!c.isEnabled)return'';
  const changes=(d.scoreChanges||[]).filter(x=>x.description.trim());
  const interps=(d.scaleInterpretations||[]).filter(x=>x.description.trim());
  const active=getActiveInterp();
  let p='[OOC - LOVE SCORE SYSTEM]';
  if(active?.description?.trim()){
    p+='\n\nCurrent love score: '+d.score+'/'+d.maxScore+'.';
    p+='\n\nCURRENT BEHAVIOR (score '+d.score+'):\n'+active.description.trim();
    p+='\n\nPortray the character strictly according to this description.';
  } else { p+='\n\nCurrent love score: '+d.score+'/'+d.maxScore+'.'; }
  if(changes.length){p+='\n\nLove Score Changes:';changes.forEach(x=>{p+='\n'+(x.delta>=0?'+':'')+x.delta+': '+x.description.trim();});}
  if(interps.length){p+='\n\nLove Scale Interpretations:';interps.forEach(x=>{const m=(d.score>=x.min&&d.score<=x.max)?' <- NOW':'';p+='\nLove '+x.min+'-'+x.max+': '+x.description.trim()+m;});}
  if(c.gradualProgression)p+='\n\nGradual Progression: change score incrementally, +1/-1 is normal per response.';
  p+='\n\nAt the end of each response include:\n<!-- [LOVE_SCORE:X] -->\nReplace X with the updated integer (0-'+d.maxScore+').';
  return p;
}
function updatePromptInjection(){
  try{setExtensionPrompt(PROMPT_KEY,'',extension_prompt_types.IN_CHAT,0);if(!cfg().isEnabled)return;const p=buildPrompt();setTimeout(()=>setExtensionPrompt(PROMPT_KEY,p,extension_prompt_types.IN_CHAT,0),50);}catch(e){console.error('[LoveScore]',e);}
}
function onMessageReceived(){
  if(!cfg().isEnabled)return;
  try{
    const chat=typeof SillyTavern?.getContext==='function'?SillyTavern.getContext().chat:window.chat;
    if(!chat?.length)return;
    const msg=chat[chat.length-1];if(!msg||msg.is_user)return;
    const match=(msg.mes||'').match(/<!--\s*\[LOVE_SCORE:(\d+)\]\s*-->/i);if(!match)return;
    const d=loveData(),nv=parseInt(match[1],10),ov=d.score;
    d.score=Math.max(0,Math.min(nv,d.maxScore));
    if(ov!==d.score){pulseWidget();refreshWidget();syncUI();}
    saveSettingsDebounced();updatePromptInjection();
  }catch(e){console.error('[LoveScore] parse',e);}
}

function syncUI(){
  const c=cfg(),d=loveData(),el=id=>document.getElementById(id);
  const cb=el('ls-enabled');if(cb)cb.checked=c.isEnabled;
  const v=el('ls-val');if(v)v.value=d.score;
  const m=el('ls-max');if(m)m.value=d.maxScore;
  const gr=el('ls-gradual');if(gr)gr.checked=c.gradualProgression??true;
  const sz=el('ls-size');const lbl=el('ls-size-label');
  if(sz){sz.value=c.widgetSize||64;if(lbl)lbl.textContent=(c.widgetSize||64)+'px';}
  renderChanges();renderInterps();refreshWidget();
}
function bindMainEvents(){
  $('#ls-enabled').off('change').on('change',function(){cfg().isEnabled=this.checked;saveSettingsDebounced();updatePromptInjection();refreshWidget();});
  $('#ls-val').off('change').on('change',function(){const d=loveData();d.score=Math.max(0,Math.min(parseInt(this.value)||0,d.maxScore));saveSettingsDebounced();updatePromptInjection();refreshWidget();renderInterps();});
  $('#ls-max').off('change').on('change',function(){const d=loveData(),c=cfg();d.maxScore=Math.max(1,parseInt(this.value)||100);c.maxScore=d.maxScore;if(d.score>d.maxScore)d.score=d.maxScore;saveSettingsDebounced();updatePromptInjection();refreshWidget();});
  $('#ls-reset-btn').off('click').on('click',()=>{loveData().score=0;saveSettingsDebounced();pulseWidget();syncUI();updatePromptInjection();});
  $('#ls-gradual').off('change').on('change',function(){cfg().gradualProgression=this.checked;saveSettingsDebounced();updatePromptInjection();});
  $(document).off('input','#ls-size').on('input','#ls-size',function(){
    const sz=parseInt(this.value);
    const lbl=document.getElementById('ls-size-label');if(lbl)lbl.textContent=sz+'px';
    applyWidgetSize(sz); clampWidget();
    cfg().widgetSize=sz; saveSettingsDebounced();
  });
  $(document).off('click','#ls-center-btn').on('click','#ls-center-btn',()=>{
    const w=document.getElementById('ls-widget');if(!w)return;
    w.style.left=(window.innerWidth/2-w.offsetWidth/2)+'px';
    w.style.right='auto'; w.style.bottom='84px'; w.style.top='auto';
    cfg().widgetPos={left:w.style.left,bottom:w.style.bottom};
    saveSettingsDebounced();
  });
}
jQuery(async()=>{
  if(!extension_settings[EXT_NAME])extension_settings[EXT_NAME]=structuredClone(defaultSettings);
  const c=cfg();
  for(const[k,v]of Object.entries(defaultSettings)){if(c[k]===undefined)c[k]=structuredClone(v);}
  // reset broken off-screen position
  if(c.widgetPos){
    const l=parseFloat(c.widgetPos.left),b=parseFloat(c.widgetPos.bottom);
    if(isNaN(l)||isNaN(b)||l>window.innerWidth||l<-64||b>window.innerHeight||b<-64) c.widgetPos=null;
  }
  $('#extensions_settings').append(settingsPanelHTML());
  createWidget(); bindMainEvents(); syncUI(); updatePromptInjection();
  eventSource.on(event_types.MESSAGE_SENT,()=>updatePromptInjection());
  eventSource.on(event_types.MESSAGE_RECEIVED,onMessageReceived);
  if(event_types.CHAT_CHANGED)eventSource.on(event_types.CHAT_CHANGED,()=>{cfg().lastCheckedMessageId=null;syncUI();updatePromptInjection();});
  console.log('[LoveScore] v8 ready');
});
