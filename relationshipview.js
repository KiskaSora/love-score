// Optional settings editor; opening, typing and saving never call a model.
import { saveSettingsDebounced } from '../../../../script.js';
import { chatLoveData, getChatId, escHtml, reanchorSnapshots, toast } from './config.js';
import { invalidateAutoReview } from './slowburn-observer.js';
import { TYPE_LABELS, RELATION_STATES, relationshipSpec, relationshipLabel, stateLabel, negativeBand, initialColdStart, validateRelationship } from './relationship-model.js';

let draft=null,chatId=null;
const resetChat=()=>{if(chatId!==getChatId()){chatId=getChatId();draft=null;}};
const redraw=()=>document.dispatchEvent(new CustomEvent('ls-relationship-view'));
const selected=(a,b)=>a===b?' selected':'';
const input=(id,label,value,limit)=>`<label for="${id}">${label}</label><input id="${id}" class="text_pole" maxlength="${limit}" value="${escHtml(value||'')}" style="width:100%">`;
const area=(id,label,value,limit)=>`<label for="${id}">${label}</label><textarea id="${id}" class="text_pole" rows="2" maxlength="${limit}" style="width:100%">${escHtml(value||'')}</textarea>`;

export function relationshipSettingsHTML(){
 resetChat();const d=chatLoveData(),spec=relationshipSpec(d),band=negativeBand(d.score,initialColdStart(d));
 let h=`<div class="ls-pbox"><h4><i class="fa-solid fa-link"></i> Связь и отношение</h4><div class="ls-chips"><span class="ls-chip">${escHtml(relationshipLabel(spec))}</span>${spec.states.map(s=>`<span class="ls-chip">${escHtml(stateLabel(s))}</span>`).join('')}${band?`<span class="ls-chip">${escHtml(band)}</span>`:''}</div>`;
 if(!draft)return h+`<div class="ls-actions"><button type="button" class="menu_button" data-ls-act="relation-edit"><i class="fa-solid fa-sliders"></i> Настроить связь</button></div><div class="ls-hint">Вид связи, отношение и готовность к близости независимы.</div></div>`;
 h+=`<div class="ls-setup-row"><label for="ls-relation-type">Основная связь</label><select id="ls-relation-type" class="ls-num-input">${Object.entries(TYPE_LABELS).map(([k,v])=>`<option value="${k}"${selected(draft.type,k)}>${escHtml(v)}</option>`).join('')}</select></div>`;
 if(draft.type==='custom')h+=input('ls-relation-name','Название своей связи',draft.customType.name,60)+area('ls-relation-description','Как эта связь устроена',draft.customType.description,200);
 for(let i=0;i<2;i++){
  const s=draft.states[i];
  h+=`<div class="ls-setup-row"><label for="ls-relation-state-${i}">Состояние ${i+1}</label><select id="ls-relation-state-${i}" class="ls-num-input"><option value="">Не выбрано</option>${Object.entries(RELATION_STATES).map(([k,v])=>`<option value="${k}"${selected(s?.id,k)}>${escHtml(v.label)}</option>`).join('')}<option value="custom"${selected(s?.id,'custom')}>Своё состояние</option></select></div>`;
  if(s?.id==='custom')h+=input(`ls-relation-state-name-${i}`,'Название состояния',s.name,60)+area(`ls-relation-state-description-${i}`,'Как оно проявляется',s.description,100);
 }
 return h+`<div class="ls-hint">До двух состояний. Страх не равен ненависти; привязанность не равна доверию. Свои описания передаются основной модели с учётом карточки и текущих границ. Выбор не меняет очки и не переписывает прожитые события.</div><div class="ls-actions"><button type="button" class="menu_button" data-ls-act="relation-save">Сохранить без AI-запроса</button><button type="button" class="menu_button" data-ls-act="relation-cancel">Отменить</button></div></div>`;
}
export function captureRelationshipInput(target){
 resetChat();if(!draft)return false;const id=target?.id||'';
 if(id==='ls-relation-name')draft.customType.name=target.value;
 else if(id==='ls-relation-description')draft.customType.description=target.value;
 else if(/^ls-relation-state-(name|description)-[01]$/.test(id)){
  const [,field,n]=id.match(/^ls-relation-state-(name|description)-([01])$/);if(draft.states[+n]?.id==='custom')draft.states[+n][field]=target.value;
 }else return false;
 return true;
}
export function changeRelationshipSelection(target){
 resetChat();if(!draft)return false;
 if(target.id==='ls-relation-type')draft.type=target.value;
 else if(/^ls-relation-state-[01]$/.test(target.id)){
  const i=+target.id.at(-1),id=target.value;
  draft.states[i]=id?(id==='custom'?{id,name:'',description:''}:{id}):null;
 }else return false;
 redraw();return true;
}
export function handleRelationshipAction(act){
 if(!act.startsWith('relation-'))return false;resetChat();
 try{
  if(act==='relation-edit')draft=structuredClone(relationshipSpec(chatLoveData()));
  else if(act==='relation-cancel')draft=null;
  else if(act==='relation-save'){
   if(!draft)throw Error('Сначала открой настройку связи');
   const spec=validateRelationship({...draft,states:draft.states.filter(Boolean)}),d=chatLoveData();
   invalidateAutoReview();d.relationType=spec.type;
   d.relationshipContext={customType:spec.customType,states:spec.states,locked:true};
   reanchorSnapshots(d,{relationType:spec.type});draft=null;saveSettingsDebounced();
   document.dispatchEvent(new CustomEvent('ls-relationship-applied'));
   toast('success','Связь сохранена. Очки и прожитые события не изменены.');
  }
 }catch(e){toast('warning',String(e?.message||e));}
 redraw();return true;
}
