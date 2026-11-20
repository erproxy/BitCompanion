import { t as tr, formatDate, formatNumber } from './i18n.js';
import { gameName, gameText, rarityName } from './catalog-language.js';
import { catalogCharacteristics, catalogDropAction, catalogDungeonRewards, catalogMethodLevels, catalogQuestRewards, catalogTrades } from './catalog-details.js';
import { knowledgeLink, skillLink } from './guide-view.js';
import { biomeLinks, biomeListLabel, entityBiomeDetails, methodBiomeDetails } from './biome-view.js';
import { RESOURCE_MODES, RESOURCE_CATEGORIES, CREATURE_CATEGORIES, resourceModeForKey, createResourceIndex, filterResources, resourceProfile, defaultResourceKey } from './resource-domain.js';
import { getProductionOptions, planProduction, productionGoal, DEFAULT_PRODUCTION_QUANTITY, setProductionTarget } from './recipe-domain.js';
import { entityImage } from './entity-images.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => formatNumber(value, 3);
const kinds={crafting:'Крафт',conversion:'Обработка',extraction:'Добыча',deconstruction:'Разборка',construction:'Строительство',growth:'Выращивание',placement:'Размещение',terraform:'Работа с местностью',enemy:'Добыча с врага','resource-destroy':'Разрушение ресурса',chest:'Содержимое контейнера'};
const typeNames={item:'Предмет',cargo:'Груз',resource:'Ресурсный узел',enemy:'Враг',chest:'Контейнер',building:'Постройка'};
const catalogFields={
 game:{icon:'leaf',search:'Найти ресурс',placeholder:'Rathium, руда, дерево…',categoryKey:'category',categoryLabel:'Категория',allCategories:'Все материалы',empty:'Ресурсы не найдены'},
 buildings:{icon:'home',search:'Найти постройку',placeholder:'Loom, Furnace, Storage…',categoryKey:'buildingCategory',categoryLabel:'Функция',allCategories:'Все функции',empty:'Постройки не найдены'},
 creatures:{icon:'antler',search:'Найти существо',placeholder:'Rangifer, Sagi Bird…',categoryKey:'creatureCategory',categoryLabel:'Тип',allCategories:'Все типы',empty:'Существа не найдены'}
};
let ui,index,catalogPromise,loadError='';
const pageSize=10;

