const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {launchBrowser,baseURL,assetURL,isAppURL,catalogName}=require('./browser-runtime.cjs');

async function assertBuildingContrast(page){
 const result=await page.evaluate(()=>{
  const rgba=value=>{const m=value.match(/rgba?\(([^)]+)\)/);return m?m[1].split(/[ ,/]+/).filter(Boolean).map(Number):[0,0,0,0];};
  const over=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
  const lum=rgb=>{const a=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*a[0]+.7152*a[1]+.0722*a[2];};
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const selectors='.field>span,.field input,.field select,.primary,.secondary,.subtitle,.recipe-explanation,.recipe-link,.recipe-facts dt,.recipe-facts dd,.resource-search-item b,.resource-search-item small,.recipe-result-count,.resource-modes button,summary';
  const failures=[];let checked=0;
  for(const el of document.querySelector('#view').querySelectorAll(selectors)){
   const style=getComputedStyle(el),box=el.getBoundingClientRect(),text=(el.value||el.textContent||'').trim();
   if(!box.width||!box.height||style.visibility!=='visible'||el.disabled||!text)continue;
   const parents=[];for(let node=el;node;node=node.parentElement)parents.push(node);
   let backgrounds=[[255,255,255]];
   for(const node of parents.reverse()){
    const s=getComputedStyle(node);backgrounds=backgrounds.map(bg=>over(rgba(s.backgroundColor),bg));
    const stops=[...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m=>rgba(m[0]));
    if(stops.length)backgrounds=backgrounds.flatMap(bg=>stops.map(stop=>over(stop,bg)));
   }
   const color=rgba(style.color),contrast=Math.min(...backgrounds.map(bg=>ratio(over(color,bg),bg)));
   const large=parseFloat(style.fontSize)>=24||(Number(style.fontWeight)>=700&&parseFloat(style.fontSize)>=18.66),minimum=large?3:4.5;checked++;
   if(contrast+.02<minimum)failures.push({element:el.tagName+'.'+String(el.className),text:text.slice(0,70),contrast:Number(contrast.toFixed(2)),minimum});
  }
  return {checked,failures};
 });
 assert.ok(result.checked>20,'Building names, fields, functions and construction requirements have checked contrast');
 assert.deepEqual(result.failures,[],`Building contrast failures: ${JSON.stringify(result.failures)}`);
}

