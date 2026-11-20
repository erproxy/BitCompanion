import { GUIDE_MODES, guideDefaults } from './guide-domain.js';
import { RESOURCE_MODES, resourceModeForKey, setResourceMode } from './resource-domain.js';
import { setProductionTarget } from './recipe-domain.js';
import { normalizeDungeonState } from './dungeon-domain.js';
import { WORLD_DEFAULT_MODE, WORLD_MODES, worldDefaults } from './world-domain.js';

const tabs = Object.freeze({drops:'drops',rarity:'rarity',recipes:'recipeBook',resources:'resources',guide:'guide',world:'world',dungeons:'dungeons',time:'time',plans:'journal'});
const paths = Object.fromEntries(Object.entries(tabs).map(([path,tab])=>[tab,path]));
const entityKey = /^(?:(?:item|cargo|building|resource|enemy|chest):\d+|family:(?:item|cargo):\d+)$/;
const positiveNumber = token => /^[1-9]\d*$/.test(token) && Number.isSafeInteger(Number(token));

/** URLs contain only public navigation, never inventory or saved plans. */
export function parseRoute(hash) {
  try {
    const parts = hash.replace(/^#\/?/,'').split('/').map(decodeURIComponent);
    const tab = Object.hasOwn(tabs, parts[0]) ? tabs[parts[0]] : null;
    if (!tab) return null;
    if (tab === 'recipeBook') {
      if (parts.length > 2 || (parts[1] && !entityKey.test(parts[1]))) return null;
      return {tab,targetKey:parts[1]||''};
    }
    if (tab === 'resources') {
      let mode = parts[1] || 'game';
      const targetKey = parts[2] || '';
      if (!Object.hasOwn(RESOURCE_MODES, mode) || parts.length > 3) return null;
      if (targetKey && !entityKey.test(targetKey)) return null;
      if (targetKey && mode !== resourceModeForKey(targetKey)) {
        if (mode !== 'game' || !targetKey.startsWith('enemy:')) return null;
        mode = 'creatures';
      }
      return {tab,mode,targetKey};
    }
    if (tab === 'guide') {
      const mode = parts[1] || 'skills';
      if (!GUIDE_MODES.includes(mode) || parts.length > 4) return null;
      if (parts.length > 2 && !positiveNumber(parts[2])) return null;
      if (parts.length > 3 && (mode !== 'skills' || !positiveNumber(parts[3]) || Number(parts[3]) > 10000)) return null;
      return {tab,mode,id:Number(parts[2] || 0),level:Number(parts[3] || 0)};
    }
    if (tab === 'world') {
      const mode = parts[1] || WORLD_DEFAULT_MODE;
      if (!Object.hasOwn(WORLD_MODES, mode) || parts.length > 3) return null;
      if (parts.length === 3 && (!parts[1] || !positiveNumber(parts[2]))) return null;
      return {tab,mode,id:Number(parts[2] || 0)};
    }
    if (tab === 'dungeons') {
      if (parts.length > 2 || (parts.length === 2 && !positiveNumber(parts[1]))) return null;
      return {tab,id:Number(parts[1] || 0)};
    }
    if (tab === 'journal' && parts.length === 2 && parts[1] === 'checklist') return {tab,checklist:true};
    return parts.length === 1 ? {tab} : null;
  } catch { return null; }
}

export function routeForState(state) {
  let route = '#/' + (paths[state.tab] || 'drops');
  if (state.tab === 'recipeBook' && entityKey.test(state.recipeBook.targetKey)) route += '/' + encodeURIComponent(state.recipeBook.targetKey);
  if (state.tab === 'resources') {
    const mode = Object.hasOwn(RESOURCE_MODES, state.resourceCatalog.mode) ? state.resourceCatalog.mode : 'game';
    route += '/' + mode;
    const key = state.resourceCatalog.targetKey;
    if (entityKey.test(key) && mode === resourceModeForKey(key)) route += '/' + encodeURIComponent(key);
  }
  if (state.tab === 'guide') {
    const {mode,id,level} = state.guide;
    route += '/' + mode;
    if (id) route += '/' + id;
    if (id && mode === 'skills' && level) route += '/' + level;
  }
  if (state.tab === 'world') {
    const {mode,id} = state.world || worldDefaults();
    route += '/' + mode;
    if (positiveNumber(id)) route += '/' + id;
  }
  if (state.tab === 'dungeons' && positiveNumber(state.dungeons?.id)) route += '/' + state.dungeons.id;
  if (state.tab === 'journal' && state.journal?.view === 'checklist') route += '/checklist';
  return route;
}

export function applyRoute(state, route, historyState) {
  if (!route) return;
  state.tab = route.tab;
  if (route.tab === 'recipeBook') setProductionTarget(state.recipeBook,route.targetKey);
  if (route.tab === 'resources') {
    setResourceMode(state.resourceCatalog, route.mode);
    setProductionTarget(state.resourceCatalog,route.targetKey);
    state.resourceCatalog.stationPage = 0;
  }
  if (route.tab === 'guide') {
    const previous = state.guide?.mode === route.mode ? state.guide : guideDefaults();
    state.guide = {...previous,mode:route.mode,id:route.id,level:route.level,page:previous.id===route.id?previous.page:-1};
  }
  if (route.tab === 'world') {
    const previous = state.world?.mode === route.mode ? state.world : worldDefaults(route.mode);
    state.world = {...previous,id:route.id,page:previous.id===route.id?previous.page:-1};
  }
  if (route.tab === 'dungeons') state.dungeons = normalizeDungeonState({...state.dungeons,id:route.id});
  if (route.tab === 'journal') {
    state.journal ??= { id: '' };
    state.journal.view = route.checklist ? 'checklist' : 'list';
    if (route.checklist && typeof historyState?.journalPlanId === 'string') state.journal.id = historyState.journalPlanId;
  }
}
