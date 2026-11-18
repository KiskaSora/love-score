// History onboarding and relationship overview. Uses the existing Love Score
// classes and colors; no styles or layout assets are replaced.
import { saveSettingsDebounced } from '../../../../script.js';
import { chatLoveData, getChatId, escHtml, toast } from './config.js';
import { relationshipState, characterReply } from './slowburn-core.js';
import { createHistoryDraft, previewHistoryImport, applyHistoryImport, getAutoReviewStatus } from './slowburn-observer.js';

let draft=null,busy=false,opened=false,viewChat=null,actionEpoch=0;
const chat=()=>SillyTavern.getContext().chat||[];
const current=()=>draft?.chatId===getChatId()?draft:null;
const icon=n=>`<i class="fa-solid ${n}"></i>`;
const rerender=()=>document.dispatchEvent(new CustomEvent('ls-history-view'));
const field=(k,label,cap,rows=2)=>`<label for="ls-history-${k}">${label}</label><textarea id="ls-history-${k}" class="text_pole" rows="${rows}" maxlength="${cap}" data-ls-history-field="${k}" style="width:100%">${escHtml(current()?.state?.[k]||'')}</textarea>`;

export function historyImportHTML(){
 if(viewChat!==getChatId()){viewChat=getChatId();opened=false;draft=null;actionEpoch++;}
 const d=chatLoveData(),state=relationshipState(d,chat()),v=current();
 if(!chat().some(characterReply))return '';
 const completed=state.source!=='none';
 if(!opened&&!v&&completed&&!state.invalidBaseline)return `<div class="ls-hint">${icon('fa-check')} Исходное состояние сохранено. <button type="button" class="menu_button" data-ls-act="history-open">Подхватить историю заново</button></div>`;
 if(!opened&&!v&&d._historyDismissed&&!state.invalidBaseline)return `<button type="button" class="menu_button" data-ls-act="history-open">${icon('fa-book-open')} Подхватить текущую историю</button>`;
 let h=`<div class="ls-pbox"><h4>${icon('fa-book-open')} Подхватить текущую историю</h4><div class="ls-hint">${state.invalidBaseline?'История после подхвата изменена: прежнее исходное состояние не используется. ':''}В чате уже есть ${chat().filter(characterReply).length} ответов персонажа. Установим, что между вами сейчас. Очки останутся ${escHtml(String(d.score))} / ${escHtml(String(d.maxScore))}.</div>`;
 if(!v){
  h+=`<div class="ls-actions"><button type="button" class="menu_button" data-ls-act="history-ai"${busy?' disabled':''}>${icon(busy?'fa-circle-notch fa-spin':'fa-wand-magic-sparkles')} ${busy?'Разбираю историю…':'Разобрать историю (1 AI-запрос)'}</button><button type="button" class="menu_button" data-ls-act="history-manual"${busy?' disabled':''}>${icon('fa-pen')} Заполнить вручную</button><button type="button" class="menu_button" data-ls-act="history-dismiss">Позже</button></div><div class="ls-hint">AI покажет черновик перед применением. Длинная история передаётся выборочно и с сокращениями; результат можно исправить. Ручное заполнение не вызывает AI.</div>`;
 }else{
  const c=v.coverage;
  h+=`<div class="ls-hint">Черновик ещё не влияет на игру.${c?` Передано сообщений: ${c.included} из ${c.total}; сокращено: ${c.truncated}.${c.sampled?' Часть истории пропущена.':''}`:' Ручной ввод, без AI-запроса.'} Проверь уже установленную близость.</div>`;
  h+=field('summary','Сейчас между вами',240)+field('allowed','Какая близость уже допустима',180)+field('barrier','Что его сдерживает / оставшаяся граница',180)+field('next','Ближайшая небольшая инициатива',160);
  h+=`<details class="ls-adv"><summary>Память и независимые шкалы</summary>${field('memory','Полная память',1200,4)}<div class="ls-hint">Шкалы от 0 до 10. Можно оставить пустыми; они не открывают близость.</div>`;
  for(const [k,label]of Object.entries({feelings:'Чувства',trust:'Доверие',readiness:'Готовность к близости'}))h+=`<div class="ls-setup-row"><label for="ls-history-${k}">${label}</label><input class="ls-num-input" type="number" min="0" max="10" step="0.1" id="ls-history-${k}" data-ls-history-meter="${k}" value="${escHtml(String(v.state.meters?.[k]??''))}"></div>`;
  h+=`</details><div class="ls-actions"><button type="button" class="menu_button" data-ls-act="history-apply">${icon('fa-check')} Применить без изменения очков</button><button type="button" class="menu_button" data-ls-act="history-cancel">Отменить</button></div>`;
 }
 return h+'</div>';
}