export const resourceCatalogDefaults=()=>({mode:'game',targetKey:'',search:'',tier:'',category:'',buildingCategory:'',creatureCategory:'',page:0,stationPage:0,quantity:DEFAULT_PRODUCTION_QUANTITY,showNodes:false});
export function normalizeResourceCatalogState(raw){
 const result=resourceCatalogDefaults();if(!raw||typeof raw!=='object')return result;
 for(const key of ['targetKey','search'])if(typeof raw[key]==='string')result[key]=raw[key].slice(0,160);
 if(Object.hasOwn(RESOURCE_MODES,raw.mode))result.mode=raw.mode;
 if(result.mode!=='custom'&&result.targetKey)result.mode=resourceModeForKey(result.targetKey);
 if(raw.tier===''||/^(?:[1-9]|10)$/.test(String(raw.tier))||(result.mode==='buildings'&&raw.tier==='0'))result.tier=String(raw.tier);
 if(RESOURCE_CATEGORIES.some(([key])=>key===raw.category))result.category=raw.category;
 if(typeof raw.buildingCategory==='string'&&/^(?:\d+|none)?$/.test(raw.buildingCategory)&&raw.buildingCategory.length<=20)result.buildingCategory=raw.buildingCategory;
 if(Object.hasOwn(CREATURE_CATEGORIES,raw.creatureCategory))result.creatureCategory=raw.creatureCategory;
 if(Number.isSafeInteger(raw.quantity)&&raw.quantity>=0&&raw.quantity<=1e6)result.quantity=raw.quantity;
 result.showNodes=raw.showNodes===true;
 return result;
}
export function configureResources(options){ui=options;}
function currentIndex(){const book=ui.getBook();if(book&&index?.book!==book)index=createResourceIndex(book);return index?.book===book?index:null;}
function ensureCatalog(){
 if(catalogPromise)return;loadError='';
 catalogPromise=Promise.resolve().then(()=>ui.ensureBook()).catch(error=>{loadError=error.message||String(error);}).finally(()=>{catalogPromise=null;ui.refresh();});
}
export function retryResourceCatalog(){loadError='';ensureCatalog();}
const tier=entity=>entity.tier>0?`T${entity.tier}`:'';
const functionLabel=fn=>`${gameName(fn.name)} · ${fn.tier>=0?tr("уровень ")+number(fn.tier):tr("уровень не указан")}`;
const creatureMeta=entity=>[tier(entity),tr(CREATURE_CATEGORIES[entity.tag])||gameText(entity.tag),rarityName(entity.rarity)].filter(Boolean).join(' · ');
function entityMeta(entity){
 if(entity.type==='building')return [tr("Постройка"),...(entity.functions||[]).map(functionLabel)].join(' · ');
 if(entity.type==='enemy')return creatureMeta(entity);
 return [tier(entity),gameText(entity.tag),tr(typeNames[entity.type])].filter(Boolean).join(' · ');
}
const label=entity=>[gameName(entity.name),tier(entity)].filter(Boolean).join(' · ');
const getEntity=key=>index.book.entitiesByKey.get(key)||{key,name:key,type:String(key).split(':')[0]};
function resourceLink(key,text){return `<button class="recipe-link resource-inline-link" data-action="resource-target" data-id="${escape(key)}">${entityImage(getEntity(key),{size:'sm'})}<span>${escape(text||label(getEntity(key)))}</span></button>`;}
function recipeLink(key,text){return `<button class="recipe-link resource-inline-link" data-action="recipe-target" data-id="${escape(key)}">${entityImage(getEntity(key),{size:'sm'})}<span>${escape(text||label(getEntity(key)))}</span></button>`;}
function stacks(list){return list?.length?list.map(stack=>`<div class="resource-stack">${resourceLink(stack.key)}<b>× ${number(stack.quantity)}</b></div>`).join(''):`<span class="subtitle">${tr("Не указано")}</span>`;}
function displayTime(seconds){return seconds==null?tr("Не определено"):ui.duration(seconds);}

