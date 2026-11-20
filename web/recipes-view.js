import { t as tr, formatDate, formatNumber } from './i18n.js';
import { gameName, gameText, gameSearch, searchable, rarityName, installCatalogLanguage } from './catalog-language.js';
import { createRecipeBook, planProduction, getProductionOptions, productionGoal, DEFAULT_PRODUCTION_QUANTITY, setProductionTarget } from './recipe-domain.js';
import { entityImage } from './entity-images.js';
import { assetUrl } from './runtime-config.js';
import { catalogCharacteristics, catalogDropAction, catalogDungeonRewards, catalogEquipmentLabel, catalogMethodLevels, catalogQuestRewards, catalogTrades } from './catalog-details.js';
import { knowledgeLink, skillLink } from './guide-view.js';
import { biomeLinks, biomeListLabel, entityBiomeDetails, methodBiomeDetails } from './biome-view.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => formatNumber(value, 3);
const reasonNames={stock:'Есть в запасах',external:'Получить готовым',gather:'Сбор или добыча',unknown:'Способ не найден в снимке',unsupported:'Требует отдельного расчёта',cycle:'Цепочка остановлена: цикл',limit:'Достигнут предел раскрытия'};
const kinds = {crafting:'Крафт',craft:'Крафт',conversion:'Преобразование',extraction:'Добыча',construction:'Строительство',deconstruction:'Разборка',loot:'Добыча',growth:'Выращивание',placement:'Размещение'};
let book, loading, failure, ui;
const pageSize = 12;
const typeNames={item:'Предмет',cargo:'Груз',family:'Группа предметов',building:'Здание',resource:'Ресурсный узел',enemy:'Враг',chest:'Контейнер'};

export const recipeDefaults = () => ({targetKey:'',quantity:DEFAULT_PRODUCTION_QUANTITY,search:'',tier:'',type:'',rarity:'',rarityPreference:null,showHidden:false,page:0,selections:{},inventory:{},snapshot:''});
export function normalizeRecipeState(raw) {
 const d=recipeDefaults(); if(!raw || typeof raw!=='object')return d;
 for(const key of ['targetKey','search','tier','type','rarity','snapshot'])if(typeof raw[key]==='string')d[key]=raw[key].slice(0,160);
 const preference=raw.rarityPreference;
 if(typeof preference?.key==='string' && /^(item|cargo):\d+$/.test(preference.key) && ['exact','any'].includes(preference.scope)){
  d.rarityPreference={key:preference.key,scope:preference.scope};
 }
 if(Number.isFinite(raw.quantity)&&Number.isInteger(raw.quantity)&&raw.quantity>=0&&raw.quantity<=1e6)d.quantity=raw.quantity;
 d.showHidden=raw.showHidden===true;
 for(const key of ['selections','inventory'])if(raw[key]&&typeof raw[key]==='object'&&!Array.isArray(raw[key]))for(const [id,value]of Object.entries(raw[key]).slice(0,2000)){
  if(!/^(item|cargo|family|building|resource|enemy|chest):/i.test(id)||id.length>160)continue;
  if(key==='selections'&&typeof value==='string'&&value.length>0&&value.length<180)d[key][id]=value;
  if(key==='inventory'&&Number.isFinite(value)&&value>=0&&value<=1e12)d[key][id]=value;
 }
 return d;
}

