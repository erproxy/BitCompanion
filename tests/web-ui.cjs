const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {launchBrowser,baseURL,appURL,isAppURL,catalogName}=require('./browser-runtime.cjs');
const STORE='bitcraft-companion-v1';

async function assertCatalogIcon(page,area,icon){
 const selector=area+' .entity-image-fallback use[href$="#'+icon+'"]';
 await page.waitForFunction(selector=>{
  const shape=document.querySelector(selector);
  return shape?.getBBox().width>0 && getComputedStyle(shape.closest('svg')).display!=='none';
 },selector);
}

async function settleOffline(page){
 await page.waitForFunction(async()=>{
  const script=document.querySelector('script[type="module"]').src;
  return (await import(new URL('web-platform.js',script).href)).getWebPlatformState().ready;
 },null,{timeout:60000});
}

(async()=>{
 await fs.mkdir('output',{recursive:true});
 const browser=await launchBrowser();
 try{
  const context=await browser.newContext({ locale: 'ru-RU', viewport:{width:1420,height:1050},acceptDownloads:true});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('request',request=>requests.push(request.url()));
  await page.goto(baseURL);
  await page.waitForSelector('body[data-tab="drops"]');
  await settleOffline(page);
  const {publicData,imageOrigin}=await (await page.request.get(appURL('release.json'))).json();
  const builtInIcons=publicData&&!imageOrigin;
  if(builtInIcons)await assertCatalogIcon(page,'.hero-info','antler');
  assert.equal(await page.locator('[data-web-update]').isVisible(),false,'No update action before a newer release');
  assert.ok(requests.filter(url=>/\.webp(?:\?|$)/.test(url)).length<30,'First launch never downloads the full image package');
  assert.ok(requests.every(url=>!/^https?:/.test(url)||isAppURL(url)||new URL(url).origin===imageOrigin),'Runtime assets use the app mount or the configured image origin');

  await page.locator('[data-action="tab"][data-tab="rarity"]').click();
  assert.equal(new URL(page.url()).hash,'#/rarity');
  await page.goBack();await page.waitForSelector('body[data-tab="drops"]');
  await page.goForward();await page.waitForSelector('body[data-tab="rarity"]');

  // An exact item URL keeps the card and stats even when quantity planning uses the verified family.
  await page.goto(appURL('#/recipes/item%3A1486054968'));
  const rarity=page.getByLabel('Редкость в плане');
  const root=page.locator('.recipe-tree-node').first();
  await rarity.waitFor();
  if(builtInIcons)await assertCatalogIcon(page,'.recipe-target-heading','axe');
  assert.equal(await rarity.inputValue(),'any');
  assert.match(await page.locator('.recipe-target-heading').innerText(),/Emarium Axe[\s\S]*Обычная/);
  assert.match(await root.locator('summary').first().innerText(),/Любая редкость/);
  const quantity=page.locator('[data-key="recipeBook.quantity"]');
  await quantity.fill('110');await quantity.press('Tab');
  for(const [name,tier] of [['Emarium',3],['Pyrelite',2],['Ferralith',1]]){
   const needed=page.locator('.recipe-tree-node > summary').filter({hasText:`${name} Axe`});
   assert.match(await needed.first().textContent(),new RegExp(`T${tier}.*× 110`));
  }
  await rarity.selectOption('exact');
  assert.equal(await page.locator('.recipe-steps > li').count(),0);
  assert.match(await page.locator('.recipe-issues').innerText(),/Emarium Axe.*гарантированный расчёт/);
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.recipeBook.rarityPreference?.scope==='exact',STORE);
  await page.reload();await rarity.waitFor();
  assert.equal(await rarity.inputValue(),'exact','An explicit rarity requirement survives a reload');
  assert.equal(await quantity.inputValue(),'1','The draft quantity resets independently of saved preferences');
  await rarity.selectOption('any');
  const method=page.locator('select[data-recipe-method="family:item:1486054968"]').first();
  await method.selectOption('external');
  assert.equal(await page.locator('.recipe-steps > li').count(),0);
  await method.selectOption('');
  assert.ok(await page.locator('.recipe-steps > li').count()>3);
  assert.equal(new URL(page.url()).hash,'#/recipes/item%3A1486054968');
  await page.screenshot({path:'output/recipes-exact-axe-web.png'});

  await page.goto(appURL('#/recipes/item%3A518219336'));
  await page.getByLabel('Редкость в плане').waitFor();
  if(builtInIcons)await assertCatalogIcon(page,'.recipe-target-heading','pickaxe');
  assert.match(await page.locator('.recipe-tree-node > summary').first().textContent(),/Rathium Pickaxe.*Любая редкость/);
  assert.ok(await page.locator('.recipe-steps > li').count()>6);

  const imported={version:1,tab:'time',drop:{preset:'hexite-chitin',quantity:3,attempts:251},
   recipeBook:{targetKey:'family:item:1606324183',quantity:10,inventory:{'item:1':13},snapshot:'legacy-snapshot'},
   resourceCatalog:{mode:'custom'},resources:{targetId:'old',quantity:2,inventory:{ore:4},recipes:[{id:'old',name:'Прежний рецепт',output:2,seconds:8,ingredients:[{id:'ore',name:'Ore',amount:3}]}]},
   time:{label:'Прежний таймер',startedAt:Date.now()-30000,elapsed:2000,sessions:[]},
   saved:[{id:'old-plan',title:'Прежний план',type:'drops',date:Date.now(),data:{preset:'hexite-chitin',quantity:3,attempts:251}}]};
  await page.locator('#import-file').setInputFiles({name:'legacy-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await page.waitForSelector('body[data-tab="time"]');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORE);
  assert.equal(saved.version,1);assert.equal(saved.saved[0].id,'old-plan');
  assert.equal(saved.world.mode,'achievements');assert.equal(saved.world.id,0);
  assert.equal(saved.recipeBook.inventory['item:1'],13);assert.equal(saved.resources.recipes[0].name,'Прежний рецепт');
  assert.equal(saved.recipeBook.quantity,undefined);assert.equal(saved.resources.quantity,undefined);
  assert.equal(saved.time.startedAt,imported.time.startedAt);
  assert.ok(await page.evaluate(key=>!!localStorage.getItem(key+'-before-import'),STORE));
  await page.reload();await page.waitForSelector('body[data-tab="time"]');
  assert.match(await page.locator('#timer-display').textContent(),/\d/);

  const download=page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const exported=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));
  assert.equal(exported.version,1);assert.equal(exported.saved[0].id,'old-plan');
  assert.equal(exported.recipeBook.inventory['item:1'],13);

  // Real catalogue, not a fixture: reopen buildings from a deep link offline.
  const building=await page.evaluate(async()=>{
   const module=document.querySelector('script[type="module"]').src;
   const response=await fetch(new URL('data/recipe-catalog.json',module));
   const {entities}=await response.json();
   return entities.find(entity=>entity.key.startsWith('building:')&&entity.visible!==false);
  });
  assert.ok(building);
  await context.setOffline(true);
  await page.goto(appURL('#/resources/buildings/'+encodeURIComponent(building.key)));
  await page.waitForSelector('.resource-book');
  assert.equal(await page.evaluate(()=>document.body.dataset.tab),'resources');
  assert.equal(new URL(page.url()).hash,'#/resources/buildings/'+encodeURIComponent(building.key));
  assert.equal(await page.locator('.error').count(),0);
  await page.goto(appURL('#/resources/game/enemy%3A9'));
  await page.locator('.resource-target-heading h2').filter({hasText:'Rangifer'}).waitFor();
  assert.equal(new URL(page.url()).hash,'#/resources/creatures/enemy%3A9');
  await page.reload();
  await page.locator('.resource-sources [data-id="item:400827528"]').waitFor();
  await page.goto(appURL('#/dungeons/1084069097'));
  await page.reload();
  await page.locator('#dungeon-heading').filter({hasText:'Логово аракниров'}).waitFor();
  await page.getByRole('button',{ name: catalogName("Araknir Scroll") }).waitFor();
  if(builtInIcons)await assertCatalogIcon(page,'.recipe-target-heading','spider');
  await page.goto(appURL('#/world/achievements/106'));
  await page.reload();
  await page.locator('#world-detail').getByRole('heading',{ name: catalogName("Apprentice Miner") }).waitFor();
  await page.locator('#world-detail').getByRole('button',{ name: catalogName("Novice Miner") }).click();
  await page.locator('#world-detail').getByRole('heading',{ name: catalogName("Novice Miner") }).waitFor();
  if(builtInIcons)await assertCatalogIcon(page,'.world-card-top','medal');
  await context.setOffline(false);
  await page.goto(appURL('#/recipes/item%3A400827528'));
  const enemyMethod=page.locator('#recipe-acquisition [data-recipe-details="enemy:9"]');
  await enemyMethod.locator('summary').first().click();
  await enemyMethod.locator('[data-action="resource-target"][data-id="enemy:9"]').click();
  await page.locator('.resource-target-heading h2').filter({hasText:'Rangifer'}).waitFor();
  assert.equal(new URL(page.url()).hash,'#/resources/creatures/enemy%3A9');
  await page.locator('[data-action="sources"]').first().click();
  assert.match(await page.locator('#web-offline-settings').textContent(),/сохранены для работы без сети/);
  await page.locator('[data-action="close-modal"]').click();

  // Two tabs share the same store. A stale tab must never overwrite newer data.
  const other=await context.newPage();await other.goto(baseURL);
  await other.waitForSelector('.nav-item');
  await page.locator('[data-action="tab"][data-tab="drops"]').click();
  await other.waitForSelector('[data-action="storage-reload"]');
  const newest=await page.evaluate(key=>localStorage.getItem(key),STORE);
  await other.locator('[data-action="tab"][data-tab="time"]').click();
  assert.equal(await other.evaluate(key=>localStorage.getItem(key),STORE),newest,'Stale edits do not replace newer state');
  await other.locator('[data-web-update]').evaluate(button=>button.click());
  assert.match(await other.locator('#toast').textContent(),/экспортируй текущую копию/,'An update cannot discard the conflicted copy');
  await other.locator('[data-action="storage-reload"]').click();
  await other.waitForSelector('body[data-tab="drops"]');

  await Promise.all([page,other].map(tab=>tab.evaluate(async()=>{
   const script=document.querySelector('script[type="module"]').src;
   const {createStateStore}=await import(new URL('state-storage.js',script).href);
   window.raceStore=createStateStore(()=>localStorage,'bitcraft-test-race',()=>navigator.locks);
   window.raceStore.read();
  })));
  const racing=await Promise.all([page,other].map((tab,index)=>tab.evaluate(async value=>{
   try{await window.raceStore.writeLocked(value);return 'written';}catch(error){return error.code;}
  },'tab-'+index)));
  assert.deepEqual(racing.sort(),['STATE_CHANGED','written'],'Actual cross-tab Web Lock preserves the winning write');
  await page.evaluate(()=>localStorage.removeItem('bitcraft-test-race'));
  await other.close();
  assert.deepEqual(errors,[]);
  await context.close();

  const denied=await browser.newContext({ locale: 'ru-RU' });
  await denied.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage disabled','QuotaExceededError');};});
  const deniedPage=await denied.newPage();await deniedPage.goto(baseURL);
  await deniedPage.locator('[data-action="tab"][data-tab="time"]').click();
  assert.match(await deniedPage.locator('.saved-status').textContent(),/Нужен экспорт/);
  await denied.close();
  console.log('PASS: web routes/history, exact item cards and quantity plans, legacy v1 import/export and timer, actual catalogue offline, lazy icons, stale tabs, denied storage.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
