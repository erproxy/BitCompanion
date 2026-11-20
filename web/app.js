import { availableLanguages, currentLanguage, decimalSeparator, formatDate, formatNumber, interfaceLanguage, LANGUAGE_KEY, languagePreference, locale, localizeDefault, readLanguagePreference, resolveLanguage, setLanguage, storeLanguagePreference, t as tr } from './i18n.js';
import { canImportCatalogLanguages, catalogSearchKey, gameName, importCatalogLanguages, loadOfficialCatalogLanguage, rarityName, restoreCatalogLanguages } from './catalog-language.js';
import { catalogLocales } from './catalog-locales.js';
import { RARITIES, DROPS, probabilityAtLeast, attemptsForConfidence, expectedAttempts, rarityDistribution, planResources } from './domain.js';
import { recipeDefaults, normalizeRecipeState, configureRecipes, recipesView, recipeResults, recipeSummary, recipeCopyText, retryRecipes, recipeCatalogError, recipeCatalogVersion, getRecipeBook, ensureRecipeCatalog } from './recipes-view.js';
import { resourceCatalogDefaults, normalizeResourceCatalogState, configureResources, resourcesCatalogView, resourceResults, retryResourceCatalog } from './resources-view.js';
import { RESOURCE_MODES, resourceModeForKey, setResourceMode } from './resource-domain.js';
import { entityImage, DROP_ENTITY_KEYS, hasGameImages } from './entity-images.js';
import { assetUrl, runtimeConfig } from './runtime-config.js';
import { initWebPlatform, getWebPlatformState, prepareOfflineImages, applyWebUpdate } from './web-platform.js';
import { parseRoute, routeForState, applyRoute } from './navigation.js';
import { DEFAULT_PRODUCTION_QUANTITY, setProductionTarget } from './recipe-domain.js';
import { createStateStore } from './state-storage.js';
import { GUIDE_MODES, guideDefaults, normalizeGuideState } from './guide-domain.js';
import { configureGuide, guideResults, guideView, retryGuide } from './guide-view.js';
import { DUNGEON_SEARCH_LIMIT, dungeonDefaults, normalizeDungeonState } from './dungeon-domain.js';
import { dungeonResults, dungeonsView } from './dungeons-view.js';
import { WORLD_MODES, WORLD_SEARCH_LIMIT, normalizeWorldState, worldDefaults } from './world-domain.js';
import { worldResults, worldView } from './world-view.js';
import { DROP_MODES, DROP_SEARCH_LIMIT, dropBrowserDefaults, findDropEntry, normalizeDropBrowser, normalizeDropEntry } from './drop-catalog.js';
import { dropBrowserView, dropChanceField, dropResults, dropSourceView, dropTabs } from './drop-catalog-view.js';
import { createPlanChecklist, createRecipeChecklist, isProductionPlan, normalizePlanProgress } from './plan-checklist.js';
import { planChecklistView, updatePlanBranches, updatePlanChecklist } from './plan-checklist-view.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (n, digits = 2) => Number.isFinite(n) ? formatNumber(n, digits) : '∞';
const pct = p => p > 0 && p < 1e-8 ? (p*100).toExponential(2).replace('.', decimalSeparator()) : num(p * 100, p > 0 && p < .001 ? 6 : p < .01 ? 4 : 2);
let gameLanguages = runtimeConfig.gameLocalization?.languages ?? await restoreCatalogLanguages();
const importLanguageOption = 'import-game-localization';
let preferredLanguage = readLanguagePreference();
let languageRequest = 0;
async function updateLanguage() {
 const request = ++languageRequest;
 const systemLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
 const language = resolveLanguage(preferredLanguage, systemLanguages, gameLanguages);
 let ready = true;
 try { await loadOfficialCatalogLanguage(language); }
 catch { ready = false; }
 if(request!==languageRequest)return;
 setLanguage(language, [], gameLanguages);
 document.documentElement.lang = interfaceLanguage();
 return ready;
}
const initialLanguageReady = await updateLanguage();
function languageSelect() {
 const selected = currentLanguage();
 return `<select id="interface-language" class="language-select" aria-label="${tr('Язык')}" title="${tr('Язык')}">
  ${availableLanguages(gameLanguages).map(code => `<option value="${code}" lang="${code}"${code === selected ? ' selected' : ''}>${catalogLocales[code].label}</option>`).join('')}
  ${canImportCatalogLanguages ? `<option value="${importLanguageOption}">${tr('Подключить переводы BitCraft…')}</option>` : ''}
 </select>`;
}
const uid = () => 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const paths = {
 compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z m-6.3-3.3-1.5 4.5-4.5 1.5 1.5-4.5 4.5-1.5Z',
 globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M3 12h18 M12 3a4 9 0 1 1 0 18 4 9 0 1 1 0-18Z',
 moon:'M20.8 14a8.5 8.5 0 0 1-10.8-10.8A8.5 8.5 0 1 0 20.8 14Z M17 3v4 M15 5h4',
 leaf:'M20 4C9 3 3 7 5 16c8 3 15-2 15-12Z M4 21 16 9 M10 15l-1-5 M13 12l5 1',
 bag:'M6 8h12l2 12H4L6 8Z M9 8V5a3 3 0 0 1 6 0v3 M9 13h6 M12 11v4',
 sparkle:'m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z M20 2v4 M18 4h4',
 hammer:'m14 4 6 6-3 3-3-3-9 10-3-3 10-9-3-3 3-3 2 2Z',
 clock:'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
 book:'M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M5 3v18 M8 8h7 M8 12h5',
 home:'m3 11 9-8 9 8 M5 10v11h14V10 M9 21v-7h6v7',
 save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z M7 3v6h10V3 M7 21v-7h10v7',
 download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
 upload:'M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5',
 info:'M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
 check:'m5 12 4 4L19 6',
 plus:'M12 5v14 M5 12h14',
 close:'m6 6 12 12 M6 18 18 6',
 arrow:'M4 12h16 m-6-6 6 6-6 6',
 chevron:'m9 18 6-6-6-6',
 chart:'M4 4v16h17 M7 15l5-5 4 2 4-6',
 target:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M12 11v2',
 shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z m-4 9 3 3 5-6',
 antler:'M11 21V10L5 4 M5 4V1 M5 4H1 M8 7V2 M13 21V10l6-6 M19 4V1 M19 4h4 M16 7V2 M11 14 5 10 M13 14l6-4',
 play:'m8 4 12 8-12 8V4Z',
 pause:'M8 4v16 M16 4v16',
 stop:'M5 5h14v14H5z',
 cube:'m12 3 9 5v9l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v9 M7 5l9 5',
 mushroom:'M3 13c0-12 18-12 18 0H3Z M9 13v7h6v-7 M7 9h.01 M15 7h.01',
 fish:'M4 12c4-9 12-9 17 0-5 9-13 9-17 0Z M4 12 1 7v10l3-5 M16 10h.01',
 diamond:'m12 2 9 10-9 10L3 12l9-10Z M3 12h18 M12 2 8 12l4 10 4-10-4-10Z',
 reset:'M3 10a9 9 0 1 1 2 8 M3 4v6h6',
 trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
 calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.leaf}"/></svg>`;
function duration(seconds) {
 if (!Number.isFinite(seconds)) return '∞';
 seconds = Math.max(0, Math.round(seconds));
 const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
 return [d && tr("{0} д", num(d,0)), h && tr("{0} ч", h), m && tr("{0} мин", m), !d && !h && (s || !m) && tr("{0} сек", s)].filter(Boolean).join(' ');
}
const tabs=[['drops','bag','Добыча'],['rarity','sparkle','Редкость'],['recipeBook','book','Рецепты'],['resources','hammer','Ресурсы'],['guide','compass','Справочник'],['world','globe','Мир'],['dungeons','shield','Данжи'],['time','clock','Время'],['journal','book','Мои планы']];
const defaults = () => ({version:1,tab:'drops',recipeBook:recipeDefaults(),resourceCatalog:resourceCatalogDefaults(),guide:guideDefaults(),world:worldDefaults(),dungeons:dungeonDefaults(),dropBrowser:dropBrowserDefaults(),drop:{preset:DROPS[0].id,catalogEntry:null,name:tr("Мой предмет"),chance:2,quantity:1,attempts:100,seconds:45,confidence:95,costs:[]},rarity:{mode:'recraft',transition:1,attempts:20,seconds:10,start:0,startTier:1,targetTier:10},resources:{targetId:'expedition',editId:'expedition',quantity:DEFAULT_PRODUCTION_QUANTITY,inventory:{},recipes:[
 {id:'expedition',name:tr("Набор для похода · пример"),output:1,seconds:30,ingredients:[{id:'board',name:tr("Доски · пример"),amount:4},{id:'rope',name:tr("Верёвка · пример"),amount:2}]},
 {id:'board',name:tr("Доски · пример"),output:2,seconds:10,ingredients:[{id:'logs',name:tr("Брёвна"),amount:3}]},
 {id:'rope',name:tr("Верёвка · пример"),output:1,seconds:8,ingredients:[{id:'fiber',name:tr("Волокно"),amount:5}]}
 ]},time:{budget:2,seconds:45,label:tr("Сбор ресурсов"),startedAt:null,elapsed:0,sessions:[]},saved:[],journal:{view:'list',id:''}});
const sampleLabels={expedition:'Набор для похода · пример',board:'Доски · пример',rope:'Верёвка · пример',logs:'Брёвна',fiber:'Волокно'};
const sampleName = (id, value) => Object.hasOwn(sampleLabels,id)?localizeDefault(value,sampleLabels[id]):value;
const STORE = 'bitcraft-companion-v1';
let state = defaults(), toastTimer;
const stateStore = createStateStore(() => localStorage, STORE, () => navigator.locks);
let storageConflict = false, routeInitialized = false, pendingWrites = 0;
let pointerAction = null, renderAfterPointer = false;
function refresh(){if(pointerAction)renderAfterPointer=true;else render();}
document.addEventListener('pointerdown',e=>{pointerAction=e.target.closest('[data-action]');},true);
document.addEventListener('pointerup',()=>{setTimeout(()=>{pointerAction=null;if(renderAfterPointer){renderAfterPointer=false;render();}},0);},true);
document.addEventListener('pointercancel',()=>{pointerAction=null;if(renderAfterPointer){renderAfterPointer=false;render();}},true);
let storageAvailable = true;
try { const saved = stateStore.read(); if (saved) state = normalize(JSON.parse(saved)); } catch { storageAvailable = false; }

