// Pure relationship definitions shared by settings, prompts and offline checks.
export const EXTRA_RELATION_TYPES = {
  alliance:{label:'Союз по необходимости',color:'#679fa8',deep:'#31585f',icon:'fa-handshake',desc:'Общая цель без обязательной симпатии.',genGuide:'Cooperate for a concrete goal. Mutual usefulness does not imply trust, friendship or attraction. Improvement means reliability or a workable truce.'},
  mentorship:{label:'Наставничество',color:'#d3aa6b',deep:'#775327',icon:'fa-graduation-cap',desc:'Обучение, признание способностей и ответственность.',genGuide:'A mentor/student dynamic with character-specific expectations. Improvement means earned respect, competence and trust; no automatic romance.'},
  business:{label:'Деловые отношения',color:'#8a9ab5',deep:'#41516d',icon:'fa-briefcase',desc:'Договорённости, выгода и профессиональные границы.',genGuide:'A professional or transactional relationship. Improvement means dependable cooperation and fair dealing, not automatic personal intimacy.'},
  unrequited:{label:'Односторонние чувства',color:'#c987a0',deep:'#76394f',icon:'fa-heart-circle-minus',desc:'Чувства одного не обязывают другого отвечать.',genGuide:'Affection may be one-sided. Infer who feels what from the card/history; never invent reciprocity. Improvement can mean respectful clarity, not reciprocated love.'},
  former:{label:'Бывшие',color:'#ac93b8',deep:'#5a4164',icon:'fa-clock-rotate-left',desc:'Прежняя близость, разрыв и оставшиеся привычки.',genGuide:'Former partners share history. Preserve it without assuming current consent, reconciliation or renewed romance. Improvement means resolving specific hurt or building a new arrangement.'},
  feud:{label:'Кровная вражда',color:'#ae4659',deep:'#5a1522',icon:'fa-bolt',desc:'Личный длительный конфликт с конкретной причиной.',genGuide:'A lasting personal feud rooted in actual events. Positive score change means reduced antagonism, restraint or a possible truce; hatred deepening is negative progress. No automatic attraction or violence.'},
  custom:{label:'Своя связь',color:'#a897bd',deep:'#554468',icon:'fa-pen',desc:'Название и смысл задаются отдельно для этого чата.',genGuide:'Follow the user-defined relationship and the card; no universal romantic ladder.'},
};
export const RELATION_STATES = {
  distrust:{label:'Недоверие',guide:'Questions motives; withholds vulnerability until reliability is earned.'},
  dislike:{label:'Неприязнь',guide:'Personal irritation or avoidance; not automatically hatred.'},
  contempt:{label:'Презрение',guide:'Low respect; acknowledgment must be earned through relevant actions.'},
  hurt:{label:'Обида',guide:'A specific hurt coexists with prior attachment; preserve its cause.'},
  betrayed:{label:'Чувство предательства',guide:'Previously trusted bond was damaged; repair requires addressing the breach.'},
  antagonism:{label:'Враждебность',guide:'Opposes goals or cooperation for established reasons, in character.'},
  hatred:{label:'Ненависть',guide:'Strong sustained aversion with a concrete cause. Improvement means less antagonism, not deeper hate.'},
  fear:{label:'Страх',guide:'Fear is separate from hate, attraction and consent; appeasement does not prove affection.'},
  fixation:{label:'Одержимость',guide:'Intense fixation is separate from trust and reciprocal love; do not turn reduced trust into romantic progress.'},
  attachment:{label:'Сохранившаяся привязанность',guide:'Attachment persists despite distance or conflict; it does not erase boundaries.'},
  respect:{label:'Уважение',guide:'Acknowledges qualities or choices; respect need not mean affection.'},
  wary:{label:'Настороженность',guide:'Reserved and observant; caution need not mean hostility.'},
  thaw:{label:'Потепление',guide:'Small earned easing of distance within current boundaries.'},
  reconciliation:{label:'Попытка примирения',guide:'Tentative repair; unresolved harm is not instantly forgiven.'},
  liking:{label:'Симпатия',guide:'Enjoys this person and wants to know them better; neither romance nor touch is automatic.'},
  tenderness:{label:'Нежность',guide:'Gentleness and small caring gestures within existing boundaries; warmth does not unlock new intimacy.'},
  gratitude:{label:'Благодарность',guide:'Values a specific action without treating it as romantic love, debt or an obligation to reciprocate.'},
  admiration:{label:'Восхищение',guide:'Admires particular qualities; admiration can exist in friendship, rivalry or a professional bond.'},
  safety:{label:'Чувство безопасности',guide:'Can relax and show less defensiveness nearby; trust and physical willingness remain independent.'},
};
const BASE_GUIDES={
 neutral:'Let the card and history define the connection; do not presume romance.',
 romance:'Romantic connection; preserve established reciprocity and limits. Choosing this category does not invent a confession or consent.',
 friendship:'Friendship without presumed romance or sexual desire.',
 family:'Kinship or chosen-family bond; no romantic or sexual framing.',
 platonic:'Deep nonsexual connection; respect card-specific meaning.',
 rival:'Competition and possible respect; neither hatred nor attraction is automatic.',
 obsession:'Unhealthy fixation is not mutual love or trust. Positive progress means reduced harmful antagonism or improved respect, never more coercion.',
 hostile:'Established hatred. Positive progress means reduced hostility or earned restraint; deeper hatred is negative progress. No automatic romance or violence.',
};
export const TYPE_LABELS={neutral:'Нейтрально',romance:'Романтика',friendship:'Дружба',family:'Семья',platonic:'Платоника',rival:'Соперничество',obsession:'Одержимость',hostile:'Ненависть',...Object.fromEntries(Object.entries(EXTRA_RELATION_TYPES).map(([k,v])=>[k,v.label]))};
const clean=(v,n)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
export function normalizeRelationship(value){
 const type=Object.hasOwn(TYPE_LABELS,value?.type)?value.type:'neutral';
 const customType={name:clean(value?.customType?.name,60),description:clean(value?.customType?.description,200)};
 const states=[],seen=new Set();
 for(const s of (Array.isArray(value?.states)?value.states:[])){
  if(states.length===2)break;
  if(s?.id==='custom'){
   const name=clean(s.name,60),description=clean(s.description,100),key='custom:'+name.toLowerCase();
   if(name&&!seen.has(key)){states.push({id:'custom',name,description});seen.add(key);}
  }else if(Object.hasOwn(RELATION_STATES,s?.id)&&!seen.has(s.id)){states.push({id:s.id});seen.add(s.id);}
 }
 return {type,customType,states};
}
export function relationshipSpec(d){return normalizeRelationship({type:d.relationType,customType:d.relationshipContext?.customType,states:d.relationshipContext?.states});}
export function validateRelationship(value){
 const spec=normalizeRelationship(value);
 if(spec.type==='custom'&&(!spec.customType.name||!spec.customType.description))throw Error('У своей связи нужны название и описание');
 const requested=(value.states||[]).filter(Boolean);
 if(requested.some(s=>s.id==='custom'&&(!clean(s.name,60)||!clean(s.description,100))))throw Error('У своего состояния нужны название и описание');
 if(requested.length>2||requested.length!==spec.states.length)throw Error('Выбери до двух разных состояний');
 return spec;
}
export function relationshipLabel(spec){return spec.type==='custom'?(spec.customType.name||TYPE_LABELS.custom):TYPE_LABELS[spec.type];}
export function stateLabel(s){return s.id==='custom'?s.name:RELATION_STATES[s.id]?.label||'';}
export function negativeBand(score,cold=false){
 if(!(score<0))return '';
 if(cold)return 'Холодный старт';
 return score<=-75?'Глубокий конфликт':score<=-40?'Сильный конфликт':'Напряжение';
}
export function initialColdStart(d){return !!d._coldStarted&&!d._autoBaseline&&!(d.scoreLog||[]).some(e=>!String(e.reason||'').includes('холодный старт'));}
export function relationshipGuidance(d){
 const spec=relationshipSpec(d),guide=BASE_GUIDES[spec.type]||EXTRA_RELATION_TYPES[spec.type]?.genGuide||'';
 const states=spec.states.map(s=>s.id==='custom'?s.name+': '+s.description:RELATION_STATES[s.id].label+': '+RELATION_STATES[s.id].guide).join('; ');
 return `Bond: ${relationshipLabel(spec)}. ${spec.type==='custom'?spec.customType.description:guide}\nStates: ${states||'not specified; infer from history'}.\nScore increases ALWAYS mean improved regard/reduced antagonism, never deeper hatred or fixation. Negative depth: ${negativeBand(d.score,initialColdStart(d))||'not set'}; a number does not choose fear, hatred or actions. Card/history and current closeness remain authoritative.`;
}
export function relationshipCue(d){
 const spec=relationshipSpec(d),guide=spec.type==='custom'?spec.customType.description:BASE_GUIDES[spec.type]||EXTRA_RELATION_TYPES[spec.type]?.genGuide||'';
 const states=spec.states.map(s=>stateLabel(s)+': '+(s.id==='custom'?s.description:RELATION_STATES[s.id].guide).slice(0,100)).join('; ');
 return `Bond: ${relationshipLabel(spec)}; ${guide.slice(0,200)}\nStates: ${states||'infer from history'}. ${negativeBand(d.score,initialColdStart(d))?'Conflict depth: '+negativeBand(d.score,initialColdStart(d))+'.':''}`;
}