// All imports, exports and reloads use an isolated browser profile.
(async()=>{
 const catalog=JSON.parse(await fs.readFile(path.join(__dirname,'../web/data/recipe-catalog.json'),'utf8'));
 const entities=new Map(catalog.entities.map(entity=>[entity.key,entity]));
 const visibleBuildings=catalog.entities.filter(entity=>entity.type==='building'&&entity.visible!==false);
 assert.equal(visibleBuildings.length,807,'The dated snapshot has 807 visible buildings');
 const browser=await launchBrowser();
 try{
  const context=await browser.newContext({ locale: 'ru-RU', viewport:{width:1420,height:1050},deviceScaleFactor:1,acceptDownloads:true});
  const page=await context.newPage(),errors=[],failedRequests=[],externalRequests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{if(response.status()>=400)failedRequests.push(`${response.status()} ${response.url()}`);});
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!isAppURL(request.url()))externalRequests.push(request.url());});
  await fs.mkdir('output',{recursive:true});
  await page.goto(baseURL);
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bitcraft-companion-v1')));
  const heading=()=>page.locator('.resource-target-heading h2').innerText();
  const results=()=>page.locator('.resource-catalog-results [data-action="resource-target"]');
  const reset=()=>page.locator('[data-action="resource-reset"]').first().click();
  const modeButton=mode=>page.locator(`[data-action="resource-mode"][data-mode="${mode}"]`);
  const waitForResourceSelection=(mode,key=null)=>page.waitForFunction(({mode,key})=>{
   const selection=JSON.parse(localStorage.getItem('bitcraft-companion-v1'))?.resourceCatalog;
   return selection?.mode===mode&&(key===null||selection.targetKey===key);
  },{mode,key});
  const search=async value=>{
   await page.locator('#resource-search').fill(value);
   await page.waitForFunction(value=>JSON.parse(localStorage.getItem('bitcraft-companion-v1'))?.resourceCatalog?.search===value,value);
  };
  const hideToast=async()=>page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#toast')).opacity)<.01);
  const waitForImages=async()=>{
   const picture=page.locator('.resource-target-heading .entity-image img');
   assert.equal(await picture.count(),1,'The known building has a real bundled game image');
   await picture.scrollIntoViewIfNeeded();
   await picture.evaluate(img=>img.decode());
   const source=new URL(await picture.evaluate(img=>img.src)),assetRoot=new URL(await assetURL(page,'assets/bitcraft/'));
   assert.ok(source.origin===assetRoot.origin&&source.pathname.startsWith(assetRoot.pathname),'Building artwork uses the application origin and asset directory');
   const frame=await picture.locator('..').boundingBox(),image=await picture.boundingBox();
   assert.ok(image.x>=frame.x-1&&image.y>=frame.y-1&&image.x+image.width<=frame.x+frame.width+1&&image.y+image.height<=frame.y+frame.height+1,'Building artwork stays within its fixed emblem');
   await page.evaluate(()=>scrollTo(0,0));
   await page.waitForFunction(()=>[...document.querySelectorAll('#view img')].filter(img=>{const box=img.getBoundingClientRect();return box.width&&box.height&&box.top<innerHeight&&box.bottom>0;}).every(img=>img.complete&&img.naturalWidth>0));
  };
  const exportBackup=async file=>{
   const download=page.waitForEvent('download');await page.locator('.top-actions [data-action="export"]').click();
   await(await download).saveAs(file);return JSON.parse(await fs.readFile(file,'utf8'));
  };
  const importBackup=async data=>{
   await page.evaluate(()=>document.querySelector('#toast').textContent='');
   await page.locator('#import-file').setInputFiles({name:'buildings-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
   await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Данные импортированы'));
   await page.locator('#resource-search').waitFor();
  };
  const expectBuilding=async key=>{
   assert.match(await heading(),catalogName(entities.get(key).name));
   await waitForResourceSelection('buildings',key);
   assert.equal(await page.locator('[data-action="resource-plan"]').count(),0,'Buildings do not offer an unsupported automatic plan');
   assert.equal(await page.locator('[data-key="resourceCatalog.quantity"]').count(),0,'Building reference records do not show craftable material quantities');
  };

  await page.locator('.nav-item[data-tab="resources"]').click();await page.locator('#resource-search').waitFor();
  await page.locator('[data-key="resourceCatalog.quantity"]').fill('7');
  await page.locator('[data-key="resourceCatalog.quantity"]').press('Tab');
  await page.locator('[data-recipe-stock="item:6050001"]').first().fill('3');
  await page.locator('[data-recipe-stock="item:6050001"]').first().press('Tab');
  await modeButton('buildings').click();
  assert.equal(await modeButton('buildings').getAttribute('aria-selected'),'true');
  await expectBuilding('building:1014');
  assert.match(await page.locator('.recipe-source-note').innerText(),/807 построек/);
  assert.match(await page.locator('#resource-results .recipe-result-count').innerText(),/Найдено: 807/);
  assert.match(await page.locator('.building-functions').innerText(),/\(Loom\)\s+Уровень 1/);
  assert.equal(await page.locator('[data-resource-filter="showNodes"]').count(),0);
  assert.match(await page.locator('.resource-sources').innerText(),/Как построить/);
  assert.match(await page.locator('.resource-station-uses').innerText(),/Рецепты на этой постройке/);
  assert.match(await page.locator('.resource-uses').innerText(),/Разборка и использование/);
  const loomConstruction=catalog.recipes.find(recipe=>recipe.kind==='construction'&&recipe.outputs.some(output=>output.key==='building:1014'));
  assert.ok(loomConstruction);
  const method=page.locator('.resource-sources .resource-method[open]').first();
  for(const ingredient of loomConstruction.ingredients){
   const row=method.locator('.resource-stack').filter({has:page.locator(`[data-action="resource-target"][data-id="${ingredient.key}"]`)});
   assert.ok(await row.count()>0,'Construction materials preserve typed source keys');
   assert.match(await row.first().innerText(),new RegExp(`× ${ingredient.quantity}(?:\\s|$)`));
  }
  assert.match(await method.innerText(),/Нужно на постройку/);
  assert.match(await method.innerText(),/Не определено/,'Unknown building time is not presented as zero');
  const stationRecipe=catalog.recipes.find(recipe=>!recipe.internalResolver&&recipe.requirements?.station?.buildings?.some(building=>building.key==='building:1014'));
  assert.ok((await page.locator('.resource-station-uses').innerText()).includes(stationRecipe.name));
  await waitForImages();await assertBuildingContrast(page);

  // Ingredients open the material catalogue; its station requirements lead back to buildings.
  await method.locator('[data-action="resource-target"][data-id="item:1090008"]').click();
  await waitForResourceSelection('game','item:1090008');
  assert.match(await heading(),catalogName('Rough Spool Of Thread'));
  assert.equal(await page.locator('[data-key="resourceCatalog.quantity"]').inputValue(),'1');
  const stationLink=page.locator('.resource-requirements [data-action="resource-target"][data-id="building:1028"]').first();
  assert.ok(await stationLink.count()>0,'Material requirements offer the actual compatible buildings');
  await stationLink.click();await expectBuilding('building:1028');
  assert.match(await page.locator('.building-functions').innerText(),/Tailoring Station/);
  await modeButton('game').click();
  assert.equal(await page.locator('[data-key="resourceCatalog.quantity"]').inputValue(),'1');
  assert.equal((await state()).recipeBook.inventory['item:6050001'],3,'Building navigation preserves common material stocks');
  await modeButton('buildings').click();

  // The function and level filters select Simple Loom without using an invented building tier.
  await page.locator('[data-resource-filter="buildingCategory"]').selectOption('14');
  await page.locator('[data-resource-filter="tier"]').selectOption('2');
  assert.equal(await results().count(),1);
  assert.equal(await results().first().getAttribute('data-id'),'building:2014');
  assert.match(await results().first().innerText(),/\(Loom\) · уровень 2/);
  await results().first().click();await expectBuilding('building:2014');
  assert.match(await page.locator('.resource-requirements').first().innerText(),/Технологии поселения/);
  await search('Loom');
  const backup=await exportBackup('output/buildings-qa-backup.json');
  assert.equal(backup.version,1);
  assert.equal(backup.resourceCatalog.mode,'buildings');assert.equal(backup.resourceCatalog.targetKey,'building:2014');
  assert.equal(backup.resourceCatalog.buildingCategory,'14');assert.equal(backup.resourceCatalog.tier,'2');
  assert.equal(backup.resourceCatalog.quantity,undefined);assert.equal(backup.recipeBook.inventory['item:6050001'],3);
  assert.ok(backup.resources.recipes.some(recipe=>recipe.id==='expedition'),'Existing personal recipes remain in the v1 export');
  await modeButton('custom').click();await waitForResourceSelection('custom');
  await importBackup(backup);await expectBuilding('building:2014');
  assert.equal(await page.locator('[data-resource-filter="buildingCategory"]').inputValue(),'14');
  assert.equal(await page.locator('[data-resource-filter="tier"]').inputValue(),'2');
  await page.reload();await page.locator('#resource-search').waitFor();await expectBuilding('building:2014');
  assert.equal(await page.locator('#resource-search').inputValue(),'Loom');
  assert.equal(await page.locator('[data-resource-filter="buildingCategory"]').inputValue(),'14');
  assert.equal(await page.locator('[data-resource-filter="tier"]').inputValue(),'2');
  assert.equal((await state()).resourceCatalog.quantity,undefined);
  const legacyBuilding=structuredClone(backup);legacyBuilding.resourceCatalog.mode='game';
  await importBackup(legacyBuilding);await expectBuilding('building:2014');

  // Even the busiest station mounts just one page of compatible production recipes.
  const stationRecipes=new Map();
  for(const recipe of catalog.recipes){
   if(recipe.internalResolver)continue;
   for(const building of recipe.requirements?.station?.buildings||[]){
    if(entities.get(building.key)?.visible===false)continue;
    if(!stationRecipes.has(building.key))stationRecipes.set(building.key,[]);
    stationRecipes.get(building.key).push(recipe);
   }
  }
  const [busyKey,busyRecipes]=[...stationRecipes].sort((a,b)=>b[1].length-a[1].length)[0];
  assert.ok(busyRecipes.length>100,'A real high-volume station exercises bounded recipe pagination');
  const busyBackup=structuredClone(backup);Object.assign(busyBackup.resourceCatalog,{targetKey:busyKey,buildingCategory:'',tier:'',search:'',stationPage:0});
  await importBackup(busyBackup);await expectBuilding(busyKey);
  const stationRows=()=>page.locator('.resource-station-uses .resource-use-list > .resource-use');
  async function expectStationPage(start){
   const names=await stationRows().locator(':scope > b').allTextContents();
   assert.equal(names.length,10,'A station mounts only ten production rows at a time');
   busyRecipes.slice(start,start+10).forEach((recipe,index)=>assert.match(names[index],catalogName(recipe.name)));
  }
  await expectStationPage(0);
  await page.locator('[data-action="resource-station-page"][data-delta="1"]').click();
  await expectStationPage(10);
  assert.match(await page.locator('.resource-station-uses .recipe-result-count').innerText(),/Страница 2 из/);
  await page.locator('[data-action="resource-station-page"][data-delta="-1"]').click();
  await expectStationPage(0);
  await importBackup(backup);await expectBuilding('building:2014');

  await search('building-not-present-987654321');
  assert.equal(await results().count(),0);assert.match(await page.locator('.resource-catalog-results').innerText(),/Постройки не найдены/);
  await hideToast();await page.screenshot({path:'output/buildings-empty-1420.png',fullPage:true});
  await reset();assert.equal(await page.locator('#resource-search').inputValue(),'');
  assert.equal(await page.locator('[data-resource-filter="tier"]').inputValue(),'');
  assert.equal(await page.locator('[data-resource-filter="buildingCategory"]').inputValue(),'');
  assert.equal(await results().count(),10);
  const firstPageKeys=await results().evaluateAll(items=>items.map(item=>item.dataset.id));
  await page.locator('[data-action="resource-page"][data-delta="1"]').click();
  assert.match(await page.locator('#resource-results .recipe-result-count').innerText(),/страница 2 из 81/);
  const secondPageKeys=await results().evaluateAll(items=>items.map(item=>item.dataset.id));
  assert.ok(secondPageKeys.every(key=>!firstPageKeys.includes(key)),'Pagination advances through distinct real building records');
  await page.locator('[data-action="resource-page"][data-delta="-1"]').click();
  assert.deepEqual(await results().evaluateAll(items=>items.map(item=>item.dataset.id)),firstPageKeys);
  await page.locator('[data-resource-filter="buildingCategory"]').selectOption('none');
  const noFunctions=visibleBuildings.filter(entity=>!entity.functions?.length);
  assert.ok(noFunctions.length>0);
  assert.match(await page.locator('#resource-results .recipe-result-count').innerText(),new RegExp(`Найдено: ${noFunctions.length}`));
  const functionlessKey=await results().first().getAttribute('data-id');
  assert.ok(noFunctions.some(entity=>entity.key===functionlessKey));
  await results().first().click();await expectBuilding(functionlessKey);
  assert.match(await page.locator('.resource-detail').innerText(),/Функции в этом снимке не указаны/);

  // Additional source restrictions are visible on real records, including zero interior level.
  for(const [field,label,predicate]of [
   ['consumedShards','Расход шардов (Shards)',value=>value>0],
   ['claimTechIds','Технологии поселения',value=>Array.isArray(value)&&value.length>0],
   ['interiorTier','Уровень интерьера',value=>value===0],
   ['pavingTier','Уровень покрытия',value=>value>0]
  ]){
   const recipe=catalog.recipes.find(recipe=>recipe.kind==='construction'&&predicate(recipe.requirements?.[field])&&recipe.outputs.some(output=>entities.get(output.key)?.type==='building'&&entities.get(output.key)?.visible!==false));
   assert.ok(recipe,`A visible construction record supplies ${field}`);
   const buildingKey=recipe.outputs.find(output=>entities.get(output.key)?.type==='building'&&entities.get(output.key)?.visible!==false).key;
   const data=structuredClone(backup);Object.assign(data.resourceCatalog,{mode:'buildings',targetKey:buildingKey,search:'',tier:'',buildingCategory:''});
   await importBackup(data);await expectBuilding(buildingKey);
   const sourceMethod=page.locator('.resource-sources .resource-method').filter({has:page.locator('.recipe-record',{hasText:new RegExp(`запись № ${recipe.source.id}$`)})});
   assert.equal(await sourceMethod.count(),1,`The displayed source record matches ${recipe.key}`);
   if(await sourceMethod.getAttribute('open')===null)await sourceMethod.locator('summary').first().click();
   const requirements=sourceMethod.locator('.resource-requirements');
   assert.ok(await requirements.count()>0,`Construction ${recipe.key} has visible source requirements`);
   const term=requirements.locator('dt').filter({hasText:label}).first();
   assert.equal(await term.innerText(),label);
   const value=await term.evaluate(el=>el.nextElementSibling.textContent);
   if(field==='claimTechIds')for(const id of recipe.requirements[field])assert.ok(value.includes(String(id)));
   else assert.equal(value,new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(recipe.requirements[field]));
  }

  await importBackup(backup);await reset();await expectBuilding('building:2014');
  for(const [width,height]of [[1420,1050],[1280,900],[760,1100],[530,1100],[390,844],[360,800]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await hideToast();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No building page overflow at ${width}px`);
   await waitForImages();await assertBuildingContrast(page);
   await page.screenshot({path:`output/buildings-top-${width}.png`});
   await page.screenshot({path:`output/buildings-${width}.png`,fullPage:true});
  }
  await page.locator('#resource-search').focus();assert.ok(await page.locator('#resource-search').evaluate(el=>el===document.activeElement));
  await page.locator('#resource-search').press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  await page.locator('[data-resource-filter="buildingCategory"]').focus();
  assert.ok(await page.locator('[data-resource-filter="buildingCategory"]').evaluate(el=>el===document.activeElement));
  const disclosure=page.locator('.resource-sources .resource-method > summary').first();
  await disclosure.focus();await disclosure.press('Enter');
  assert.equal(await disclosure.locator('..').getAttribute('open'),null,'Construction details respond to keyboard disclosure');
  await disclosure.press('Enter');assert.notEqual(await disclosure.locator('..').getAttribute('open'),null);

  assert.deepEqual(externalRequests,[],'Building browsing never contacts a remote service or CDN');
  assert.deepEqual(failedRequests,[],'All bundled building images and catalogue requests load');
  assert.deepEqual(errors,[],'Building workflows produce no uncaught JavaScript errors');
  console.log('PASS: 807 local buildings, functions, construction materials/requirements, stations, ingredient navigation, filters/reset/pagination, v1 persistence, keyboard, contrast and 1420/1280/760/530/390/360px layouts; no JS or HTTP errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