function stateForStorage(value) {
 return {
  ...value,
  recipeBook:{...value.recipeBook,quantity:undefined},
  resourceCatalog:{...value.resourceCatalog,quantity:undefined},
  resources:{...value.resources,quantity:undefined}
 };
}
function normalize(raw,{savedPlan=false}={}) {
 if (!raw || raw.version !== 1) throw Error(tr("Формат файла не поддерживается. Нужен экспорт BitCraft Companion v1."));
 if(!savedPlan)raw=stateForStorage(raw);
 const d = defaults(), str = (x,f='',max=140) => typeof x === 'string' ? x.slice(0,max) : f;
 const n = (x,f,min=0,max=1e8,integer=false) => Number.isFinite(x) && x >= min && x <= max && (!integer || Number.isInteger(x)) ? x : f;
 if (tabs.some(([id])=>id===raw.tab)) d.tab = raw.tab;
 d.recipeBook=normalizeRecipeState(raw.recipeBook);
 d.resourceCatalog=normalizeResourceCatalogState(raw.resourceCatalog);
 d.guide=normalizeGuideState(raw.guide);
 d.world=normalizeWorldState(raw.world);
 d.dungeons=normalizeDungeonState(raw.dungeons);
 d.dropBrowser=normalizeDropBrowser(raw.dropBrowser);
 if (raw.drop) {
  const r=raw.drop, catalogEntry=r.preset==='catalog'?normalizeDropEntry(r.catalogEntry):null;
  d.drop={preset:catalogEntry?'catalog':DROPS.some(x=>x.id===r.preset)?r.preset:'custom',catalogEntry,name:str(r.name,tr("Мой предмет")),chance:n(r.chance,2,0,100),quantity:n(r.quantity,1,1,10000,true),attempts:n(r.attempts,100,0,1e8,true),seconds:n(r.seconds,45,0,86400),confidence:[50,75,90,95,99,100].includes(r.confidence)?r.confidence:95,costs:(Array.isArray(r.costs)?r.costs:[]).slice(0,30).filter(x=>x&&typeof x==='object').map(x=>({name:str(x.name,tr("Ресурс")),amount:n(x.amount,0)}))};
 }
 if (raw.rarity) {const r=raw.rarity;d.rarity={mode:r.mode==='tiers'?'tiers':'recraft',transition:n(r.transition,1,1,5,true),attempts:n(r.attempts,20,0,1e8,true),seconds:n(r.seconds,10,0,86400),start:n(r.start,0,0,5,true),startTier:n(r.startTier,1,1,10,true),targetTier:n(r.targetTier,10,1,10,true)};d.rarity.startTier=Math.max(d.rarity.startTier,d.rarity.start+1);d.rarity.targetTier=Math.max(d.rarity.targetTier,d.rarity.startTier);}
 if (raw.resources && Array.isArray(raw.resources.recipes) && raw.resources.recipes.length) {
  const r=raw.resources, ids=new Set();
  d.resources.recipes=r.recipes.slice(0,100).map(x=>{if(!x||typeof x.id!=='string'||!x.id||x.id.length>100||['__proto__','constructor','prototype'].includes(x.id)||ids.has(x.id))throw Error(tr("Некорректные идентификаторы рецептов."));ids.add(x.id);return{id:str(x.id,'',100),name:str(x.name,tr("Рецепт")),output:n(x.output,1,.000001,1e6),seconds:n(x.seconds,0,0,86400),ingredients:(Array.isArray(x.ingredients)?x.ingredients:[]).slice(0,100).filter(y=>y&&typeof y.id==='string'&&y.id).map(y=>({id:str(y.id,'',100),name:str(y.name,tr("Ресурс")),amount:n(y.amount,0,0,1e6)}))};});
  d.resources.targetId=ids.has(r.targetId)?r.targetId:d.resources.recipes[0].id;d.resources.editId=ids.has(r.editId)?r.editId:d.resources.targetId;d.resources.quantity=n(r.quantity,d.resources.quantity,0,1e6);d.resources.inventory={};
  if(r.inventory&&typeof r.inventory==='object')for(const [id,value]of Object.entries(r.inventory).slice(0,1000)){if(!['__proto__','constructor','prototype'].includes(id))d.resources.inventory[id]=n(value,0);}
 }
 if (raw.time) {const r=raw.time;d.time={budget:n(r.budget,2,0,10000),seconds:n(r.seconds,45,.001,86400),label:str(r.label,tr("Сбор ресурсов")),startedAt:r.startedAt&&n(r.startedAt,0,1,Date.now()+60000)||null,elapsed:n(r.elapsed,0,0,1e12),sessions:(Array.isArray(r.sessions)?r.sessions:[]).slice(0,100).filter(x=>x&&typeof x==='object').map(x=>({id:str(x.id,uid()),label:str(x.label,tr("Сессия")),seconds:n(x.seconds,0,0,1e12),date:n(x.date,Date.now(),1,Date.now()+60000)}))};}
 d.saved=(Array.isArray(raw.saved)?raw.saved:[]).slice(0,50).filter(x=>x&&['drops','rarity','resources','recipeBook'].includes(x.type)&&typeof x.id==='string').map(x=>{
  const plan={id:str(x.id),title:str(x.title,tr("Расчёт")),type:x.type,date:n(x.date,Date.now(),1,Date.now()+60000),summary:str(x.summary,'',300),data:normalizeSaved(x.type,x.data)};
  if(isProductionPlan(plan))plan.progress=normalizePlanProgress(x.progress);
  return plan;
 });
 if(d.saved.some(plan=>plan.id===raw.journal?.id&&isProductionPlan(plan))){
  d.journal={id:raw.journal.id,view:raw.journal.view==='checklist'?'checklist':'list'};
 }
 return d;
}
function normalizeSaved(type,data){const base={version:1};base[type==='drops'?'drop':type]=data;const normalized=normalize({...base,saved:[]},{savedPlan:true});return normalized[type==='drops'?'drop':type];}
async function persist(){
 if(storageConflict)return false;
 pendingWrites++;storageStatusChanged();
 try{await stateStore.writeLocked(JSON.stringify(stateForStorage(state)));storageAvailable=true;return true;}
 catch(error){if(error.code==='STATE_CHANGED'){storageConflict=true;refresh();toast(error.message);}else{storageAvailable=false;toast(tr("Не удалось сохранить на устройстве. Экспортируй резервную копию."));}return false;}
 finally{pendingWrites--;storageStatusChanged();}
}
function storageStatusChanged(){const label=$('.saved-status');if(label)label.innerHTML=icon(storageAvailable&&!storageConflict?'check':'info')+(storageConflict?tr("Изменено в другой вкладке"):pendingWrites?tr("Сохраняем…"):storageAvailable?tr("Сохранено на устройстве"):tr("Нужен экспорт копии"));}
function syncRoute(replace=false){
 const hash=routeForState(state);
 const journalPlanId=hash==='#/plans/checklist'?state.journal.id||undefined:undefined;
 if(location.hash!==hash||history.state?.journalPlanId!==journalPlanId)
  history[replace||!routeInitialized?'replaceState':'pushState'](journalPlanId?{journalPlanId}:null,'',hash);
 routeInitialized=true;
}
async function restoreRoute(){
 if(storageConflict)return;
 const route=parseRoute(location.hash);if(!route)return;
 if(routeForState(state)===location.hash&&(!route.checklist||!history.state?.journalPlanId||state.journal.id===history.state.journalPlanId))return;
 applyRoute(state,route,history.state);syncRoute(true);const saving=persist();render();await saving;
}
window.addEventListener('popstate',restoreRoute);
window.addEventListener('hashchange',restoreRoute);
window.addEventListener('storage',event=>{
 if(event.key!==STORE&&event.key!==null)return;
 storageConflict=true;clearTimeout(recipeSearchTimer);clearTimeout(resourceSearchTimer);clearTimeout(guideSearchTimer);
 refresh();toast(tr("Данные изменены в другой вкладке. Текущую копию можно экспортировать."));
});
function storageWarning(){return storageConflict?`<section class="warning" role="alert"><p>${tr("Данные изменены в другой вкладке. Эта копия приостановлена, чтобы сохранить новые изменения.")}</p><div class="modal-actions"><button class="secondary" data-action="export">${tr("Экспортировать текущую копию")}</button><button class="primary" data-action="storage-reload">${tr("Открыть актуальные данные")}</button></div></section>`:'';}
function webSettings(){
 const status=getWebPlatformState();
 const ready=hasGameImages
  ? tr("Интерфейс и каталог сохранены для работы без сети. Непросмотренные картинки могут отображаться заглушками.")
  : tr("Интерфейс и каталог сохранены для работы без сети.");
 const message=status.error||(status.ready?ready:tr("Подготавливаем интерфейс и каталог для работы без сети. Дождись сообщения о готовности."));
 const imageInfo=hasGameImages?`<p>${tr("Картинки сохраняются по мере просмотра. Можно отдельно загрузить полный пакет — около 74 МБ. Браузер может удалить кеш; планы сохраняются отдельно, их резервная копия — JSON-экспорт.")}</p>`:'';
 const progress=status.downloading?`<p role="status">${tr("Загружено изображений:")} ${num(status.completed,0)} / ${num(status.total,0)}</p>`:'';
 const download=hasGameImages?`<button class="secondary" data-action="web-download-images" ${!status.ready||status.downloading?'disabled':''}>${tr("Загрузить все картинки")}</button>`:'';
 const update=status.updateAvailable?`<button class="primary" data-action="web-update">${tr("Обновить сайт")}</button>`:'';
 return `<h3>${tr("Работа без сети")}</h3><p role="status">${esc(message)}</p>${imageInfo}${progress}${download||update?`<div class="modal-actions">${download}${update}</div>`:''}`;
}
function platformChanged(){
 const settings=$('#web-offline-settings');if(settings)settings.innerHTML=webSettings();
 const update=$('[data-web-update]');if(update)update.hidden=!getWebPlatformState().updateAvailable;
}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=tr(message);$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
const titles={recipeBook:['От цели до последнего ресурса.','Рецептурная книга BitCraft: состав, источники и план производства.'],drops:['У каждого трофея свой шанс.','Планируем спокойно. Оставляем место удаче.'],rarity:['На ступень выше.','Перековка снаряжения и путь от T1 до T10.'],resources:['Всё начинается с ресурсов.','Материалы, постройки и существа BitCraft.'],guide:['Справочник BitCraft','Профессии, знания и квесты из игрового снимка.'],world:['Мир','Данные из локального снимка BitCraft.'],dungeons:['Данжи','Входы, переходы и награды из игрового снимка.'],time:['Время на приключение.','Планируй сессию и замечай, куда уходит время.'],journal:['Будущие открытия начинаются здесь.','Твои сохранённые расчёты всегда под рукой.']};
const resourcePills={game:'Игровые материалы',buildings:'Постройки и станции',creatures:'Животные и монстры',custom:'Свои нормы и запасы'};
const inChecklist=()=>state.tab==='journal'&&state.journal.view==='checklist';
const selectedPlan=()=>state.saved.find(plan=>plan.id===state.journal.id&&isProductionPlan(plan));
function render(){
 renderAfterPointer=false;
 const activeDropTab=state.tab==='drops'?`drop-tab-${state.dropBrowser.mode}`:'';
 const restoreDropTab=activeDropTab&&document.activeElement?.id===activeDropTab;
 document.body.dataset.tab=state.tab;
 const [title,subtitle]=inChecklist()?[tr("Список работ"),'']:titles[state.tab].map(label=>tr(label));
 $('#app').innerHTML=`<aside class="sidebar"><div class="brand"><img src="${esc(assetUrl('icon.svg'))}" alt=""><div><strong>BitCraft</strong><small>COMPANION</small></div></div><div class="nav-label">${tr("МАСТЕРСКАЯ")}</div><nav aria-label="${tr("Разделы сайта")}">${tabs.map(([id,i,name])=>`<button class="nav-item ${state.tab===id?'active':''}" data-action="tab" data-tab="${id}" title="${esc(tr(name))}" ${state.tab===id?'aria-current="page"':''}>${icon(i)}<span>${tr(name)}</span>${id==='journal'&&state.saved.length?`<span class="nav-count">${state.saved.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-footer"><div class="sidebar-note">${icon('moon')}<b>${tr("Тихий час для открытий.")}</b><p>${tr("Твои планы остаются")}<br>${tr("на этом устройстве.")}</p></div><div class="version"><span class="online-dot"></span><span>${tr("Данные на устройстве")}</span></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumbs">${icon('home')}<span>${tr("Мастерская")}</span><span>/</span><b>${tr(tabs.find(t=>t[0]===state.tab)[2])}</b></div><div class="top-actions"><button class="text-button" data-web-update data-action="web-update" hidden>${tr("Обновить")}</button><span class="saved-status">${icon(storageAvailable&&!storageConflict?'check':'info')}${storageConflict?tr("Изменено в другой вкладке"):storageAvailable?tr("Сохранено на устройстве"):tr("Нужен экспорт копии")}</span><button class="icon-button" data-action="export" title="${tr("Экспорт всех данных")}" aria-label="${tr("Экспорт всех данных")}">${icon('download')}</button><button class="icon-button" data-action="import" title="${tr("Импорт данных")}" aria-label="${tr("Импорт данных")}">${icon('upload')}</button><button class="icon-button" data-action="sources" title="${tr("Источники и справка")}" aria-label="${tr("Источники и справка")}">${icon('info')}</button>${languageSelect()}</div></header><div class="content">${storageWarning()}<div class="page-title"><div><p class="eyebrow">${tr("ЛУННАЯ ОБСЕРВАТОРИЯ")}</p><h1>${title}</h1>${subtitle?`<p class="subtitle">${subtitle}</p>`:''}</div>${inChecklist()||['world','dungeons'].includes(state.tab)?'':`<span class="pill">${icon('moon')} ${{recipeBook:tr("Рецепты и цепочки"),drops:tr("Независимые проверки"),rarity:tr("Одна ступень за попытку"),resources:tr(resourcePills[state.resourceCatalog.mode]),guide:tr("Разблокировки и награды"),time:tr("Время для приключений"),journal:tr("Твои сохранённые цели")}[state.tab]}</span>`}</div><div id="view"></div><footer class="footer"><span>${tr("{0} Независимый помощник игрока · BitCraft Online", icon('leaf'))}</span><button class="text-button" data-action="sources">${tr("Снимок данных: 13.11.2026 {0}", icon('info'))}</button></footer></div></main>`;
 try {$('#view').innerHTML=({recipeBook:()=>recipesView(state.recipeBook),drops:dropView,rarity:rarityView,resources:resourcesView,guide:()=>guideView(state.guide),world:()=>worldView(state.world,icon),dungeons:()=>dungeonsView(state.dungeons,{icon,duration}),time:timeView,journal:journalView}[state.tab])();}catch(e){$('#view').innerHTML=`<div class="error">${esc(e.message)}<br><button class="secondary" data-action="recover">${tr("Восстановить параметры этого раздела")}</button></div>`;}
 tick();syncRoute();platformChanged();storageStatusChanged();
 if(restoreDropTab)document.getElementById(activeDropTab)?.focus({preventScroll:true});
}
function field(label,key,value,{unit='',min=0,max=1e8,step=1,hint=''}={}){return`<label class="field"><span>${label}</span><div class="input-unit"><input type="number" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}" ${unit?'style="padding-right:56px"':''}>${unit?`<span>${unit}</span>`:''}</div>${hint?`<small>${hint}</small>`:''}</label>`;}
function selectField(label,key,items,value,hint=''){return`<label class="field"><span>${label}</span><select data-key="${key}">${items.map(([id,text])=>`<option value="${esc(id)}" ${String(value)===String(id)?'selected':''}>${esc(text)}</option>`).join('')}</select>${hint?`<small>${hint}</small>`:''}</label>`;}
function stepper(label,key,value){return`<label class="field"><span>${label}</span><div class="stepper"><button data-action="step" data-key="${key}" data-delta="-1" aria-label="${tr("Уменьшить количество")}">−</button><input type="number" data-key="${key}" value="${value}" min="1" max="10000" step="1"><button data-action="step" data-key="${key}" data-delta="1" aria-label="${tr("Увеличить количество")}">+</button></div></label>`;}
const notice = text => `<div class="notice">${icon('info')}<p>${text}</p></div>`;
const saveButton = type => `<button class="primary full" data-action="save" data-type="${type}">${tr("{0} Сохранить план {1}", icon('book'), icon('arrow'))}</button>`;
function constellation(){return `<svg class="constellation" viewBox="0 0 690 290" aria-hidden="true"><g fill="none"><path d="m320 32 40 27 48-19 59 35 60-17 47 54 78-26 M528 58l-8 72 54-18 30 62"/></g><g><circle cx="320" cy="32" r="2"/><circle cx="360" cy="59" r="2"/><circle cx="408" cy="40" r="2"/><circle cx="467" cy="75" r="2"/><circle cx="528" cy="58" r="2"/><circle cx="574" cy="112" r="2"/><circle cx="652" cy="86" r="2"/></g></svg>`;}
function hero(title,sub,i='antler',rarity=null,item=null){return `<div class="hero card">${constellation()}<div class="hero-info"><div class="item-emblem">${item?entityImage(item,{size:'lg'}):icon(i)}</div><div><h2>${esc(title)}</h2><p class="subtitle">${esc(sub)}</p>${rarity?`<span class="rarity-chip" style="--rarity:${rarity.color}">${esc(rarityName(rarity.en))}</span>`:''}</div></div></div>`;}
function dropData(d = state.drop) {
 const preset = DROPS.find(entry => entry.id === d.preset);
 const catalogEntry = d.preset === 'catalog' ? d.catalogEntry : null;
 return {d, preset, catalogEntry, p: catalogEntry?.chance ?? preset?.chance ?? d.chance / 100,
   name: catalogEntry ? gameName(catalogEntry.english || catalogEntry.name) : preset ? presetName(preset) : localizeDefault(d.name,'Мой предмет')};
}
const presetName = preset => gameName(preset.en, preset.name.replace(/ · T\d+$/, ''));
function dropPresetPicker(current) {
 const options = DROPS.map(entry => [entry.id, presetName(entry) + (entry.tier ? ` · T${entry.tier}` : '')]);
 if (current === 'catalog') options.unshift(['', tr("Выберите пресет")]);
 return selectField(tr("Что ищем?"), 'drop.preset', [...options, ['custom', tr("✎ Свой предмет и шанс")]], current === 'catalog' ? '' : current);
}
const dropSuccessLabel = entry => entry?.min ? tr("выдач с бонусом") : entry?.max > 1 ? tr("удачных выдач") : '';
function dropSettingsView({d, p, name, preset, catalogEntry}) {
 const rarity = RARITIES.find(entry => entry.id === (catalogEntry?.rarity ?? preset?.rarity));
 const itemIcon = preset?.id.includes('mushroom') ? 'mushroom' : preset?.id.includes('chitin') || preset?.id === 'trask-scale' ? 'fish'
   : preset?.id === DROPS[0].id ? 'antler' : 'diamond';
 const quantityLabel = catalogEntry?.min ? tr("Выдач с бонусом") : catalogEntry?.max > 1 ? tr("Удачных выдач") : tr("Нужно предметов");
 const catalogSubtitle = catalogEntry?.itemTier ? tr("Предмет T{0}", catalogEntry.itemTier) : '';
 const key = catalogEntry?.itemKey ?? DROP_ENTITY_KEYS[preset?.id];
 const item = key && (getRecipeBook()?.entitiesByKey.get(key) || {
   key, name: catalogEntry?.english || catalogEntry?.name || preset?.en, tier: catalogEntry?.itemTier ?? preset?.tier
 });
 return `<section class="card card-pad"><div class="section-title"><h2 id="drop-settings-title" tabindex="-1">${tr("{0}Параметры вылазки", icon('target'))}</h2></div>
  ${hero(name,catalogEntry ? catalogSubtitle : preset?.tier ? `T${preset.tier}` : preset ? '' : tr("Свой предмет и шанс"),itemIcon,rarity,item)}
  ${catalogEntry ? '' : dropPresetPicker(d.preset)}
  ${!preset && !catalogEntry ? `<label class="field"><span>${tr("Название предмета")}</span><input data-key="drop.name" value="${esc(name)}" maxlength="140"></label>` : ''}
  <div class="row">${stepper(quantityLabel,'drop.quantity',d.quantity)}
    ${catalogEntry ? dropChanceField(catalogEntry) : field(tr("Шанс за попытку"),'drop.chance',preset ? p * 100 : d.chance,
      {unit:'%',max:100,step:'any',hint:preset ? tr("Из справочника, можно изменить") : ''})}</div>
  ${catalogEntry ? dropSourceView(catalogEntry,icon) : preset ? `<div class="tip">${icon('info')}<span><b>${tr("Одна попытка")}</b> · ${esc(tr(preset.unit))}.<br>${esc(tr(preset.sourceNote))}</span></div>`
    : `<div class="tip">${icon('info')}<span>${tr("Задайте шанс одной независимой проверки. За действие может пройти несколько проверок дропа.")}</span></div>`}
  <div class="separator" style="margin-top:18px"></div>
  <div class="row">${field(tr("Планирую попыток"),'drop.attempts',d.attempts,{max:1e8})}
    ${field(tr("Время на попытку"),'drop.seconds',d.seconds,{unit:tr("сек"),max:86400,step:'any'})}</div>
  ${selectField(tr("Насколько уверенно планируем?"),'drop.confidence',[[50,tr("50% — медиана")],[75,tr("75% — с запасом")],[90,tr("90% — уверенно")],[95,tr("95% — большой запас")],[99,tr("99% — ещё осторожнее")],[100,tr("100% — только при гарантированном дропе")]],d.confidence)}
  ${saveButton('drops')}</section>`;
}
function dropView() {
 const data = dropData();
 const {d, p, name, catalogEntry} = data;
 const browse = state.dropBrowser;
 const presets = browse.mode === 'presets';
 const selected = presets ? !catalogEntry : catalogEntry?.group === browse.mode;
 const browser = presets ? '' : dropBrowserView(browse, catalogEntry?.id, icon);
 const workspace = (settings, results) => `<div class="workspace drop-workspace"><div class="stack drop-settings">${browser}${settings}</div><div class="stack">${results}</div></div>`;
 let content;
 if (selected) {
  const avg = expectedAttempts(p,d.quantity), confidence = attemptsForConfidence(p,d.quantity,d.confidence/100);
  const count = num(d.quantity,0), label = dropSuccessLabel(catalogEntry);
  const description = label ? tr("«{0}» · {1} не меньше {2}", name, label, count) : tr("Хотя бы {0} шт. «{1}»", count, name);
  content = workspace(dropSettingsView(data) + dropCostsView(d, confidence),
    resultCard(probabilityAtLeast(p,d.attempts,d.quantity),tr("ШАНС СОБРАТЬ ЦЕЛЬ ЗА {0} ПОПЫТОК", num(d.attempts,0)),description,avg,d.seconds,confidence,d.confidence)
    + chartCard(p,d.quantity,d.attempts)
    + notice(tr("Среднее число попыток — ориентир, а не гарантия. Модель предполагает независимые проверки с неизменным шансом. Время укажи вместе с дорогой, поиском и обработкой.")));
 } else {
  const picker = presets ? `<section class="card card-pad">${dropPresetPicker(d.preset)}</section>` : '';
  content = workspace(picker, `<section class="card empty drop-empty">${icon('target')}<h3>${presets ? tr("Выберите пресет") : tr("Выберите дроп из списка")}</h3>
    <p>${tr("Здесь появится расчёт для выбранного источника.")}</p></section>`);
 }
 return `<div class="drops-view">${dropTabs(browse.mode)}<div id="drop-panel" role="tabpanel" aria-labelledby="drop-tab-${browse.mode}">${content}</div></div>`;
}
function dropCostsView(d, confidence) {
 return `<section class="card card-pad"><div class="section-title"><h2>${tr("{0}Расход за попытку", icon('cube'))}</h2><button class="text-button" data-action="add-cost">${tr("{0}Добавить", icon('plus'))}</button></div>${d.costs.length?d.costs.map((c,i)=>`<div class="cost-row"><input aria-label="${tr("Название ресурса {0}", i+1)}" data-cost="${i}" data-prop="name" value="${esc(c.name)}" maxlength="140"><input aria-label="${tr("Расход ресурса {0}", i+1)}" type="number" data-cost="${i}" data-prop="amount" value="${c.amount}" min="0" max="1000000" step="any"><button class="icon-button" data-action="delete-cost" data-index="${i}" aria-label="${tr("Удалить ресурс")}">${icon('close')}</button></div>`).join(''):`<p class="subtitle" style="font-size:11px">${tr("Еда, приманка или другие затраты.")}<br>${tr("Укажи свой расход — посчитаем весь бюджет.")}</p>`}${d.costs.length?`<div class="cost-summary">${d.costs.map(c=>`<div class="cost-line"><span>${esc(c.name)}</span><b>${num(c.amount*d.attempts)} <span class="stat-sub">${tr("на план")}</span> · ${num(c.amount*confidence)} <span class="stat-sub">${tr("для {0}%", d.confidence)}</span></b></div>`).join('')}</div>`:''}</section>`;
}
function resultCard(probability,label,description,avg,seconds,confidence,level=95){
 const progress=Math.max(0,Math.min(100,probability*100)),formatted=pct(probability);
 return `<section class="card result-card probability-card"><div class="result-top">${constellation()}<div class="probability-orbit" role="img" aria-label="${tr("Вероятность достичь цели: {0}%", esc(formatted))}"><svg class="orbit-svg" viewBox="0 0 230 230" aria-hidden="true"><circle class="orbit-track" cx="115" cy="115" r="100"/><circle class="orbit-progress" cx="115" cy="115" r="100" pathLength="100" style="stroke-dasharray:${progress} 100" ${progress===0?'opacity="0"':''}/><circle class="orbit-ticks" cx="115" cy="115" r="87"/></svg><div class="orbit-content ${formatted.length>7?'compact':''}"><span class="orbit-caption">${tr("ШАНС ЦЕЛИ")}</span><div class="big-result">${formatted}<span>%</span></div><span class="orbit-note">${tr("по твоему плану")}</span></div></div><div class="result-copy"><p class="eyebrow">${esc(label)}</p><h2 class="result-description">${esc(description)}</h2><div class="result-stats"><div><div class="stat-label">${tr("{0}В среднем до цели", icon('chart'))}</div><div class="stat-value">${num(avg)}<small>${tr("попыток")}</small></div><div class="stat-sub">≈ ${duration(avg*seconds)}</div></div><div><div class="stat-label">${tr("{0}Для шанса {1}%", icon('shield'), level)}</div><div class="stat-value">${num(confidence,0)}<small>${tr("попыток")}</small></div><div class="stat-sub">≈ ${duration(confidence*seconds)}</div></div></div></div></div></section>`;
}
function chartCard(p,k,planned){
 const marks=[.5,.9,.95].map(c=>({c,n:attemptsForConfidence(p,k,c)}));
 const q=marks[2].n,max=Math.max(1,Math.min(1e8,Math.max(planned,Number.isFinite(q)?q:planned,10))),w=460,h=115,x0=33,y0=9;
 const points=Array.from({length:61},(_,i)=>{const x=Math.round(max*i/60);return[x0+w*i/60,y0+h*(1-probabilityAtLeast(p,x,k))];});
 const path=points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' '),px=x0+w*Math.min(planned,max)/max,py=y0+h*(1-probabilityAtLeast(p,planned,k));
 return`<section class="card chart-card"><div class="section-title"><h2>${tr("{0}Как растёт вероятность", icon('chart'))}</h2><span class="chart-legend"><i class="legend-dot"></i>${tr("шанс цели")}</span></div><svg class="chart" viewBox="0 0 510 155" role="img" aria-label="${tr("Вероятность получить минимум {0} предметов в зависимости от числа попыток; 95 процентов за {1} попыток", k, num(q,0))}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#78b7a3" stop-opacity=".25"/><stop offset="1" stop-color="#78b7a3" stop-opacity=".02"/></linearGradient></defs>${[0,.5,1].map(v=>`<path d="M${x0} ${y0+h*(1-v)}H${x0+w}" stroke="#334d56" stroke-dasharray="3 4"/><text x="23" y="${y0+h*(1-v)+3}" text-anchor="end">${v*100}%</text>`).join('')}<path d="${path} L${x0+w} ${y0+h}H${x0}Z" fill="url(#chart-fill)"/><path d="${path}" fill="none" stroke="#78b7a3" stroke-width="2.5"/><path d="M${px} ${y0}V${y0+h}" stroke="#dfb86f" stroke-dasharray="3 4"/><circle cx="${px}" cy="${py}" r="4" fill="#dfb86f" stroke="#1b2c37" stroke-width="2"/>${[0,.25,.5,.75,1].map(v=>`<text x="${x0+w*v}" y="146" text-anchor="middle">${num(Math.round(max*v),0)}</text>`).join('')}</svg><div class="thresholds">${marks.map(m=>`<div class="threshold"><b>${num(m.n,0)}</b><span>${tr("попыток для {0}%", m.c*100)}</span></div>`).join('')}</div></section>`;
}
function rarityView(){
 const r=state.rarity;
 let body;
 if(r.mode==='recraft'){
  const target=RARITIES[r.transition],from=RARITIES[r.transition-1],p=target.chance;
  body=`${hero(`${rarityName(from.en)} → ${rarityName(target.en)}`,tr("Один переход редкости · тир предмета сохраняется"),'sparkle',target)}<div class="workspace"><section class="card card-pad"><div class="section-title"><h2><span class="section-number">01</span>${tr("План перековки")}</h2></div>${selectField(tr("Переход редкости"),'rarity.transition',RARITIES.slice(1).map((x,i)=>[i+1,`${rarityName(RARITIES[i].en)} → ${rarityName(x.en)} · ${pct(x.chance)}%`]),r.transition)}<div class="row">${field(tr("Количество попыток"),'rarity.attempts',r.attempts)}${field(tr("Время на попытку"),'rarity.seconds',r.seconds,{unit:tr("сек"),max:86400,step:'any'})}</div><div class="tip">${icon('info')}<span>${tr("Неудача сохраняет редкость. Для Recraft нужны сам предмет, лом и Reforging Solvent. Точную стоимость смотри в рецепте игры.")}</span></div>${saveButton('rarity')}<div class="separator" style="margin-top:22px"></div><h3 style="margin-bottom:10px">${tr("Все переходы")}</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>${tr("Новая редкость")}</th><th>${tr("Шанс")}</th><th>${tr("Для 95%")}</th></tr></thead><tbody>${RARITIES.slice(1).map((x,i)=>`<tr class="${i+1===r.transition?'highlight':''}"><td><span class="rarity-name"><i class="rarity-dot" style="--rarity:${x.color}"></i>${esc(rarityName(x.en))}</span></td><td>${pct(x.chance)}%</td><td>${attemptsForConfidence(x.chance,1,.95)}</td></tr>`).join('')}</tbody></table></div></section><div class="stack">${resultCard(probabilityAtLeast(p,r.attempts),tr("ШАНС УСПЕШНОЙ ПЕРЕКОВКИ ЗА {0} ПОПЫТОК", num(r.attempts,0)),tr("Хотя бы один переход {0} → {1}", rarityName(from.en), rarityName(target.en)),1/p,r.seconds,attemptsForConfidence(p,1,.95))}${chartCard(p,1,r.attempts)}${notice(tr("Считается один переход. Для следующей ступени действует уже другой шанс. У Mythic дальнейшей ступени нет; среднее число попыток не обещает успеха."))}</div></div>`;
 }else{
  const distribution=rarityDistribution(r.start,r.startTier,r.targetTier),most=distribution.indexOf(Math.max(...distribution));
  body=`${hero(tr("От T{0} до T{1}", r.startTier, r.targetTier),tr("Одно улучшение на тир · без дополнительных перековок"),'sparkle')}<div class="workspace"><section class="card card-pad"><div class="section-title"><h2><span class="section-number">01</span>${tr("Цепочка улучшений")}</h2></div>${selectField(tr("Начальная редкость"),'rarity.start',RARITIES.map((x,i)=>[i,rarityName(x.en)]),r.start)}<div class="row">${selectField(tr("Начальный тир"),'rarity.startTier',Array.from({length:10-r.start},(_,i)=>[i+r.start+1,`T${i+r.start+1}`]),r.startTier)}${selectField(tr("Конечный тир"),'rarity.targetTier',Array.from({length:11-r.startTier},(_,i)=>[i+r.startTier,`T${i+r.startTier}`]),r.targetTier)}</div><div class="tip">${icon('info')}<span>${tr("Предмет может повысить редкость только на одну ступень за улучшение. Для обычной цепочки снаряжения Uncommon доступна с T2, Mythic — с T6.")}</span></div>${saveButton('rarity')}</section><section class="card card-pad"><div class="section-title"><h2>${tr("Редкость на T{0}", r.targetTier)}</h2><span class="badge">${tr("точное распределение")}</span></div>${distribution.map((p,i)=>`<div class="distribution-row"><span class="rarity-name"><i class="rarity-dot" style="--rarity:${RARITIES[i].color}"></i>${esc(rarityName(RARITIES[i].en))}</span><div class="probability-bar"><i style="width:${p*100}%;--bar:${RARITIES[i].color}"></i></div><b>${pct(p)}%</b></div>`).join('')}<div class="mini-total"><span>${tr("Наиболее вероятный результат")}</span><strong style="font-size:19px;color:${RARITIES[most].color}">${esc(rarityName(RARITIES[most].en))}</strong></div>${notice(tr("Показан шанс именно этой редкости. «1 из N» для полной цепочки не равно числу перековок уже легендарного предмета."))}</section></div><section class="card card-pad" style="margin-top:23px"><div class="section-title"><h2>${tr("Как меняются шансы по тирам")}</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>${tr("Тир")}</th>${RARITIES.map(x=>`<th>${esc(rarityName(x.en))}</th>`).join('')}</tr></thead><tbody>${Array.from({length:11-r.startTier},(_,i)=>{const tier=i+r.startTier;return`<tr class="${tier===r.targetTier?'highlight':''}"><td><b>T${tier}</b></td>${rarityDistribution(r.start,r.startTier,tier).map(p=>`<td>${p?pct(p)+'%':'—'}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div></section>`;
 }
 return`<div class="tabs-inline" role="tablist" aria-label="${tr("Режим редкости")}"><button role="tab" aria-selected="${r.mode==='recraft'}" class="${r.mode==='recraft'?'active':''}" data-action="rarity-mode" data-mode="recraft">${tr("Перековка")}</button><button role="tab" aria-selected="${r.mode==='tiers'}" class="${r.mode==='tiers'?'active':''}" data-action="rarity-mode" data-mode="tiers">${tr("Повышение тира")}</button></div>${body}`;
}
function resourcesView(){
 const mode=state.resourceCatalog.mode;
 const tabs=`<div class="tabs-inline resource-modes" role="tablist" aria-label="${tr("Режим справочника")}">${Object.entries(RESOURCE_MODES).map(([key,name])=>`<button role="tab" aria-selected="${mode===key}" class="${mode===key?'active':''}" data-action="resource-mode" data-mode="${key}">${tr(name)}</button>`).join('')}</div>`;
 return tabs+(mode==='custom'?customResourcesView():resourcesCatalogView(state.resourceCatalog,state.recipeBook));
}
function customResourcesView(){
 const r=state.resources;let plan,error;
 try{plan=planResources(r.recipes,r.targetId,r.quantity,r.inventory);}catch(e){error=e.message;}
 const recipe=r.recipes.find(x=>x.id===r.editId)||r.recipes[0];
 const materials=new Map();for(const x of r.recipes){materials.set(x.id,sampleName(x.id,x.name));for(const y of x.ingredients)if(!materials.has(y.id))materials.set(y.id,sampleName(y.id,y.name));}for(const x of r.recipes)materials.set(x.id,sampleName(x.id,x.name));
 return`<div class="warning">${icon('info')}<span><b>${tr("Рецепты — твои.")}</b> ${tr("Начальная цепочка учебная и не описывает рецепты BitCraft. Замени её нормами из игрового Compendium. Время считается последовательно, без сбора и дороги.")}</span></div><div class="workspace"><div class="stack"><section class="card card-pad"><div class="section-title"><h2><span class="section-number">01</span>${tr("Что создаём?")}</h2></div>${selectField(tr("Конечный предмет"),'resources.targetId',r.recipes.map(x=>[x.id,sampleName(x.id,x.name)]),r.targetId)}${field(tr("Нужно получить, с учётом запасов"),'resources.quantity',r.quantity,{unit:tr("шт"),max:1e6,step:'any'})}${saveButton('resources')}</section><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Книга рецептов", icon('hammer'))}</h2><button class="text-button" data-action="new-recipe">${tr("{0}Новый", icon('plus'))}</button></div>${selectField(tr("Редактировать рецепт"),'resources.editId',r.recipes.map(x=>[x.id,sampleName(x.id,x.name)]),recipe.id)}<div class="recipe-editor"><div class="recipe-item"><label class="field"><span>${tr("Название изделия")}</span><input value="${esc(sampleName(recipe.id,recipe.name))}" data-recipe="${esc(recipe.id)}" data-prop="name" maxlength="140"></label><div class="row"><label class="field"><span>${tr("Выход за крафт, шт")}</span><input type="number" value="${recipe.output}" min="0.000001" max="1000000" step="any" data-recipe="${esc(recipe.id)}" data-prop="output"></label><label class="field"><span>${tr("Время крафта, сек")}</span><input type="number" value="${recipe.seconds}" min="0" max="86400" step="any" data-recipe="${esc(recipe.id)}" data-prop="seconds"></label></div><div class="section-title" style="margin-top:10px"><h3>${tr("Состав одного крафта")}</h3><button class="text-button" data-action="new-ingredient" data-id="${esc(recipe.id)}">${tr("{0}Материал", icon('plus'))}</button></div>${recipe.ingredients.length?recipe.ingredients.map((x,i)=>`<div class="ingredient"><select aria-label="${tr("Ингредиент {0}", i+1)}" data-ingredient="${i}" data-recipe="${esc(recipe.id)}" data-prop="id">${[...materials].filter(([id])=>id!==recipe.id).map(([id,name])=>`<option value="${esc(id)}" ${x.id===id?'selected':''}>${esc(name)}${r.recipes.some(q=>q.id===id)?tr(" ↳ рецепт"):''}</option>`).join('')}</select><input aria-label="${tr("Количество ингредиента {0}", i+1)}" type="number" value="${x.amount}" min="0" max="1000000" step="any" data-ingredient="${i}" data-recipe="${esc(recipe.id)}" data-prop="amount"><button class="icon-button" data-action="delete-ingredient" data-id="${esc(recipe.id)}" data-index="${i}" aria-label="${tr("Удалить ингредиент")}">${icon('close')}</button></div>`).join(''):`<p class="subtitle" style="font-size:10px">${tr("Добавь материалы для расчёта.")}</p>`}</div><button class="text-button" data-action="delete-recipe" data-id="${esc(recipe.id)}" ${r.recipes.length===1?'disabled':''}>${tr("{0}Удалить этот рецепт", icon('trash'))}</button></div></section></div><div class="stack">${error?`<div class="error">${esc(error)}<br>${tr("Проверь связи между рецептами: изделие не должно входить в собственную цепочку.")}</div>`:`<section class="card result-card"><div class="result-top"><p class="eyebrow">${tr("ТВОЙ ПЛАН КРАФТА")}</p><div class="big-result" style="font-size:35px">${duration(plan.totalSeconds)}</div><p class="result-desc">${tr("Чистое время всех крафтов по цепочке")}</p><div class="result-badge">${icon('hammer')}</div></div><div class="result-stats"><div><div class="stat-label">${tr("Конечных крафтов")}</div><div class="stat-value">${num(plan.batches,0)}</div><div class="stat-sub">${tr("Выход: {0} шт.", num(plan.produced))}</div></div><div><div class="stat-label">${tr("Разных материалов")}</div><div class="stat-value">${plan.materials.filter(x=>x.missing>0).length}</div><div class="stat-sub">${tr("Нужно ещё собрать")}</div></div></div></section><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Список материалов", icon('cube'))}</h2><button class="text-button" data-action="copy-resources">${tr("{0}Копировать", icon('book'))}</button></div>${plan.materials.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>${tr("Ресурс")}</th><th>${tr("Всего")}</th><th>${tr("Есть")}</th><th>${tr("Собрать")}</th></tr></thead><tbody>${plan.materials.map(x=>`<tr><td>${esc(sampleName(x.id,x.name))}</td><td>${num(x.needed)}</td><td>${num(x.owned)}</td><td><b>${num(x.missing)}</b></td></tr>`).join('')}</tbody></table></div>`:`<p class="subtitle">${tr("Запасы закрывают цель, или у рецепта нет ингредиентов.")}</p>`}</section><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Порядок крафта", icon('hammer'))}</h2></div>${plan.steps.length?plan.steps.map((x,i)=>`<div class="cost-line" style="padding:8px 0"><span>${tr("{0}. {1} · {2} крафт.", i+1, esc(sampleName(x.id,x.name)), num(x.batches,0))}</span><b>${duration(x.seconds)}</b></div>`).join(''):`<p class="subtitle">${tr("Всё нужное уже в запасах.")}</p>`}${notice(tr("Крафты округляются вверх. Запасы и остатки партий используются один раз для всей цепочки."))}</section>`}<section class="card card-pad"><div class="section-title"><h2>${tr("{0}Уже в запасах", icon('bag'))}</h2><span class="badge">${tr("материалы и изделия")}</span></div><div class="table-wrap"><table class="data-table"><tbody>${[...materials].map(([id,name])=>`<tr><td>${esc(name)}</td><td style="text-align:right"><input class="table-input" type="number" min="0" max="100000000" step="any" value="${r.inventory[id]||0}" data-inventory="${esc(id)}" aria-label="${tr("В запасе: {0}", esc(name))}"></td></tr>`).join('')}</tbody></table></div></section></div></div>`;
}
function elapsed(){return state.time.elapsed+(state.time.startedAt?Math.max(0,(Date.now()-state.time.startedAt)/1000):0);}
function tick(){const clock=$('#timer-display');if(clock){const s=Math.floor(elapsed());clock.textContent=`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}}
function timeDropTip(attempts) {
 const {p,d,catalogEntry}=dropData();
 const label=dropSuccessLabel(catalogEntry);
 const goal=label ? tr("{0} не меньше {1}", label, num(d.quantity,0)) : tr("собрать {0} шт.", num(d.quantity,0));
 const average=label ? tr("Среднее число {0} за сессию · {1}", label, num(attempts*p)) : tr("Средний дроп за сессию · {0} шт.", num(attempts*p));
 return `<div class="tip" style="margin-top:15px">${icon('target')}<span>${tr("Шанс {0} —", goal)} <b>${pct(probabilityAtLeast(p,attempts,d.quantity))}%</b>. ${average}.</span></div>`;
}
function timeView(){const t=state.time,n=Math.floor(t.budget*3600/t.seconds);return`${hero(tr("Хорошее время для приключения"),tr("Пара часов, одна цель и немного удачи"),'clock')}<div class="workspace"><div class="stack"><section class="card card-pad"><div class="section-title"><h2><span class="section-number">01</span>${tr("Оценить сессию")}</h2></div><div class="row">${field(tr("Сколько есть времени?"),'time.budget',t.budget,{unit:tr("час"),max:10000,step:'any'})}${field(tr("На одну попытку"),'time.seconds',t.seconds,{unit:tr("сек"),min:.001,max:86400,step:'any'})}</div><div class="mini-total"><span>${tr("Успеешь выполнить")}</span><strong>${num(n,0)} <small style="font:11px 'Segoe UI'">${tr("попыток")}</small></strong></div>${timeDropTip(n)}<button class="secondary full" data-action="time-to-drop">${tr("{0}Перенести сессию в «Добычу»", icon('arrow'))}</button></section><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Твоё время", icon('chart'))}</h2></div><div class="result-stats" style="padding:0"><div><div class="stat-label">${tr("Сегодня")}</div><div class="stat-value">${duration(t.sessions.filter(x=>new Date(x.date).toDateString()===new Date().toDateString()).reduce((s,x)=>s+x.seconds,0))}</div></div><div><div class="stat-label">${tr("Все записи")}</div><div class="stat-value">${duration(t.sessions.reduce((s,x)=>s+x.seconds,0))}</div></div></div></section></div><div class="stack"><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Таймер приключения", icon('clock'))}</h2><span class="badge">${t.startedAt?tr("в пути"):tr("у костра")}</span></div><label class="field"><span>${tr("Чем занимаемся?")}</span><input data-key="time.label" value="${esc(localizeDefault(t.label,"Сбор ресурсов"))}" maxlength="140"></label><div class="timer-clock" id="timer-display" role="timer">00:00:00</div><p class="timer-status">${t.startedAt?tr("Считается по часам, даже если закрыть приложение."):tr("Запусти таймер, когда будешь готов.")}</p><div class="timer-buttons"><button class="primary" data-action="timer-toggle">${icon(t.startedAt?'pause':'play')}${t.startedAt?tr("Пауза"):t.elapsed?tr("Продолжить"):tr("Начать")}</button><button class="secondary" data-action="timer-finish">${tr("{0}Завершить", icon('check'))}</button></div></section><section class="card card-pad"><div class="section-title"><h2>${tr("{0}Журнал сессий", icon('book'))}</h2><span class="badge">${t.sessions.length} / 100</span></div>${t.sessions.length?t.sessions.map(x=>`<div class="session-row"><div class="session-icon">${icon('leaf')}</div><div class="session-text"><b>${esc(localizeDefault(x.label,"Сбор ресурсов"))}</b><small>${new Date(x.date).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div><strong>${duration(x.seconds)}</strong><button class="icon-button" data-action="delete-session" data-id="${esc(x.id)}" aria-label="${tr("Удалить сессию")}">${icon('close')}</button></div>`).join(''):`<div class="empty">${icon('leaf')}<h3>${tr("Здесь будут твои приключения")}</h3><p>${tr("Заверши первую сессию — сохраним её время.")}</p></div>`}</section></div></div>`;}
function journalView(){
 const plan=selectedPlan();
 const showChecklist=inChecklist();
 const modes=plan||showChecklist?`<div class="tabs-inline journal-tabs" role="tablist" aria-label="${tr("Мои планы")}">
  <button id="journal-tab-list" role="tab" aria-controls="journal-panel" aria-selected="${!showChecklist}" tabindex="${showChecklist?-1:0}" class="${showChecklist?'':'active'}" data-action="journal-mode" data-view="list">${tr("Мои планы")}</button>
  <button id="journal-tab-checklist" role="tab" aria-controls="journal-panel" aria-selected="${showChecklist}" tabindex="${showChecklist?0:-1}" class="${showChecklist?'active':''}" data-action="journal-mode" data-view="checklist">${tr("Список работ")}</button>
 </div>`:'';
 if(showChecklist)return modes+`<div id="journal-panel" role="tabpanel" aria-labelledby="journal-tab-checklist">${journalChecklist(plan)}</div>`;
 if(!getRecipeBook()&&!recipeCatalogError()&&state.saved.some(plan=>plan.type==="recipeBook"||plan.data?.catalogEntry))ensureRecipeCatalog().catch(()=>{});
 const cards=state.saved.map(saved=>{
  const {title,summary}=journalSummary(saved);
  return `<article class="card saved-card">
   <div class="section-title"><span class="badge">${tr(tabs.find(t=>t[0]===saved.type)[2])}</span>
    <button class="icon-button" data-action="delete-saved" data-id="${esc(saved.id)}" aria-label="${tr("Удалить сохранённый план")}">${icon('close')}</button></div>
   <h2>${esc(title)}</h2><p>${esc(summary)}</p>
   <div class="saved-card-footer"><span>${formatDate(saved.date,{day:'numeric',month:'long'})}</span>
    <button class="secondary saved-open" data-action="open-saved" data-id="${esc(saved.id)}">${tr("Открыть {0}", icon('arrow'))}</button></div>
  </article>`;
 }).join('');
 return modes+`<div id="journal-panel"${modes?' role="tabpanel" aria-labelledby="journal-tab-list"':''}>
  <div class="journal-tools"><p>${state.saved.length?tr("Сохранено планов: {0} из 50", state.saved.length):tr("Любой расчёт можно сохранить кнопкой «Сохранить план».")}</p>
   <button class="secondary" data-action="export">${tr("{0}Резервная копия", icon('download'))}</button></div>
  ${cards?`<div class="journal-grid">${cards}</div>`:`<section class="card empty" style="padding:75px 25px">${icon('book')}<h3>${tr("Здесь живут твои будущие планы")}</h3><p>${tr("Сохрани охоту за дропом, перековку или список ресурсов.")}<br>${tr("Параметры и рецепты останутся в этом блокноте.")}</p><button class="primary" style="margin:22px auto 0" data-action="tab" data-tab="drops">${tr("{0}Спланировать добычу", icon('bag'))}</button></section>`}
 </div>`;
}

const checklistPlans=new WeakMap();
function checklistFor(plan){
 const book=plan.type==='recipeBook'?getRecipeBook():null;
 const cached=checklistPlans.get(plan);
 if(cached&&cached.book===book)return cached;
 const data=plan.data;
 const production=book?(journalSummary(plan).plan??recipeSummary(data).plan)
  :planResources(data.recipes,data.targetId,data.quantity,data.inventory,{includeTree:true});
 const checklist=book?createRecipeChecklist(book,data,production.tree):createPlanChecklist(production.tree);
 const view={book,checklist,mode:'chain',collapsed:new Set()};
 checklistPlans.set(plan,view);
 return view;
}

function journalChecklist(plan){
 if(!plan)return `<section class="card card-pad" role="status"><p>${tr("Открой производственный план из списка.")}</p></section>`;
 const book=getRecipeBook();
 if(plan.type==='recipeBook'&&!book){
  const error=recipeCatalogError();
  if(!error)ensureRecipeCatalog().catch(()=>{});
  return `<section class="card card-pad" role="status"><h2>${error?tr("Не удалось открыть рецептурную книгу"):tr("Открываем рецептурную книгу…")}</h2>
   ${error?`<p class="subtitle">${esc(error)}</p><button class="secondary" data-action="recipe-retry">${tr("Повторить")}</button>`:''}</section>`;
 }
 const changedSnapshot=plan.type==='recipeBook'&&plan.data.snapshot&&plan.data.snapshot!==recipeCatalogVersion();
 const warning=changedSnapshot?`<p class="warning">${tr("Снимок каталога изменился. Сверь позиции с расчётом.")}</p>`:'';
 try{
  if(plan.type==='recipeBook'&&!book.entitiesByKey.has(plan.data.targetKey))throw Error(tr("Предмет из плана отсутствует в каталоге."));
  return warning+planChecklistView(plan,checklistFor(plan),{
   title:journalSummary(plan).title,icon,sampleName,disabled:storageConflict});
 }catch(error){
  return `<section class="card card-pad"><p>${esc(error.message)}</p>
   <button class="secondary" data-action="open-plan-calculation" data-id="${esc(plan.id)}">${tr("К расчёту {0}", icon('arrow'))}</button></section>`;
 }
}

function showModal(html){$('#modal').innerHTML=html;$('#modal').showModal();}
function closeModal(){$('#modal').close();}
function catalogLanguagesDialog(){
 showModal(`<h2 id="catalog-language-title">${tr('Переводы BitCraft')}</h2>
  <p>${tr('Выбери файл catalog.json, созданный импортом переводов из Steam.')}
   ${tr('Словарь хранится в этом браузере и доступен без сети.')}</p>
  <form id="catalog-language-form" aria-labelledby="catalog-language-title">
   <label class="field"><span>${tr('Файл словаря')}</span><input id="catalog-language-file" name="pack" type="file" accept=".json,application/json" required></label>
   <p role="alert" class="warning" data-catalog-language-error hidden></p>
   <div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${tr('Отмена')}</button>
    <button type="submit" class="primary">${tr('Подключить')}</button></div>
  </form>`);
}
function sources(){showModal(`<h2>${tr("Твой полевой помощник")}</h2><p>${tr("Сайт хранит настройки, запасы, рецепты, планы и таймер в браузере. Экспорт JSON создаёт резервную копию. Для первого открытия и подготовки автономного режима нужно подключение к сайту.")}</p><div class="source-list"><div><b>${tr("Контрольные примеры добычи и редкости")}</b><br>${tr("«BitCraft Online 1.0: Rarity and Drops RU». Снимок: 13.11.2026, справочник: 14.11.2026. Конкретные шансы могут измениться на сервере — проверь Obtain / Use в Compendium или укажи свой шанс.")}</div><div><b>${tr("Первоисточники справочника")}</b><br><a href="https://bitcraftonline.com/news/bitcraft-online-1-0-patch-notes" target="_blank" rel="noreferrer">${tr("Официальные патчноуты 1.0 ↗")}</a><br><a href="https://github.com/clockworklabs/BitCraftPublic" target="_blank" rel="noreferrer">${tr("Серверный код Clockwork Labs ↗")}</a><br>${tr("Таблицы BitCraftToolBox: снимок af485cdbbb, указанный в PDF.")}</div><div><b>${tr("Как считаем")}</b><br>${tr("Шанс хотя бы одной удачной выдачи равен 1 − (1 − p)ⁿ. Для нескольких выдач используется биномиальное распределение. Среднее до k удачных выдач равно k / p. При ненулевом риске неудачи результат может округлиться до 100%. В «Добыче» шанс указан для единицы попытки из карточки. Для переменного количества считаются удачные выдачи или выдачи с бонусом. «Добыча» и «Рецепты» используют локальный снимок BitCraftToolBox от 13.11.2026 (af485cdbbb). Время крафта — базовая оценка при скорости ×1 и прогрессе 1 за действие, без критов; сбор и дорога не включены. Раздел «Ресурсы» содержит игровой справочник материалов и источников; собственные рецепты сохранены в режиме «Мои рецепты».")}</div><div><b>${tr("Где хранятся данные")}</b><br>${tr("Сохранения привязаны к адресу сайта и профилю браузера. Очистка данных сайта удаляет записи. В приватном режиме они могут исчезнуть после закрытия окна.")}</div><div id="web-offline-settings">${webSettings()}</div></div><div class="modal-actions"><button class="primary" data-action="close-modal">${tr("Понятно {0}", icon('check'))}</button></div>`);}
function describePlan(type, data) {
 if(type==='recipeBook')return recipeSummary(data);
 if(type==='drops'){
  const {p,name,d,catalogEntry}=dropData(data);
  const title=`${name} · ${num(d.quantity,0)} ${dropSuccessLabel(catalogEntry) || tr("шт.")}`;
  let summary=tr("{0} попыток · {1}% до цели · {2} на план", num(d.attempts,0), pct(probabilityAtLeast(p,d.attempts,d.quantity)), duration(d.attempts*d.seconds));
  if(catalogEntry)summary+=` · ${gameName(catalogEntry.sourceName)}`;
  return {title,summary};
 }
 if(type==='rarity'){
  const r=data;
  if(r.mode==='recraft')return {
   title:`${rarityName(RARITIES[r.transition-1].en)} → ${rarityName(RARITIES[r.transition].en)}`,
   summary:tr("{0} перековок · {1}% успеха", num(r.attempts,0), pct(probabilityAtLeast(RARITIES[r.transition].chance,r.attempts)))
  };
  return {title:tr("Цепочка T{0} → T{1}", r.startTier, r.targetTier),
   summary:tr("Старт: {0} · одно улучшение на тир", rarityName(RARITIES[r.start].en))};
 }
 const plan=planResources(data.recipes,data.targetId,data.quantity,data.inventory);
 return {title:tr("{0} · {1} шт.", sampleName(data.targetId,data.recipes.find(x=>x.id===data.targetId).name), num(data.quantity)),
  summary:tr("{0} крафта · {1} материалов собрать", duration(plan.totalSeconds), plan.materials.filter(x=>x.missing>0).length)};
}
const journalSummaries=new WeakMap();
function journalSummary(plan){
 const book=getRecipeBook();
 const language=catalogSearchKey();
 const previous=journalSummaries.get(plan);
 if(previous?.language===language&&previous.book===book)return previous.summary;
 let summary=plan;
 try{
  if(plan.type!=='recipeBook'||(book&&(!plan.data.snapshot||plan.data.snapshot===recipeCatalogVersion())))summary=describePlan(plan.type,plan.data);
 }catch{/* Keep the original summary if the plan can't be evaluated. */}
 journalSummaries.set(plan,{language,book,summary});
 return summary;
}
async function savePlan(type){
 const data=structuredClone(state[type==='drops'?'drop':type]);
 if(type==='recipeBook')data.snapshot=recipeCatalogVersion();
 const {title,summary}=describePlan(type,data);
 state.saved.unshift({id:uid(),type,title,summary,data,date:Date.now()});state.saved=state.saved.slice(0,50);
 const saving=persist();render();if(await saving)toast(tr("План сохранён в «Мои планы»."));
}
function exportData(){const blob=new Blob([JSON.stringify(stateForStorage(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=tr("BitCraft-планы-{0}.json", new Date().toLocaleDateString('sv-SE'));document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(tr("Резервная копия готова к сохранению."));}
function newIngredient(id){
 const names=new Map();for(const r of state.resources.recipes){if(r.id!==id)names.set(r.id,tr("{0} ↳ рецепт", sampleName(r.id,r.name)));for(const i of r.ingredients)if(i.id!==id&&!names.has(i.id))names.set(i.id,sampleName(i.id,i.name));}
 showModal(`<h2>${tr("Добавить материал")}</h2><form id="ingredient-form" data-id="${esc(id)}"><label class="field"><span>${tr("Из книги или новый ресурс?")}</span><select name="existing"><option value="new">${tr("＋ Новый базовый ресурс")}</option>${[...names].map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}</select></label><label class="field"><span>${tr("Название нового ресурса")}</span><input name="name" maxlength="140" placeholder="${tr("Например, железная руда")}"></label><label class="field"><span>${tr("На один крафт")}</span><input name="amount" type="number" value="1" min="0.000001" max="1000000" step="any" required></label><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${tr("Отмена")}</button><button class="primary" type="submit">${tr("Добавить")}</button></div></form>`);
}
function getValue(key){const [a,b]=key.split('.');return state[a][b];}
function setValue(key,value){
 const [section,field]=key.split('.');
 if(key==='resources.targetId')setProductionTarget(state.resources,value,'targetId');
 else state[section][field]=value;
}
const productionQuantityFields=new Set(['recipeBook.quantity','resourceCatalog.quantity','resources.quantity']);
function syncDropChance(){
 const preset=DROPS.find(entry=>entry.id===state.drop.preset);
 if(preset)state.drop.chance=preset.chance*100;
}
async function postChange(key){
 if(productionQuantityFields.has(key)){refresh();return;}
 if(key==='drop.preset'){
  state.drop.catalogEntry=null;
  if(!DROPS.some(entry=>entry.id===state.drop.preset))state.drop.preset='custom';
  syncDropChance();
 }
 if(key==='drop.chance'&&state.drop.preset!=='custom'&&state.drop.preset!=='catalog'){
  const current=DROPS.find(entry=>entry.id===state.drop.preset);
  state.drop.name=presetName(current);state.drop.preset='custom';
 }
 if(key==='rarity.start'){state.rarity.startTier=Math.max(state.rarity.startTier,state.rarity.start+1);state.rarity.targetTier=Math.max(state.rarity.startTier,state.rarity.targetTier);}
 if(key==='rarity.startTier'){state.rarity.targetTier=Math.max(state.rarity.startTier,state.rarity.targetTier);}
 const saving=persist();refresh();await saving;
}
document.addEventListener('change',async e=>{
 if(e.target.id==='interface-language'){
  if(e.target.value===importLanguageOption){
   e.target.value=currentLanguage();
   catalogLanguagesDialog();
   return;
  }
  preferredLanguage=languagePreference(e.target.value);
  storeLanguagePreference(preferredLanguage);
  await refreshLanguage();
  return;
 }
 const el=e.target;if(['import-file','catalog-language-file','guide-search','dungeon-search','world-search','drop-search'].includes(el.id))return;if(storageConflict){toast(tr("Сначала открой актуальные данные или экспортируй текущую копию."));return;}
 if(el.hasAttribute('data-plan-progress')){
  if(!el.validity.valid||el.value===''){
   const progress=selectedPlan()?.progress??{};
   const key=el.dataset.planProgress;
   el.value=Object.hasOwn(progress,key)?progress[key]:0;
  }
  return;
 }
 try{
  if(el.dataset.dropFilter){
   state.dropBrowser=normalizeDropBrowser({...state.dropBrowser,[el.dataset.dropFilter]:el.value,page:0});
   refreshDropResults();
   await persist();
   return;
  }
  if(el.dataset.worldFilter){
   const key=el.dataset.worldFilter;
   const value=key==='biomeId'?Number(el.value):el.value;
   state.world={...normalizeWorldState({...state.world,[key]:value}),page:0};
   refreshWorldResults();
   await persist();
   return;
  }
  if(el.hasAttribute('data-guide-level')){
   state.guide.id=Number(el.dataset.id);
   state.guide.level=Number(el.value);
   const saving=persist();
   render();
   $('[data-guide-level]')?.focus({preventScroll:true});
   await saving;
   return;
  }
  if(el.matches('input[type="number"]')&&(!el.validity.valid||el.value==='')){toast(tr("Проверь значение и допустимый диапазон."));render();return;}
  if(el.dataset.key){const key=el.dataset.key,old=getValue(key);setValue(key,typeof old==='number'?Number(el.value):el.value);await postChange(key);return;}
  if(el.dataset.cost!==undefined){state.drop.costs[Number(el.dataset.cost)][el.dataset.prop]=el.dataset.prop==='amount'?Number(el.value):el.value;}
  if(el.dataset.resourceFilter){const key=el.dataset.resourceFilter;state.resourceCatalog[key]=el.type==='checkbox'?el.checked:el.value;state.resourceCatalog.page=0;}
  if(el.dataset.recipeFilter){const key=el.dataset.recipeFilter;state.recipeBook[key]=el.type==='checkbox'?el.checked:el.value;state.recipeBook.page=0;}
  if(el.dataset.recipeRarity)state.recipeBook.rarityPreference={key:el.dataset.recipeRarity,scope:el.value};
  if(el.dataset.recipeMethod){
   if(el.value)state.recipeBook.selections[el.dataset.recipeMethod]=el.value;
   else delete state.recipeBook.selections[el.dataset.recipeMethod];
  }
  if(el.dataset.recipeStock){state.recipeBook.inventory[el.dataset.recipeStock]=Number(el.value);}
  if(el.dataset.inventory){state.resources.inventory[el.dataset.inventory]=Number(el.value);}
  if(el.dataset.recipe){const recipe=state.resources.recipes.find(r=>r.id===el.dataset.recipe);if(el.dataset.ingredient!==undefined){const ing=recipe.ingredients[Number(el.dataset.ingredient)];if(el.dataset.prop==='id'){ing.id=el.value;const refs=state.resources.recipes.flatMap(r=>[r,...r.ingredients]);ing.name=refs.find(x=>x.id===el.value)?.name||el.value;}else ing.amount=Number(el.value);}else{recipe[el.dataset.prop]=el.dataset.prop==='name'?el.value:Number(el.value);for(const r of state.resources.recipes)for(const i of r.ingredients)if(i.id===recipe.id)i.name=recipe.name;}}
  if(el.closest('#modal'))return;
  const saving=persist();refresh();await saving;
 }catch(error){toast(error.message);}
});
async function refreshLanguage(){
 const ready=await updateLanguage();
 if(ready===undefined)return;
 const focused=document.activeElement?.id==='interface-language';
 refresh();
 if(focused)$('#interface-language')?.focus({preventScroll:true});
 if(!ready)toast(tr('Перевод BitCraft не загрузился.'));
}
window.addEventListener('languagechange',()=>{if(preferredLanguage==='system')void refreshLanguage();});
window.addEventListener('storage',event=>{
 if(event.key!==LANGUAGE_KEY)return;
 preferredLanguage=languagePreference(event.newValue);
 void refreshLanguage();
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
 const a=b.dataset.action,previousTab=state.tab;
 const previousChecklist=inChecklist();
 const previousDropScroll=a==='drop-target'?b.closest('.drop-results-list')?.scrollTop:0;
 try{
  if(a==='close-modal'){closeModal();return;}
  if(a==='sources'){sources();return;}
  if(a==='export'){exportData();return;}
  if(a==='web-update'){if(storageConflict)throw Error(tr("Сначала экспортируй текущую копию и открой актуальные данные."));if(!await persist())throw Error(tr("Сначала экспортируй данные: сохранить изменения не удалось."));await applyWebUpdate();return;}
  if(a==='web-download-images'){await prepareOfflineImages();return;}
  if(a==='storage-reload'){const saved=stateStore.read();state=saved?normalize(JSON.parse(saved)):defaults();storageConflict=false;storageAvailable=true;routeInitialized=false;render();toast(tr("Открыты актуальные данные."));return;}
  if(a==='plan-mode'||a==='plan-branch'){
   const plan=selectedPlan();
   const view=plan&&checklistPlans.get(plan);
   if(!view||!previousChecklist)return;
   if(a==='plan-mode'){
    const mode=b.dataset.mode;
    if(mode!==view.mode){
     view.mode=mode;
     $('#journal-panel').innerHTML=journalChecklist(plan);
     $(`#plan-tab-${mode}`)?.focus({preventScroll:true});
    }
   }else{
    const id=Number(b.dataset.branch);
    if(!view.collapsed.delete(id))view.collapsed.add(id);
    updatePlanBranches(b.closest('.plan-checklist'),view.checklist,view.collapsed);
   }
   return;
  }
  if(storageConflict){toast(tr("Сначала открой актуальные данные или экспортируй текущую копию."));return;}
  if(a==='import'){$('#import-file').click();return;}
  if(a==='resource-mode'){
   if(Object.hasOwn(RESOURCE_MODES,b.dataset.mode))setResourceMode(state.resourceCatalog,b.dataset.mode);
  }
  if(a==='resource-target'){
   const r=state.resourceCatalog;
   setResourceMode(r,resourceModeForKey(b.dataset.id));
   setProductionTarget(r,b.dataset.id);r.stationPage=0;
   state.tab='resources';
  }
  if(a==='resource-page'){state.resourceCatalog.page+=Number(b.dataset.delta);}
  if(a==='resource-station-page'){state.resourceCatalog.stationPage+=Number(b.dataset.delta);}
  if(a==='resource-reset'){Object.assign(state.resourceCatalog,{search:'',tier:'',category:'',buildingCategory:'',creatureCategory:'',showNodes:false,page:0,stationPage:0});}
  if(a==='resource-plan'){state.recipeBook.targetKey=b.dataset.id;state.recipeBook.quantity=state.resourceCatalog.quantity;state.recipeBook.snapshot=recipeCatalogVersion();state.tab='recipeBook';}
  if(a==='resource-retry'){retryResourceCatalog();return;}
  if(a==='guide-retry'){retryGuide();return;}
  if(a==='guide-mode'||a==='guide-target'){
   const mode=b.dataset.mode;
   if(!GUIDE_MODES.includes(mode))return;
   if(a==='guide-mode'&&state.guide.mode===mode)return;
   const settings=b.closest('#guide-results')?state.guide:{...guideDefaults(),page:-1};
   state.guide={...settings,mode,id:Number(b.dataset.id||0),level:Number(b.dataset.level||0)};
   state.tab='guide';
  }
  if(a==='guide-page')state.guide.page+=Number(b.dataset.delta);
  if(a==='world-mode'||a==='world-target'){
   const mode=b.dataset.mode;
   if(!Object.hasOwn(WORLD_MODES,mode)||(a==='world-mode'&&state.world.mode===mode))return;
   const fromResults=b.closest('#world-results');
   const settings=fromResults?state.world:worldDefaults(mode);
   state.world={...settings,id:Number(b.dataset.id||0),page:fromResults?settings.page:-1};
   state.tab='world';
  }
  if(a==='world-page'){
   state.world.page=Number(b.dataset.page);
   refreshWorldResults()?.querySelector('.world-result')?.focus();
   await persist();
   return;
  }
  if(a==='world-reset'){
   const {mode,id}=state.world;
   state.world={...worldDefaults(mode),id,page:id?-1:0};
  }
  if(a==='dungeon-target'){
   const settings=b.closest('#dungeon-results')?state.dungeons:dungeonDefaults();
   state.dungeons=normalizeDungeonState({...settings,id:Number(b.dataset.id)});
   state.tab='dungeons';
  }
  if(a==='drop-mode'){
   const mode=b.dataset.mode;
   if(!Object.hasOwn(DROP_MODES,mode)||mode===state.dropBrowser.mode)return;
   state.dropBrowser={...dropBrowserDefaults(mode),page:state.drop.catalogEntry?.group===mode?-1:0};
  }
  if(a==='drop-page'){
   state.dropBrowser.page=Number(b.dataset.page);
   refreshDropResults()?.querySelector('.drop-result')?.focus({preventScroll:true});
   await persist();
   return;
  }
  if(a==='drop-reset')state.dropBrowser=dropBrowserDefaults(state.dropBrowser.mode);
  if(a==='drop-target'){
   const entry=findDropEntry(getRecipeBook(),b.dataset.id);
   if(!entry||entry.group!==state.dropBrowser.mode)return;
   Object.assign(state.drop,{preset:'catalog',catalogEntry:entry,name:entry.name,chance:entry.chance*100});
  }
  if(a==='drop-from-catalog'){
   state.drop.preset=b.dataset.id;
   state.drop.catalogEntry=null;
   state.dropBrowser=dropBrowserDefaults();
   syncDropChance();
   state.tab='drops';
  }
  if(a==='recipe-retry'){retryRecipes();return;}
  if(a==='recipe-target'){setProductionTarget(state.recipeBook,b.dataset.id);state.tab='recipeBook';}
  if(a==='recipe-page'){state.recipeBook.page+=Number(b.dataset.delta);}
  if(a==='recipe-reset'){Object.assign(state.recipeBook,{search:'',tier:'',type:'',rarity:'',showHidden:false,page:0});}
  if(a==='recipe-copy'){const text=recipeCopyText(state.recipeBook);try{await navigator.clipboard.writeText(text);toast(tr("Список материалов скопирован."));}catch{showModal(`<h2>${tr("Список материалов")}</h2><label class="field"><textarea readonly style="height:220px">${esc(text)}</textarea></label><div class="modal-actions"><button class="primary" data-action="close-modal">${tr("Закрыть")}</button></div>`);}return;}
  if(a==='save'){await savePlan(b.dataset.type);return;}
  if(a==='tab'){
   state.tab=b.dataset.tab;
   if(state.tab==='journal')state.journal.view='list';
  }
  if(a==='journal-mode'){
   if(b.dataset.view===state.journal.view)return;
   state.journal.view=b.dataset.view;
  }
  if(a==='step'){setValue(b.dataset.key,Math.max(1,Math.min(10000,getValue(b.dataset.key)+Number(b.dataset.delta))));}
  if(a==='add-cost'){if(state.drop.costs.length>=30){toast(tr("Можно добавить до 30 ресурсов."));return;}state.drop.costs.push({name:tr("Расходник"),amount:1});}
  if(a==='delete-cost')state.drop.costs.splice(Number(b.dataset.index),1);
  if(a==='rarity-mode')state.rarity.mode=b.dataset.mode;
  if(a==='new-recipe'){if(state.resources.recipes.length>=100){toast(tr("В книге уже 100 рецептов."));return;}showModal(`<h2>${tr("Новый рецепт")}</h2><form id="recipe-form"><label class="field"><span>${tr("Название изделия")}</span><input name="name" required maxlength="140" placeholder="${tr("Название из Compendium")}" autofocus></label><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">${tr("Отмена")}</button><button class="primary" type="submit">${tr("Создать")}</button></div></form>`);return;}
  if(a==='new-ingredient'){newIngredient(b.dataset.id);return;}
  if(a==='delete-ingredient')state.resources.recipes.find(r=>r.id===b.dataset.id).ingredients.splice(Number(b.dataset.index),1);
  if(a==='delete-recipe'){state.resources.recipes=state.resources.recipes.filter(r=>r.id!==b.dataset.id);if(state.resources.targetId===b.dataset.id)setProductionTarget(state.resources,state.resources.recipes[0].id,'targetId');state.resources.editId=state.resources.recipes[0].id;}
  if(a==='copy-resources'){const r=state.resources,p=planResources(r.recipes,r.targetId,r.quantity,r.inventory),text=tr("{0} × {1}\n{2}\nВремя крафта: {3}", sampleName(r.targetId,r.recipes.find(x=>x.id===r.targetId).name), num(r.quantity), p.materials.map(x=>tr("{0}: собрать {1} (всего {2}, есть {3})", sampleName(x.id,x.name), num(x.missing), num(x.needed), num(x.owned))).join('\n'), duration(p.totalSeconds));try{await navigator.clipboard.writeText(text);toast(tr("Список материалов скопирован."));}catch{showModal(`<h2>${tr("Список материалов")}</h2><label class="field"><textarea readonly style="height:180px">${esc(text)}</textarea></label><div class="modal-actions"><button class="primary" data-action="close-modal">${tr("Закрыть")}</button></div>`);}return;}
  if(a==='timer-toggle'){if(state.time.startedAt){state.time.elapsed=elapsed();state.time.startedAt=null;}else state.time.startedAt=Date.now();}
  if(a==='timer-finish'){const seconds=elapsed();if(seconds<1){toast(tr("Сначала запусти таймер."));return;}state.time.sessions.unshift({id:uid(),label:state.time.label||tr("Сессия"),seconds,date:Date.now()});state.time.sessions=state.time.sessions.slice(0,100);state.time.startedAt=null;state.time.elapsed=0;toast(tr("Сессия добавлена в журнал."));}
  if(a==='delete-session')state.time.sessions=state.time.sessions.filter(x=>x.id!==b.dataset.id);
  if(a==='time-to-drop'){
   state.drop.seconds=state.time.seconds;
   state.drop.attempts=Math.min(1e8,Math.floor(state.time.budget*3600/state.time.seconds));
   const mode=state.drop.catalogEntry?.group??'presets';
   if(state.dropBrowser.mode!==mode)state.dropBrowser={...dropBrowserDefaults(mode),page:-1};
   state.tab='drops';toast(tr("Время и попытки перенесены в план добычи."));
  }
  if(a==='delete-saved'){
   state.saved=state.saved.filter(x=>x.id!==b.dataset.id);
   if(state.journal.id===b.dataset.id)state.journal={view:'list',id:''};
  }
  if(a==='open-saved'||a==='open-plan-calculation'){
   const s=state.saved.find(x=>x.id===b.dataset.id);
   if(!s)return;
   if(a==='open-saved'&&isProductionPlan(s)){
    state.tab='journal';
    state.journal={view:'checklist',id:s.id};
   }else{
    state[s.type==='drops'?'drop':s.type]=structuredClone(s.data);
    state.tab=s.type;
    if(s.type==='resources')state.resourceCatalog.mode='custom';
    if(s.type==='drops')state.dropBrowser={...dropBrowserDefaults(state.drop.catalogEntry?.group),page:-1};
   }
  }
  if(a==='recover'){const d=defaults();if(state.tab==='resources'&&state.resourceCatalog.mode!=='custom')state.resourceCatalog=d.resourceCatalog;else state[state.tab==='drops'?'drop':state.tab]=d[state.tab==='drops'?'drop':state.tab];if(state.tab==='drops')state.dropBrowser=d.dropBrowser;}
  const focusPageHeading=state.tab!==previousTab&&(['recipeBook','dungeons','world','journal'].includes(state.tab)||a==='resource-target')
   || (!previousChecklist&&inChecklist());
  const saving=persist();render();
  if(a==='recipe-target'&&b.dataset.method){
   const method=$(`#recipe-acquisition [data-recipe-details="${CSS.escape(b.dataset.method)}"]`);
   if(method)method.open=true;
  }
  if(a==='drop-mode'){
   $(`#drop-tab-${state.dropBrowser.mode}`)?.focus({preventScroll:true});
  }else if(a==='drop-target'){
   const list=$('.drop-results-list');
   if(list&&previousDropScroll)list.scrollTop=previousDropScroll;
   if(matchMedia('(max-width:820px)').matches){
    const title=$('#drop-settings-title');
    title?.focus({preventScroll:true});title?.scrollIntoView({block:'start'});
   }else $(`.drop-result[data-id="${CSS.escape(b.dataset.id)}"]`)?.focus({preventScroll:true});
  }else if(a==='drop-reset'){
   $('#drop-search')?.focus({preventScroll:true});
  }else if(['guide-target','dungeon-target','world-target'].includes(a)){
   const detail=$(`#${a.replace('-target','')}-detail`);
   detail?.focus({preventScroll:true});
   detail?.scrollIntoView({block:'start'});
  }else if(a==='world-mode'){
   $(`#world-tab-${state.world.mode}`)?.focus({preventScroll:true});
  }else if(a==='world-reset'){
   $('#world-search')?.focus({preventScroll:true});
  }else if(a==='journal-mode'){
   window.scrollTo(0,0);
   $(inChecklist()?'#journal-tab-checklist':'#journal-tab-list')?.focus({preventScroll:true});
  }else if(focusPageHeading||a==='drop-from-catalog'||(state.tab!==previousTab&&(state.tab==='guide'||['guide','dungeons','world'].includes(previousTab)))){
   window.scrollTo(0,0);
   if(focusPageHeading){
    const heading=$('.page-title h1');
    heading.tabIndex=-1;
    heading.focus({preventScroll:true});
   }
  }
  await saving;
 }catch(error){toast(error.message);}
});
document.addEventListener('submit',async e=>{
 if(e.target.id==='catalog-language-form'){
  e.preventDefault();
  const form=e.target,button=form.querySelector('button[type="submit"]'),errorMessage=form.querySelector('[data-catalog-language-error]');
  if(button.disabled)return;
  button.disabled=true;
  errorMessage.hidden=true;
  try{
   gameLanguages=await importCatalogLanguages(form.elements.pack.files[0]);
   if(form.isConnected)closeModal();
   await refreshLanguage();
   $('#interface-language')?.focus({preventScroll:true});
   toast(tr('Переводы BitCraft подключены.'));
  }catch(error){
   errorMessage.textContent=error.message;
   errorMessage.hidden=false;
  }finally{button.disabled=false;}
  return;
 }
 if(!['recipe-form','ingredient-form'].includes(e.target.id))return;e.preventDefault();if(storageConflict)return;
 const data=new FormData(e.target),r=state.resources;
 if(e.target.id==='recipe-form'){const name=String(data.get('name')).trim();if(!name)return;const recipe={id:uid(),name,output:1,seconds:0,ingredients:[]};r.recipes.push(recipe);r.editId=recipe.id;setProductionTarget(r,recipe.id,'targetId');}
 if(e.target.id==='ingredient-form'){const recipe=r.recipes.find(x=>x.id===e.target.dataset.id),existing=data.get('existing');if(recipe.ingredients.length>=100){toast(tr("Не более 100 материалов в одном рецепте."));return;}let id,name;if(existing==='new'){name=String(data.get('name')).trim();if(!name){toast(tr("Укажи название нового ресурса."));return;}const refs=r.recipes.flatMap(x=>[x,...x.ingredients]);id=refs.find(x=>x.name.toLocaleLowerCase()===name.toLocaleLowerCase())?.id||uid();}else{id=existing;name=r.recipes.flatMap(x=>[x,...x.ingredients]).find(x=>x.id===id)?.name||id;}recipe.ingredients.push({id,name,amount:Number(data.get('amount'))});}
 closeModal();const saving=persist();render();await saving;
});
$('#import-file').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 try{if(file.size>2e6)throw Error(tr("Файл слишком большой. Максимум 2 МБ."));const candidate=normalize(JSON.parse(await file.text()));await stateStore.importValueLocked(JSON.stringify(stateForStorage(candidate)),JSON.stringify(stateForStorage(state)));state=candidate;storageAvailable=true;syncRoute(true);render();toast(tr("Данные импортированы. Предыдущая копия сохранена локально."));}catch(error){toast(tr("Импорт: ")+error.message);}
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input')&&!e.target.closest('dialog')){e.preventDefault();e.target.blur();}});
document.addEventListener('keydown',e=>{
 const tab=e.target.closest('[data-action="world-mode"],[data-action="drop-mode"],[data-action="journal-mode"],[data-action="plan-mode"]');
 if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
 const buttons=[...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
 let next=buttons.indexOf(tab)+(e.key==='ArrowLeft'?-1:1);
 if(e.key==='Home')next=0;
 if(e.key==='End')next=buttons.length-1;
 e.preventDefault();
 buttons[(next+buttons.length)%buttons.length].click();
});
configureRecipes({refresh,icon,duration});
configureResources({getBook:getRecipeBook,ensureBook:ensureRecipeCatalog,refresh,persist,icon,duration,entityImage});
configureGuide({getBook:getRecipeBook,ensureBook:ensureRecipeCatalog,refresh,icon});
document.addEventListener('input',e=>{
 const field=e.target;
 if(!field.matches('[data-plan-progress]')||!inChecklist()||storageConflict||!field.validity.valid)return;
 const plan=selectedPlan();
 const key=field.dataset.planProgress;
 const checklist=plan&&checklistFor(plan).checklist;
 if(!checklist?.rowsByKey.has(key))return;
 const progress=plan.progress??={};
 const value=field.value===''?0:field.valueAsNumber;
 if(value===(Object.hasOwn(progress,key)?progress[key]:0))return;
 if(value>0)plan.progress={...progress,[key]:value};
 else delete progress[key];
 updatePlanChecklist(field.closest('.plan-checklist'),checklist,plan.progress,field);
 void persist();
});
let recipeSearchTimer, resourceSearchTimer, guideSearchTimer, dropSearchTimer;
function refreshDropResults(){
 const results=$('#drop-results');
 if(results)results.innerHTML=dropResults(state.dropBrowser,state.drop.catalogEntry?.id,icon);
 const reset=$('[data-action="drop-reset"]');
 if(reset)reset.hidden=!(state.dropBrowser.search||state.dropBrowser.itemTier||state.dropBrowser.sourceTier);
 return results;
}
document.addEventListener('input',e=>{
 if(e.target.id!=='drop-search'||storageConflict)return;
 state.dropBrowser.search=e.target.value.slice(0,DROP_SEARCH_LIMIT);
 state.dropBrowser.page=0;
 refreshDropResults();
 clearTimeout(dropSearchTimer);
 dropSearchTimer=setTimeout(persist,120);
});
document.addEventListener('input',e=>{if(e.target.id!=='recipe-search'||storageConflict)return;state.recipeBook.search=e.target.value;state.recipeBook.page=0;clearTimeout(recipeSearchTimer);recipeSearchTimer=setTimeout(()=>{const results=$('#recipe-results');if(results)results.innerHTML=recipeResults(state.recipeBook);persist();},120);});
document.addEventListener('input',e=>{if(e.target.id!=='resource-search'||storageConflict)return;state.resourceCatalog.search=e.target.value;state.resourceCatalog.page=0;clearTimeout(resourceSearchTimer);resourceSearchTimer=setTimeout(()=>{const results=$('#resource-results');if(results)results.innerHTML=resourceResults(state.resourceCatalog);persist();},120);});
document.addEventListener('input',e=>{
 if(e.target.id!=='guide-search'||storageConflict)return;
 state.guide.search=e.target.value;
 state.guide.page=0;
 clearTimeout(guideSearchTimer);
 guideSearchTimer=setTimeout(()=>{
  const results=$('#guide-results');
  if(results)results.innerHTML=guideResults(state.guide);
  persist();
 },120);
});
document.addEventListener('input',e=>{
 if(e.target.id!=='dungeon-search'||storageConflict)return;
 state.dungeons.search=e.target.value.slice(0,DUNGEON_SEARCH_LIMIT);
 $('#dungeon-results').innerHTML=dungeonResults(state.dungeons,icon);
 persist();
});
function refreshWorldResults(){
 const results=$('#world-results');
 if(results)results.innerHTML=worldResults(state.world,icon);
 return results;
}
document.addEventListener('input',e=>{
 if(e.target.id!=='world-search'||storageConflict)return;
 state.world.search=e.target.value.slice(0,WORLD_SEARCH_LIMIT);
 state.world.page=0;
 refreshWorldResults();
 persist();
});
setInterval(tick,500);
applyRoute(state,parseRoute(location.hash),history.state);
render();
if(!initialLanguageReady)toast(tr('Перевод BitCraft не загрузился.'));
initWebPlatform(platformChanged);