export function relationshipOverviewHTML(){
 const {record:r,invalidBaseline}=relationshipState(chatLoveData(),chat());
 const box=(label,value,ic)=>`<div class="ls-pbox"><h4>${icon(ic)} ${label}</h4><div class="ls-pre">${escHtml(value)}</div></div>`;
 const s=getAutoReviewStatus();
 return `<div class="ls-now-h"><span class="ls-stage">${icon('fa-heart')} Сейчас между вами</span></div>`
  +box('Отношения',r?.summary||r?.memory?.split('\n')[0].slice(0,240)||(invalidBaseline?'История изменена — обнови исходное состояние.':'Пока действуют карточка и история. Можно подхватить их выше.'),'fa-comments')
  +box('Допустимая близость',r?.allowed||'Только уже установленная в истории; очки не дают новых разрешений.','fa-hand')
  +box('Что его сдерживает',r?.barrier||'Личные границы из карточки персонажа.','fa-mountain')
  +`<div class="ls-step"><small>Ближайшая инициатива</small>${escHtml(r?.next||'Небольшие действия в характере, внутри текущих границ.')}</div><div class="ls-hint">${icon('fa-house')} Локально · до пересмотра ${s.remaining} ответов</div>`;
}

export function captureHistoryInput(target){
 const v=current();if(!v)return;
 const k=target?.dataset?.lsHistoryField,m=target?.dataset?.lsHistoryMeter;
 if(k&&['summary','allowed','barrier','next','memory'].includes(k))v.state[k]=target.value;
 if(m&&['feelings','trust','readiness'].includes(m)){
  v.state.meters||={};if(target.value==='')delete v.state.meters[m];else v.state.meters[m]=Number(target.value);
 }
}

export async function handleHistoryAction(act){
 if(!act.startsWith('history-'))return false;
 try{
  if(act==='history-open'){opened=true;chatLoveData()._historyDismissed=false;}
  else if(act==='history-dismiss'){actionEpoch++;opened=false;draft=null;chatLoveData()._historyDismissed=true;saveSettingsDebounced();}
  else if(act==='history-cancel'){actionEpoch++;draft=null;opened=false;}
  else if(act==='history-ai'){
   if(busy)return true;const ticket=++actionEpoch,id=getChatId();busy=true;rerender();
   try{const preview=await previewHistoryImport();if(ticket===actionEpoch&&id===getChatId()){draft=preview;opened=true;}}finally{busy=false;saveSettingsDebounced();}
  }else if(act==='history-manual'){
   const r=relationshipState(chatLoveData(),chat()).record;
   draft={...createHistoryDraft({summary:r?.summary||'',memory:r?.memory||'',allowed:r?.allowed||'',barrier:r?.barrier||'',next:r?.next||'',meters:{...r?.meters}}),source:'manual'};opened=true;
  }else if(act==='history-apply'){
   if(!current())throw Error('Черновик относится к другому чату');
   applyHistoryImport(current());draft=null;opened=false;chatLoveData()._historyDismissed=false;
   saveSettingsDebounced();document.dispatchEvent(new CustomEvent('ls-history-applied'));
   toast('success','История подхвачена. Очки сохранены; следующий пересмотр — после новых ответов.');
  }
 }catch(e){toast('warning',String(e?.message||e));}
 rerender();return true;
}