export function resourceResults(state){
 const active=currentIndex();if(!active)return '';
 const entities=filterResources(active,state),pages=Math.max(1,Math.ceil(entities.length/pageSize));state.page=Math.max(0,Math.min(state.page,pages-1));
 return `<p class="recipe-result-count" role="status">${tr("Найдено: {0} · страница {1} из {2}", number(entities.length), state.page+1, pages)}</p><div class="resource-catalog-results recipe-search-results">${entities.slice(state.page*pageSize,(state.page+1)*pageSize).map(entity=>`<button class="recipe-search-item resource-search-item ${entity.key===state.targetKey?'selected':''}" data-action="resource-target" data-id="${escape(entity.key)}" aria-pressed="${entity.key===state.targetKey}">${entityImage(entity,{size:'md'})}<span><b>${escape(gameName(entity.name))}</b><small>${escape(entityMeta(entity))}</small>${biomeListLabel(active.book,entity.key)?`<span class="catalog-list-note">${escape(biomeListLabel(active.book,entity.key))}</span>`:''}</span>${ui.icon('arrow')}</button>`).join('')||`<div class="empty"><h3>${tr(catalogFields[state.mode].empty)}</h3><p>${tr("Измени запрос или фильтры.")}</p><button class="secondary" data-action="resource-reset">${tr("Сбросить фильтры")}</button></div>`}</div><div class="recipe-pagination"><button class="secondary" data-action="resource-page" data-delta="-1" ${state.page===0?'disabled':''}>${tr("Назад")}</button><button class="secondary" data-action="resource-page" data-delta="1" ${state.page===pages-1?'disabled':''}>${tr("Далее {0}", ui.icon('arrow'))}</button></div>`;
}
export function resourcesCatalogView(state,planSettings={}){
 const active=currentIndex();
 if(!active){
  if(!loadError&&!catalogPromise)ensureCatalog();
  return `<section class="card card-pad" role="status"><h2>${loadError?tr("Не удалось открыть справочник"):tr("Открываем игровой справочник…")}</h2><p class="subtitle">${loadError?escape(loadError):tr("Читаем локальный игровой каталог.")}</p>${loadError?`<button class="secondary" data-action="resource-retry">${tr("Повторить")}</button>`:''}</section>`;
 }
 const buildings=state.mode==='buildings',creatures=state.mode==='creatures',fields=catalogFields[state.mode];
 const categories=buildings?active.buildingCategories:creatures?Object.entries(CREATURE_CATEGORIES):RESOURCE_CATEGORIES;
 const levels=buildings?[...new Set(active.buildings.flatMap(entity=>(entity.functions||[]).map(fn=>fn.tier).filter(level=>level>=0)))].sort((a,b)=>a-b):Array.from({length:10},(_,i)=>i+1);
 const count=buildings?number(active.buildings.length)+tr(" построек"):creatures?number(active.creatures.length)+tr(" существ"):number(active.materials.length)+tr(" материалов · ")+number(active.nodes.length)+tr(" ресурсных узлов");
 if(!state.targetKey){
  setProductionTarget(state,defaultResourceKey(active,state.mode));
  if(state.targetKey)ui.persist();
 }
 const source=active.book.catalog.source;
 const detail=state.targetKey?resourceDetail(state,resourceProfile(active,state.targetKey),planSettings):`<section class="card empty"><h3>${tr("В каталоге нет записей")}</h3></section>`;
 const extraFilter=buildings?`<p class="recipe-explanation">${tr("Уровень относится к выбранной функции постройки. У одной постройки может быть несколько функций.")}</p>`
  :state.mode==='game'?`<label class="recipe-checkbox"><input type="checkbox" data-resource-filter="showNodes" ${state.showNodes?'checked':''}>${tr("Показать ресурсные узлы")}</label>`:'';
 return `<div class="resource-book recipe-book">
  <div class="recipe-source-note">${ui.icon(fields.icon)}<span>${tr("{0} · снимок {1}. Текущий сервер может отличаться.", count, escape(formatDate((source?.committedAt||'2026-11-13').slice(0,10))))}</span></div>
  <div class="resource-workspace recipe-workspace">
   <aside class="stack"><section class="card card-pad">
    <div class="section-title"><h2>${ui.icon(fields.icon)}${tr(RESOURCE_MODES[state.mode])}</h2><button class="text-button" data-action="resource-reset">${tr("Сбросить")}</button></div>
    <label class="field"><span>${tr(fields.search)}</span><input type="search" id="resource-search" value="${escape(state.search)}" maxlength="160" placeholder="${tr(fields.placeholder)}" autocomplete="off"></label>
    <div class="row">
     <label class="field"><span>${buildings?tr("Уровень функции"):tr("Тир")}</span><select data-resource-filter="tier"><option value="">${buildings?tr("Все уровни"):tr("Все тиры")}</option>${levels.map(level=>`<option value="${level}" ${state.tier===String(level)?'selected':''}>${buildings?tr("Уровень ")+level:'T'+level}</option>`).join('')}</select></label>
     <label class="field"><span>${tr(fields.categoryLabel)}</span><select data-resource-filter="${fields.categoryKey}"><option value="">${tr(fields.allCategories)}</option>${categories.map(([key,name])=>`<option value="${escape(key)}" ${state[fields.categoryKey]===key?'selected':''}>${escape(tr(gameName(name)))}</option>`).join('')}</select></label>
    </div>${extraFilter}<div id="resource-results">${resourceResults(state)}</div>
   </section></aside>
   <div class="stack resource-detail">${detail}</div>
  </div>
 </div>`;
}
function resourceHeading(entity,eyebrow,meta){
 return `<div class="resource-target-heading recipe-target-heading">${entityImage(entity,{size:'lg'})}<div><p class="eyebrow">${eyebrow}</p><h2>${escape(gameName(entity.name))}</h2><p class="subtitle">${escape(meta)}</p></div></div>${entity.description?`<p class="recipe-description">${escape(gameText(entity.description))}</p>`:''}${entityBiomeDetails(index.book,entity)}`;
}
function creatureDetail({entity,methods}){
 if(entity.id==null||entity.missing)return `<section class="card empty"><h3>${tr("Существо не найдено в снимке")}</h3></section>`;
 const dungeonRewards=catalogDungeonRewards(index.book,entity.key);
 const drops=methods.flatMap(recipe=>(recipe.possibleOutputs?.length?recipe.possibleOutputs:recipe.outputs||[])
  .filter(stack=>stack.quantity>0)
  .map(stack=>`<div class="resource-use">${stacks([stack])}${catalogDropAction(recipe,stack.key)}</div>`));
 return `<section class="card card-pad">${resourceHeading(entity,tr("СУЩЕСТВО"),creatureMeta(entity))}</section>
  <section class="card card-pad resource-sources">
   <div class="section-title"><h2>${tr("{0}Добыча", ui.icon('target'))}</h2></div>
   ${drops.length?`<div class="resource-use-list">${drops.join('')}</div>`:dungeonRewards?'':`<p class="subtitle">${tr("В снимке нет записей о добыче с этого существа.")}</p>`}
   ${dungeonRewards}
   ${sourceReference({source:{table:'enemy_desc',id:entity.id}})}
  </section>`;
}
function resourceDetail(state,profile,planSettings){
 if(profile.isCreature)return creatureDetail(profile);
 const {inventory={}}=planSettings;
 const {entity,isNode,isBuilding,methods,uses,stationUses}=profile,known=index.byKey.has(entity.key),owned=inventory[entity.key]||0;
 const goal=productionGoal(index.book,entity.key,planSettings);
 const plan=isNode||isBuilding?null:planProduction(index.book,goal.key,state.quantity,planSettings);
 const tradeSources=catalogTrades(index.book,entity.key,'gives',resourceLink);
 const questSources=catalogQuestRewards(index.book,entity.key),tradeUses=catalogTrades(index.book,entity.key,'takes',resourceLink);
 const meta=[tier(entity),gameText(entity.tag),tr(typeNames[entity.type]),rarityName(entity.rarity)].filter(Boolean).join(' · ');
 return `${!known?`<div class="warning">${tr("Эта запись отсутствует в основном списке справочника. Её данные и связи из каталога доступны ниже.")}</div>`:''}<section class="card card-pad">${resourceHeading(entity,isBuilding?tr("ПОСТРОЙКА"):isNode?tr("ИСТОЧНИК В МИРЕ"):tr("МАТЕРИАЛ"),meta)}${isBuilding?buildingFunctions(entity):isNode?`<p class="recipe-explanation">${tr("Ниже показаны результаты известных способов добычи из этого узла. Один удар не обязательно равен одному полному извлечению ресурса.")}</p>`:`<div class="row"><label class="field"><span>${tr("Нужно получить, шт.")}</span><input data-key="resourceCatalog.quantity" type="number" value="${state.quantity}" min="0" max="1000000" step="1"></label><label class="field"><span>${goal.key===entity.key?tr("Уже в запасах, шт."):tr("В запасе {0}, шт.", escape(rarityName(entity.rarity)))}</span><input data-recipe-stock="${escape(entity.key)}" type="number" value="${owned}" min="0" max="1000000000000" step="any"></label></div><div class="resource-quantity-note"><span>${tr("Не хватает до цели")}</span><strong>${tr("{0} шт.", number(plan.tree.missing))}</strong></div><button class="primary full" data-action="resource-plan" data-id="${escape(entity.key)}" data-quantity="${state.quantity}">${tr("{0}Рассчитать производство {1}", ui.icon('hammer'), ui.icon('arrow'))}</button><p class="recipe-explanation">${goal.key!==entity.key?tr("План по тиру учитывает запасы всех вариантов редкости."):tr("Откроет полную цепочку в «Рецептах». Запасы общие для обоих разделов.")}</p>`}</section>${catalogCharacteristics(index.book,entity,{link:resourceLink,duration:ui.duration})}${plan?planPreview(plan):''}<section class="card card-pad resource-sources"><div class="section-title"><h2>${ui.icon(isBuilding?'hammer':'target')}${isBuilding?tr("Как построить"):isNode?tr("Что добывается"):tr("Откуда получить")}</h2>${methods.length?`<span class="badge">${methods.length}</span>`:''} </div>${tradeSources}${questSources}${methods.length?methodsView(methods,entity):tradeSources||questSources?'':`<p class="subtitle">${tr("В этом снимке способ получения не найден. Это не означает, что объект недоступен в игре.")}</p>`}</section>${isBuilding&&stationUses.length?stationUsesSection(state,stationUses):''}${uses.length||tradeUses?(isBuilding?`<section class="card card-pad resource-uses"><div class="section-title"><h2>${tr("{0}Разборка и использование", ui.icon('hammer'))}</h2><span class="badge">${uses.length}</span></div>${methodsView(uses,entity)}</section>`:usageSection(uses,tr("Для чего нужен"),'resource-uses',tradeUses)):''}`;
}
function buildingFunctions(entity){
 return `<h3>${tr("Функции постройки")}</h3>${entity.functions?.length?`<dl class="recipe-facts building-functions">${entity.functions.map(fn=>`<dt>${escape(gameName(fn.name))}</dt><dd>${fn.tier>=0?tr("Уровень ")+number(fn.tier):tr("Уровень не указан")}</dd>`).join('')}</dl><p class="recipe-explanation">${tr("Уровни относятся к отдельным функциям; единый тир постройки в таблицах не указан.")}</p>`:`<p class="subtitle">${tr("Функции в этом снимке не указаны.")}</p>`}<p class="recipe-explanation">${tr("Ниже — нормы на одну постройку из сохранённых таблиц. Строительство пока не входит в автоматический план; материалы можно открыть и рассчитать отдельно.")}</p>`;
}
function usageSection(recipes,title,className,extra=''){
 const row=recipe=>`<div class="resource-use"><b>${escape(gameName(recipe.name))}</b>${stacks(recipe.familyOutputs?.length?recipe.familyOutputs:recipe.outputs?.length?recipe.outputs:recipe.possibleOutputs)}</div>`;
 return `<section class="card card-pad ${className}"><div class="section-title"><h2>${ui.icon('hammer')}${title}</h2>${recipes.length?`<span class="badge">${recipes.length}</span>`:''} </div>${extra}<div class="resource-use-list">${recipes.slice(0,8).map(row).join('')}${recipes.length>8?`<details><summary>${tr("Ещё {0} рецептов", recipes.length-8)}</summary>${recipes.slice(8).map(row).join('')}</details>`:''}</div></section>`;
}
function stationUsesSection(state,recipes){
 const pages=Math.ceil(recipes.length/pageSize);state.stationPage=Math.max(0,Math.min(state.stationPage||0,pages-1));
 return `<section class="card card-pad resource-station-uses"><div class="section-title"><h2>${tr("{0}Рецепты на этой постройке", ui.icon('hammer'))}</h2><span class="badge">${recipes.length}</span></div><p class="recipe-result-count">${tr("Страница {0} из {1}. Доступность также зависит от навыков, знаний и других условий рецепта.", state.stationPage+1, pages)}</p><div class="resource-use-list">${recipes.slice(state.stationPage*pageSize,(state.stationPage+1)*pageSize).map(recipe=>`<div class="resource-use"><b>${escape(gameName(recipe.name))}</b>${stacks(recipe.familyOutputs?.length?recipe.familyOutputs:recipe.outputs?.length?recipe.outputs:recipe.possibleOutputs)}</div>`).join('')}</div>${pages>1?`<div class="recipe-pagination"><button class="secondary" data-action="resource-station-page" data-delta="-1" ${state.stationPage===0?'disabled':''}>${tr("Назад")}</button><button class="secondary" data-action="resource-station-page" data-delta="1" ${state.stationPage===pages-1?'disabled':''}>${tr("Далее {0}", ui.icon('arrow'))}</button></div>`:''}</section>`;
}
function methodsView(methods,target){
 const eligible=new Map(getProductionOptions(index.book,target.key).map(option=>[option.recipe.key,option.eligible]));
 const ordered=[...methods].sort((a,b)=>Number(eligible.get(b.key)||false)-Number(eligible.get(a.key)||false)||a.name.localeCompare(b.name));
 return ordered.map((recipe,i)=>`<details class="recipe-method resource-method" ${i===0?'open':''}><summary>${escape(tr(kinds[recipe.kind]||"Источник"))} · ${escape(gameName(recipe.name))}${catalogMethodLevels(recipe.requirements)}</summary><div class="recipe-method-body">${recipe.origins?.length?`<div class="resource-origin-list">${recipe.origins.map(origin=>`<div>${resourceLink(origin.key,gameName(origin.name)+(origin.tier>0?' · T'+origin.tier:''))}</div>`).join('')}</div>`:''}<dl class="recipe-facts">${recipe.ingredients?.length?`<dt>${recipe.kind==='construction'?tr("Нужно на постройку"):tr("Нужно за операцию")}</dt><dd>${stacks(recipe.ingredients)}</dd>`:''}<dt>${recipe.outputs?.length?tr("Гарантированный выход"):tr("Возможный результат")}</dt><dd>${stacks(recipe.outputs?.length?recipe.outputs:recipe.possibleOutputs)}</dd><dt>${tr("Базовое время")}</dt><dd>${displayTime(recipe.seconds)}</dd>${recipe.instantBuilt?`<dt>${tr("Способ строительства")}</dt><dd>${tr("Мгновенная постройка по таблице")}</dd>`:''}</dl>${requirements(recipe.requirements)}${methodBiomeDetails(index.book,recipe)}${catalogDropAction(recipe,target.key)}<p class="recipe-explanation">${methodExplanation(recipe)}</p>${recipe.outcomeGroups?.length?`<details><summary>${tr("Возможные исходы")}</summary>${recipe.outcomeGroups.map(group=>`<div class="recipe-outcome">${group.chance!=null?tr("Шанс исхода: {0}%", number(group.chance*100)):''}${stacks(group.outputs)}</div>`).join('')}</details>`:''}${sourceReference(recipe)}</div></details>`).join('');
}
function methodExplanation(recipe){
 if(['crafting','conversion'].includes(recipe.kind))return tr("Базовое время без бонусов персонажа, сбора и дороги. Для активного крафта: скорость ×1, прогресс 1 за действие, без критов.");
 if(['construction','deconstruction'].includes(recipe.kind))return tr("Нормы из сохранённого снимка таблиц. Время строительства и разборки в модели не рассчитано.");
 return tr("Количество и время сбора не пересчитываются автоматически: нужны характеристики инструмента, источника и персонажа. Параметры вероятности добычи не превращаются в шанс на удар.");
}
function requirements(req={}){
 const rows=[];
 if(req.station)rows.push([tr("Станция"),escape(gameName(req.station.name))+(req.station.tier>0?' · T'+req.station.tier:'')+(req.station.buildings?.length?'<br>'+req.station.buildings.filter(building=>getEntity(building.key).visible!==false).map(building=>resourceLink(building.key,gameName(building.name))).join('<br>'):'')]);
 if(req.tools?.length)rows.push([tr("Инструменты"),req.tools.map(tool=>`${escape(gameName(tool.name))}${tool.level>0?' · T'+tool.level:''}${tool.power>0?tr(" · мощность ")+number(tool.power):''}`).join('<br>')]);
 if(req.skills?.length)rows.push([tr("Навыки"),req.skills.map(skill=>skillLink(index.book,skill)).join('<br>')]);
 if(req.knowledges?.length)rows.push([tr("Знания"),req.knowledges.map(entry=>knowledgeLink(index.book,entry.id,entry.name)).join('<br>')]);
 if(req.blockingKnowledges?.length)rows.push([tr("Блокирующие знания"),req.blockingKnowledges.map(entry=>knowledgeLink(index.book,entry.id,entry.name)).join('<br>')]);
 const technologies=[...new Set([...(req.claimTechIds||[]),...(req.claimTechId?[req.claimTechId]:[])])];
 if(technologies.length)rows.push([tr("Технологии поселения"),technologies.map(id=>tr("Требование № ")+escape(id)).join('<br>')]);
 if(req.interiorTier!=null)rows.push([tr("Уровень интерьера"),number(req.interiorTier)]);
 if(req.pavingTier>0)rows.push([tr("Уровень покрытия"),number(req.pavingTier)]);
 if(req.consumedShards>0)rows.push([tr("Расход шардов (Shards)"),number(req.consumedShards)]);
 if(req.equipmentId)rows.push([tr("Снаряжение"),tr("Требование № ")+escape(req.equipmentId)+(req.equipmentTier>0?' · T'+number(req.equipmentTier):'')]);
 if(req.locationLabel)rows.push([tr("Место"),escape(gameText(req.locationLabel))]);
 if(req.biomes?.length)rows.push([tr("Биомы размещения"),biomeLinks(index.book,new Set(req.biomes))]);
 return rows.length?`<dl class="recipe-facts resource-requirements">${rows.map(([name,value])=>`<dt>${name}</dt><dd>${value}</dd>`).join('')}</dl>`:'';
}
function sourceReference(recipe){const base=index.book.catalog.source?.tableBaseUrl;return base&&recipe.source?.table?`<p class="recipe-record"><a href="${escape(base+recipe.source.table+'.json')}" target="_blank" rel="noreferrer">${tr("Таблица источника ↗")}</a> ${tr("· запись № {0}", escape(recipe.source.id))}</p>`:'';}
function planPreview(plan){
 const ingredients=plan.tree?.children||[];
 return `<section class="card card-pad resource-plan-preview"><div class="section-title"><h2>${tr("{0}Производство ресурса", ui.icon('clock'))}</h2></div><div class="resource-plan-stats"><div><span class="stat-label">${tr("Базовое время цепочки")}</span><b>${plan.totalSeconds==null?tr("Частичный расчёт"):displayTime(plan.totalSeconds)}</b></div><div><span class="stat-label">${tr("Материалов получить")}</span><b>${plan.materials.filter(material=>material.missing>0).length}</b></div></div>${ingredients.length?`<h3>${tr("Непосредственно для цели")}</h3><div class="resource-ingredient-list">${ingredients.map(ingredient=>`<div class="resource-stack">${resourceLink(ingredient.key)}<b>× ${number(ingredient.required)}</b></div>`).join('')}</div>`:''}${plan.materials.some(material=>material.missing>0)?`<details class="resource-raw-materials"><summary>${tr("Сырьё и источники по всей цепочке")}</summary>${plan.materials.filter(material=>material.missing>0).map(material=>{const sources=(index.book.recipesProducing.get(material.key)||[]).filter(recipe=>!recipe.internalResolver);return `<div class="resource-use"><div class="resource-stack">${resourceLink(material.key)}<b>× ${number(material.missing)}</b></div><small>${sources.flatMap(recipe=>recipe.origins||[]).map(origin=>escape(gameName(origin.name)+(origin.tier>0?' · T'+origin.tier:''))).filter((value,i,array)=>array.indexOf(value)===i).join(' · ')||tr("Источник не указан; открой карточку материала для проверки способов.")}</small></div>`;}).join('')}</details>`:''}${plan.totalSeconds==null?`<p class="recipe-explanation">${tr("Известная часть: {0}. Неизвестное время не подменяется нулём.", displayTime(plan.knownSeconds))}</p>`:''}${plan.issues?.length?`<div class="warning"><ul>${plan.issues.slice(0,8).map(issue=>`<li>${escape(gameName(issue.name))}: ${escape(tr(issue.message))}</li>`).join('')}</ul></div>`:''}<p class="recipe-explanation">${tr("Сумма последовательного крафта при скорости ×1 и прогрессе 1 за действие, без критов. Сбор, бой, дорога и параллельные станции не включены.")}</p></section>`;
}