export function configureRecipes(options){ui=options;}
export function recipeCatalogVersion(){return book?.catalog?.source?.commit||book?.catalog?.meta?.commit||'';}
export function getRecipeBook(){return book;}
export function recipeCatalogError(){return failure;}
export function ensureRecipeCatalog(){
 if(book)return Promise.resolve(book);
 if(loading)return loading;
 failure='';
 loading=(async()=>{
  try{
   const files=await Promise.all(['recipe-catalog.json','catalog-ru.json'].map(async file=>{
    const response=await fetch(assetUrl('data/'+file));
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    return response.json();
   }));
   const [catalog, russian]=files;
   installCatalogLanguage(russian,catalog.source.commit);
   book=createRecipeBook(catalog);
   return book;
  }
  catch(error){failure=error.message;throw error;}
  finally{loading=null;ui?.refresh();}
 })();
 return loading;
}
function loadCatalog(){ensureRecipeCatalog().catch(()=>{});}
const entity = key => book?.entitiesByKey.get(key)||{key,name:key,type:key?.split(':')[0]};
const entityType = e => e.type||e.kind||e.key?.split(':')[0];
const isFamily = e => String(entityType(e)).toLowerCase()==='family';
const isHidden = e => e.visible===false||e.hidden===true||e.compendiumEntry===false||e.compendium_entry===false;
const quantity = stack => stack.quantity??stack.amount??0;
const tierLabel = e => e.tier>0?`T${e.tier}`:'';
const label = key => {const e=entity(key);return `${gameName(e.name)}${e.tier>0?` · T${e.tier}`:''}${isFamily(e)?tr(" · любая редкость"):e.rarity?` · ${rarityName(e.rarity)}`:''}`;};
const link = (key,text) => `<button class="recipe-link" data-action="${key.startsWith('enemy:')?'resource-target':'recipe-target'}" data-id="${escape(key)}"><span class="entity-link-content">${entityImage(entity(key))}<span>${escape(text||label(key))}</span></span></button>`;
function stacks(list){return list?.length?list.map(s=>`${link(s.key)} <b>× ${number(quantity(s))}</b>`).join('<br>'):'—';}
function recipeName(r){return (r.displayName||r.name)?gameName(r.displayName||r.name):`${tr(kinds[r.kind]||r.kind)} #${r.id??r.key}`;}
function methodLabel(r,key){const out=(r.familyOutputs||[]).concat(r.guaranteedOutputs||r.outputs||[]).find(s=>s.key===key),station=r.requirements?.station||r.station;return `${tr(kinds[r.kind]||r.kind||"Рецепт")} · ${recipeName(r)}${out?tr(" · выход {0}", number(quantity(out))):''}${station?.name?` · ${gameName(station.name)}${station.tier>0?` T${station.tier}`:''}`:''}`;}
function time(seconds){return seconds==null?tr("Не определено"):ui.duration(seconds);}
function selectedTarget(s){
 if(s.targetKey)return entity(s.targetKey);
 const first=[...book.entitiesByKey.values()].find(e=>isFamily(e)&&e.tier===6&&/Rathium Pickaxe/i.test(e.name))||[...book.entitiesByKey.values()].find(e=>e.tier===6&&/Rathium Pickaxe/i.test(e.name)&&!isHidden(e));
 if(first)setProductionTarget(s,first.key);
 return first;
}
function matching(s){
 const terms=searchable(s.search).trim().split(/\s+/).filter(Boolean);
 return [...book.entitiesByKey.values()].filter(e=>{
  if(!s.showHidden&&isHidden(e))return false;
  if(s.tier&&String(e.tier)!==s.tier)return false;
  if(s.type&&String(entityType(e)).toLowerCase()!==s.type.toLowerCase())return false;
  if(s.rarity&&(isFamily(e)||e.rarity!==s.rarity))return false;
  const text=gameSearch(e.name,e.tag,e.key,tierLabel(e),/pickaxe/i.test(e.name)?'кирка кирки':'');
  return terms.every(term=>text.includes(term));
 }).sort((a,b)=>Number(isFamily(b))-Number(isFamily(a))||a.name.localeCompare(b.name)||a.tier-b.tier);
}
export function recipeResults(s){
 if(!book)return '';
 const list=matching(s),pages=Math.max(1,Math.ceil(list.length/pageSize));s.page=Math.max(0,Math.min(s.page,pages-1));
 return `<div class="recipe-result-count" role="status">${tr("Найдено: {0} · страница {1} из {2}", number(list.length), s.page+1, pages)}</div><div class="recipe-search-results">${list.slice(s.page*pageSize,(s.page+1)*pageSize).map(e=>`<button class="recipe-search-item ${s.targetKey===e.key?'selected':''}" data-action="recipe-target" data-id="${escape(e.key)}" aria-pressed="${s.targetKey===e.key}">${entityImage(e,{size:'md'})}<span><b>${escape(gameName(e.name))}</b><small>${[tierLabel(e),isFamily(e)?tr("Любая редкость"):rarityName(e.rarity),tr(typeNames[entityType(e)]||entityType(e)),gameText(e.tag)].filter(Boolean).map(escape).join(' · ')}</small>${[catalogEquipmentLabel(book,e.key),biomeListLabel(book,e.key)].filter(Boolean).map(note=>`<span class="catalog-list-note">${escape(note)}</span>`).join('')}</span>${ui.icon('arrow')}</button>`).join('')||`<div class="empty"><h3>${tr("Ничего не найдено")}</h3><p>${tr("Измени запрос или сбрось фильтры.")}</p><button class="secondary" data-action="recipe-reset">${tr("Сбросить фильтры")}</button></div>`}</div><div class="recipe-pagination"><button class="secondary" data-action="recipe-page" data-delta="-1" ${s.page===0?'disabled':''}>${tr("Назад")}</button><button class="secondary" data-action="recipe-page" data-delta="1" ${s.page>=pages-1?'disabled':''}>${tr("Далее {0}", ui.icon('arrow'))}</button></div>`;
}
export function recipesView(s){
 if(!book){if(!failure)loadCatalog();return `<section class="card card-pad" role="status"><h2>${failure?tr("Не удалось открыть рецептурную книгу"):tr("Открываем рецептурную книгу…")}</h2><p class="subtitle">${failure?escape(failure):tr("Загружаем каталог. При первом открытии требуется подключение; после подготовки доступна работа без сети.")}</p>${failure?`<button class="secondary" data-action="recipe-retry">${tr("Повторить")}</button>`:''}</section>`;}
 const target=selectedTarget(s),version=recipeCatalogVersion();if(!s.snapshot)s.snapshot=version;
 const snapshot=book.catalog.source?.committedAt||book.catalog.meta?.committedAt||'2026-11-13';
 return `<div class="recipe-book"><div class="recipe-source-note">${ui.icon('book')}<span>${tr("BitCraftToolBox · снимок {0} · {1} способов получения. Текущий сервер может отличаться.", escape(formatDate(snapshot.slice(0,10))), number(book.catalog.recipes.length))}</span></div>${s.snapshot&&version&&s.snapshot!==version?`<div class="warning">${tr("Версия базы отличается от сохранённого плана. Проверь цепочку и сохрани обновлённый расчёт.")}</div>`:''}<div class="recipe-workspace"><aside class="stack"><section class="card card-pad recipe-catalog"><div class="section-title"><h2>${tr("{0}Рецептурная книга", ui.icon('book'))}</h2><button class="text-button" data-action="recipe-reset">${tr("Сбросить")}</button></div><label class="field"><span>${tr("Найти предмет")}</span><input id="recipe-search" type="search" value="${escape(s.search)}" placeholder="${tr("Pickaxe, кирка, Rathium…")}" maxlength="160" autocomplete="off"></label><div class="row"><label class="field"><span>${tr("Тир")}</span><select data-recipe-filter="tier"><option value="">${tr("Все тиры")}</option>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${s.tier===String(i+1)?'selected':''}>T${i+1}</option>`).join('')}</select></label><label class="field"><span>${tr("Тип")}</span><select data-recipe-filter="type">${[['',tr("Все типы")],['Family',tr("Любая редкость")],['Item',tr("Предметы")],['Cargo',tr("Грузы")],['Building',tr("Здания")],['resource',tr("Ресурсные узлы")],['enemy',tr("Враги")],['chest',tr("Контейнеры")]].map(([value,text])=>`<option value="${value}" ${s.type===value?'selected':''}>${text}</option>`).join('')}</select></label></div><label class="field"><span>${tr("Редкость")}</span><select data-recipe-filter="rarity"><option value="">${tr("Все редкости")}</option>${['Common','Uncommon','Rare','Epic','Legendary','Mythic'].map(r=>`<option value="${r}" ${s.rarity===r?'selected':''}>${escape(rarityName(r))}</option>`).join('')}</select></label><label class="recipe-checkbox"><input type="checkbox" data-recipe-filter="showHidden" ${s.showHidden?'checked':''}>${tr("Показать служебные записи")}</label><div id="recipe-results">${recipeResults(s)}</div></section></aside><div class="stack recipe-detail">${target?targetView(s,target):`<section class="card empty"><h3>${tr("Выбери конечный предмет")}</h3><p>${tr("Найди его в рецептурной книге слева.")}</p></section>`}</div></div></div>`;
}

function targetView(s,target){
 const goal=productionGoal(book,target.key,s);
 const usesFamily=goal.key!==target.key;
 const methods=getProductionOptions(book,target.key).map(x=>x.recipe);
 const missingTarget=!book.entitiesByKey.has(target.key);
 let plan,error;try{plan=planProduction(book,goal.key,s.quantity,{inventory:s.inventory,selections:s.selections});}catch(e){error=e.message;}
 const raritySelector=goal.familyKey?`<label class="field"><span>${tr("Редкость в плане")}</span><select data-recipe-rarity="${escape(target.key)}">
   <option value="any" ${usesFamily?'selected':''}>${tr("Любая редкость")}</option>
   <option value="exact" ${!usesFamily?'selected':''}>${tr("Точная · {0}", escape(rarityName(target.rarity)))}</option>
 </select></label>`:'';
 const scopeNote=usesFamily?`<p class="recipe-explanation">${tr("План учитывает запасы всех вариантов этого тира. Редкость результата зависит от исхода крафта.")}</p>`
   :isFamily(target)?`<p class="recipe-explanation">${tr("План по типу и тиру предмета. Редкость результата может повыситься; конкретная редкость не гарантируется.")}</p>`
   :goal.familyKey?`<p class="recipe-explanation">${tr("Конкретная редкость выпадает случайно. Для расчёта количества по тиру выбери «Любая редкость».")}</p>`:'';
 const tradeSources=catalogTrades(book,target.key,'gives',link),questSources=catalogQuestRewards(book,target.key);
 const dungeonSources=catalogDungeonRewards(book,target.key);
 return `${missingTarget?`<div class="warning">${tr("Сохранённая цель отсутствует в текущем снимке. Выбери предмет из каталога; исходная цель плана сохранена.")}</div>`:''}<section class="card card-pad"><div class="recipe-target-heading"><div class="item-emblem">${entityImage(target,{size:'lg',quantity:s.quantity})}</div><div><p class="eyebrow">${tr("КОНЕЧНЫЙ ПРЕДМЕТ")}</p><h2>${escape(gameName(target.name))}</h2><p class="subtitle">${[tierLabel(target),isFamily(target)?tr("Любая редкость"):rarityName(target.rarity),gameText(target.tag)].filter(Boolean).map(escape).join(' · ')}</p></div></div>${target.description?`<p class="recipe-description">${escape(gameText(target.description))}</p>`:''}${entityBiomeDetails(book,target)}${raritySelector}${scopeNote}<div class="row"><label class="field"><span>${tr("Нужно получить, шт.")}</span><input data-key="recipeBook.quantity" type="number" value="${s.quantity}" min="0" max="1000000" step="1"></label><label class="field"><span>${usesFamily?tr("В запасе {0}, шт.", escape(rarityName(target.rarity))):tr("Уже есть цель, шт.")}</span><input data-recipe-stock="${escape(target.key)}" type="number" value="${s.inventory[target.key]||0}" min="0" max="1000000000000" step="any"></label></div><label class="field"><span>${tr("Способ получения цели")}</span>${methodSelect(goal.key,plan?.tree?.recipeKey,s.selections[goal.key])}</label><button class="primary full" data-action="save" data-type="recipeBook">${tr("{0}Сохранить план", ui.icon('save'))}</button></section>${catalogCharacteristics(book,target,{link,duration:ui.duration})}${error?`<div class="error">${escape(error)}</div>`:planView(s,plan)}<section class="card card-pad" id="recipe-acquisition"><div class="section-title"><h2>${tr("{0}Получение и рецепты", ui.icon('info'))}</h2>${methods.length?`<span class="badge">${methods.length}</span>`:''}</div>${tradeSources}${questSources}${dungeonSources}${methods.length?methods.map(r=>methodDetails(r,target.key)).join(''):tradeSources||questSources||dungeonSources?'':`<p class="subtitle">${tr("Способы получения не найдены в этом снимке. Это не означает, что предмет недоступен в игре.")}</p>`}${originView(target.key)}</section>${usesView(target.key)}`;
}
function methodSelect(key,recipeKey,selection){
 const methods=getProductionOptions(book,key).filter(option=>option.eligible);
 const actual=methods.find(option=>option.recipe.key===recipeKey);
 const unavailable=selection&&selection!=='external'&&!methods.some(option=>option.recipe.key===selection);
 return `<select data-recipe-method="${escape(key)}" aria-label="${tr("Способ: {0}", escape(label(key)))}">
   <option value="" ${!selection?'selected':''}>${tr("Автоматически{0}", actual?' · '+escape(methodLabel(actual.recipe,key)):'')}</option>
   ${unavailable?`<option value="${escape(selection)}" selected disabled>${tr("Сохранённый способ недоступен для расчёта")}</option>`:''}
   ${methods.map(({recipe:r})=>`<option value="${escape(r.key)}" ${selection===r.key?'selected':''}>${escape(methodLabel(r,key))}</option>`).join('')}
   <option value="external" ${selection==='external'?'selected':''}>${tr("Получить извне / остановить цепочку")}</option>
 </select>`;
}
function methodDetails(r,targetKey){
 const req=r.requirements||{},seconds=r.seconds??r.baseSeconds,outcomes=r.outcomeGroups||r.outcomes||[];
 const sourceUrl=r.source?.table&&book.catalog.source?.tableBaseUrl?book.catalog.source.tableBaseUrl+r.source.table+'.json':'';
 return `<details class="recipe-method" data-recipe-details="${escape(r.key)}"><summary>${escape(methodLabel(r,targetKey))}${catalogMethodLevels(req)}</summary><div class="recipe-method-body"><dl class="recipe-facts"><dt>${tr("Ингредиенты за операцию")}</dt><dd>${stacks(r.inputs||r.ingredients)}</dd><dt>${tr("Гарантированный выход")}</dt><dd>${stacks(isFamily(entity(targetKey))?r.familyOutputs:r.outputs)}</dd><dt>${tr("Базовое время")}</dt><dd>${time(seconds)}</dd></dl>${requirementsView(req)}${methodBiomeDetails(book,r)}${catalogDropAction(r,targetKey)}${r.origins?.length?`<p class="recipe-explanation">${tr("Источник: {0}", r.origins.map(o=>link(o.key,gameName(o.name)+(o.tier>0?' · T'+o.tier:''))).join(', '))}</p>`:''}${r.time?.requirement!=null?`<p class="recipe-explanation">${tr("{0} · {1} сек{2}.", r.time.passive?tr("Пассивная обработка"):tr("Активный крафт"), number(r.time.requirement), r.time.passive?tr(" на операцию"):tr(" на действие · прогресс партии {0}", number(r.time.actions)))}</p>`:''}${outcomes.length?`<details><summary>${tr("Возможные исходы ({0})", outcomes.length)}</summary>${outcomes.slice(0,40).map(o=>`<div class="recipe-outcome">${o.chance!=null?tr("Шанс исхода: {0}% · ", number(o.chance*100)):o.probability!=null?tr("Вес исхода: {0} · ", number(o.probability)):''}${stacks(o.items||o.outputs)}</div>`).join('')}${outcomes.length>40?`<p class="subtitle">${tr("Показаны первые 40 исходов.")}</p>`:''}<p class="recipe-explanation">${tr("Шанс относится к одному выбору исхода. Он не пересчитывается в шанс на удар или на ресурсный узел.")}</p></details>`:''}${!outcomes.length&&r.possibleOutputs?.length?`<details><summary>${tr("Возможная добыча")}</summary>${stacks(r.possibleOutputs)}<p class="recipe-explanation">${tr("Наличие в списке не гарантирует результат операции.")}</p></details>`:''}${r.unsupportedReason?`<p class="recipe-explanation">${escape(tr(r.unsupportedReason))}</p>`:''}<p class="recipe-record">${sourceUrl?`<a href="${escape(sourceUrl)}" target="_blank" rel="noreferrer">${tr("Таблица источника ↗")}</a> ${tr("· запись № {0}", escape(r.source.id))}`:tr("Запись: ")+escape(r.key)}</p></div></details>`;
}
function requirementsView(req){
 const rows=[];
 if(req.station){const station=req.station;rows.push([tr("Станция"),escape(gameName(station.name))+(station.tier>0?' · T'+station.tier:'')+(station.buildings?.length?'<br>'+station.buildings.map(building=>link(building.key,gameName(building.name))).join('<br>'):'')]);}
 if(req.skills?.length)rows.push([tr("Навыки"),req.skills.map(skill=>skillLink(book,skill)).join('<br>')]);
 if(req.tools?.length)rows.push([tr("Инструменты"),req.tools.map(x=>escape(gameName(x.name))+(x.level>0?' · T'+x.level:'')+(x.power>0?tr(" · мощность ")+number(x.power):'')).join('<br>')]);
 for(const [key,title]of [['knowledges',tr("Знания")],['blockingKnowledges',tr("Блокирующие знания")]])if(req[key]?.length)rows.push([title,req[key].map(entry=>knowledgeLink(book,entry.id,entry.name)).join('<br>')]);
 if(req.claimTechId)rows.push([tr("Технология поселения"),tr("Требование № ")+escape(req.claimTechId)]);
 if(req.biomes?.length)rows.push([tr("Биомы размещения"),biomeLinks(book,new Set(req.biomes))]);
 return rows.length?`<details class="recipe-requirements"><summary>${tr("Требования и условия")}</summary><dl class="recipe-facts">${rows.map(([title,value])=>`<dt>${title}</dt><dd>${value}</dd>`).join('')}</dl></details>`:'';
}
function originView(key){
 const sources=entity(key).sources||entity(key).origins||[];
 if(!sources.length)return '';
 return `<div class="separator"></div><h3>${tr("Источники в мире")}</h3>${sources.map(source=>`<p class="recipe-explanation">${typeof source==='string'?escape(source):source.key?link(source.key,gameName(source.name||source.label)):escape(gameName(source.name||source.label)||tr("Источник"))}</p>`).join('')}`;
}
function usesView(key){
 const uses=book.recipesConsuming.get(key)||[],trades=catalogTrades(book,key,'takes',link);
 if(!uses.length&&!trades)return '';
 return `<section class="card card-pad"><div class="section-title"><h2>${tr("Использование")}</h2></div>${trades}${uses.length?`<details><summary>${tr("Используется в рецептах · {0}", uses.length)}</summary><div class="recipe-uses">${uses.slice(0,30).map(r=>`<div>${escape(recipeName(r))} → ${stacks(r.familyOutputs?.length?r.familyOutputs:r.outputs)}</div>`).join('')}${uses.length>30?`<p class="subtitle">${tr("Показаны первые 30 рецептов.")}</p>`:''}</div></details>`:''}</section>`;
}
function planView(s,p){
 const materials=p.materials||[],steps=p.steps||[],tree=p.tree;
 const visited=new Set();function collect(n){if(!n)return;visited.add(n.key);for(const c of n.children||[])collect(c);}collect(tree);
 const stockKeys=[...visited].filter(key=>key!==s.targetKey);
 const issues=[...p.issues,...p.assumptions.map(message=>({message}))];
 return `<section class="card card-pad recipe-plan-summary"><p class="eyebrow">${tr("ПЛАН ПРОИЗВОДСТВА · {0} ШТ.", number(s.quantity))}</p><div class="recipe-total-time">${p.totalSeconds==null?tr("Время рассчитано частично"):time(p.totalSeconds)}</div><p class="subtitle">${tr("{0} Сбор, дорога, бонусы персонажа и параллельные станции не включены.", p.totalSeconds==null?tr("Известная часть: {0}.", time(p.knownSeconds||0)):tr("Базовая сумма времени последовательного крафта при скорости ×1, прогрессе 1 за действие и без критов."))}</p><div class="recipe-metrics"><div><b>${number(steps.reduce((sum,x)=>sum+x.batches,0))}</b><span>${tr("операций по цепочке")}</span></div><div><b>${materials.filter(x=>x.missing>0).length}</b><span>${tr("ресурсов получить")}</span></div><div><b>${number(tree?.produced||0)}</b><span>${tr("выход цели")}</span></div></div>${issues.length?`<details class="recipe-issues" open><summary>${tr("Условия расчёта ({0})", issues.length)}</summary><ul>${issues.slice(0,30).map(issue=>`<li>${issue.name?`<b>${escape(gameName(issue.name))}</b> · `:''}${escape(tr(issue.message))}</li>`).join('')}</ul></details>`:''}</section><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Что собрать или получить", ui.icon('cube'))}</h2><button class="text-button" data-action="recipe-copy">${tr("{0}Копировать", ui.icon('book'))}</button></div>${materials.length?`<p class="recipe-explanation">${tr("{0} материалов · прокрути список, чтобы увидеть все источники.", materials.length)}</p><div class="table-wrap recipe-materials-scroll" tabindex="0" aria-label="${tr("Материалы и источники получения")}"><table class="data-table recipe-materials"><thead><tr><th>${tr("Материал")}</th><th>${tr("Всего")}</th><th>${tr("Есть")}</th><th>${tr("Не хватает")}</th></tr></thead><tbody>${materials.map(m=>`<tr><td>${link(m.key)}${m.reason?`<small>${escape(tr(reasonNames[m.reason]||m.reason))}</small>`:''}${originView(m.key)}<details><summary>${tr("Откуда получить")}</summary>${(book.recipesProducing.get(m.key)||[]).slice(0,12).map(r=>methodDetails(r,m.key)).join('')||`<p class="subtitle">${tr("В этом снимке источник не найден.")}</p>`}</details></td><td>${number(m.needed)}</td><td>${number(m.owned)}</td><td><b>${number(m.missing)}</b></td></tr>`).join('')}</tbody></table></div>`:`<p class="subtitle">${tr("Запасы закрывают цель. Получать дополнительные материалы не нужно.")}</p>`}</section><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Состав и цепочка", ui.icon('hammer'))}</h2><span class="badge">${tr("от цели к сырью")}</span></div><p class="recipe-explanation">${tr("Выбери другой рецепт на любом шаге или останови раскрытие, если получаешь материал готовым.")}</p><div class="recipe-tree">${treeView(tree,0,s.selections)}</div></section><section class="card card-pad"><details class="recipe-production-order"><summary>${tr("Порядок производства · {0} шагов", steps.length)}</summary>${steps.length?`<ol class="recipe-steps">${steps.map(step=>`<li><div><span class="entity-link-content">${entityImage(entity(step.targetKey))}<b>${escape(gameName(step.name))}</b></span><small>${tr("{0} операций · выход {1} · {2}", number(step.batches), number(step.produced), time(step.seconds))}</small></div>${step.ingredients?.length?`<div class="subtitle">${stacks(step.ingredients)}</div>`:''}</li>`).join('')}</ol>`:`<p class="subtitle">${tr("Крафт не требуется или для цели выбран внешний источник.")}</p>`}</details>${Object.keys(p.surplus||{}).length?`<details><summary>${tr("Остатки после производства")}</summary><div class="recipe-uses">${Object.entries(p.surplus).filter(([,v])=>v>0).map(([key,value])=>`<div>${escape(label(key))}: ${number(value)}</div>`).join('')}</div></details>`:''}</section>${stockKeys.length?`<section class="card card-pad"><details><summary>${tr("Запасы по цепочке · {0}", stockKeys.length)}</summary><p class="recipe-explanation">${tr("Учитываются один раз для всей цепочки. Запасы готовых изделий сокращают производство предыдущих тиров.")}</p><div class="table-wrap"><table class="data-table"><tbody>${stockKeys.map(key=>`<tr><td><span class="entity-link-content">${entityImage(entity(key))}<span>${escape(label(key))}</span></span></td><td><input class="table-input" type="number" data-recipe-stock="${escape(key)}" value="${s.inventory[key]||0}" min="0" max="1000000000000" step="any" aria-label="${tr("В запасе: {0}", escape(label(key)))}"></td></tr>`).join('')}</tbody></table></div></details></section>`:''}`;
}
function treeView(node,depth,selections){
 if(!node)return '';const e=entity(node.key),children=node.children||[],methods=book.recipesProducing.get(node.key)||[];
 return `<details class="recipe-tree-node" ${depth<2?'open':''}><summary><span class="entity-link-content">${entityImage(e)}<span>${escape(gameName(e.name))}${tierLabel(e)?` <span class="badge">${tierLabel(e)}</span>`:''}${depth===0&&isFamily(e)?` <span class="badge">${tr("Любая редкость")}</span>`:''}</span></span><b>× ${number(node.required)}</b></summary><div class="recipe-tree-body"><p class="subtitle">${tr("Из запасов: {0}{1}{2}", number(node.used||0), node.batches?tr(" · {0} операций · выход {1} · {2}", number(node.batches), number(node.produced), time(node.seconds)):'', node.status?` · ${escape(({external:tr("Получить извне"),stock:tr("Есть в запасах"),cycle:tr("Цепочка остановлена: цикл"),craft:tr("Изготовление"),crafted:tr("Изготовление"),gather:tr("Сбор или добыча"),unknown:tr("Источник не найден в снимке"),limit:tr("Достигнут предел раскрытия"),unsupported:tr("Способ требует отдельного расчёта")})[node.status]||node.status)}`:'')}</p>${methods.length||selections[node.key]?methodSelect(node.key,node.recipeKey,selections[node.key]):''}${children.map(child=>treeView(child,depth+1,selections)).join('')}</div></details>`;
}
export function recipeSummary(s){
 if(!book)throw Error(tr("Дождись загрузки рецептурной книги."));
 const {key}=productionGoal(book,s.targetKey,s);
 const p=planProduction(book,key,s.quantity,{inventory:s.inventory,selections:s.selections});
 return {title:tr("{0} · {1} шт.", label(key), number(s.quantity)),summary:tr("{0} · {1} ресурсов · снимок {2}", p.totalSeconds==null?tr("Время частично"):time(p.totalSeconds), p.materials.filter(m=>m.missing>0).length, recipeCatalogVersion().slice(0,10)),plan:p};
}
export function recipeCopyText(s){const {title,plan:p}=recipeSummary(s);return tr("{0}\n{1}\nБазовое время крафта: {2}\nСбор и дорога не включены.", title, p.materials.map(m=>tr("{0}: получить {1} (всего {2}, есть {3})", label(m.key), number(m.missing), number(m.needed), number(m.owned))).join('\n'), time(p.totalSeconds));}
export function retryRecipes(){failure='';book=null;loadCatalog();}
