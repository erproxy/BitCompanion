const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {launchBrowser,baseURL,assetURL,isAppURL,catalogName}=require('./browser-runtime.cjs');

async function assertResourceContrast(page){
 const result=await page.evaluate(()=>{
  const rgba=value=>{const m=value.match(/rgba?\(([^)]+)\)/);return m?m[1].split(/[ ,/]+/).filter(Boolean).map(Number):[0,0,0,0];};
  const over=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
  const lum=rgb=>{const a=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*a[0]+.7152*a[1]+.0722*a[2];};
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const selectors='.field>span,.field input,.field select,.primary,.secondary,.data-table th,.data-table td,.subtitle,.recipe-explanation,.recipe-link,.recipe-facts dt,.recipe-facts dd,.resource-search-item b,.resource-search-item small,.resource-result-count,summary';
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
 assert.ok(result.checked>20,'Resource fields, sources, methods and names have checked contrast');
 assert.deepEqual(result.failures,[],`Resource contrast failures: ${JSON.stringify(result.failures)}`);
}

// An isolated browser context keeps the installed application's profile intact.
(async()=>{
 const browser=await launchBrowser();
 try{
  const context=await browser.newContext({ locale: 'ru-RU', viewport:{width:1420,height:1050},deviceScaleFactor:1,acceptDownloads:true});
  const page=await context.newPage(),errors=[],failedRequests=[],externalRequests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400)failedRequests.push(`${r.status()} ${r.url()}`);});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!isAppURL(r.url()))externalRequests.push(r.url());});
  await fs.mkdir('output',{recursive:true});
  await page.goto(baseURL);
  const tab=async name=>page.locator(`.nav-item[data-tab="${name}"]`).click();
  const openResources=async()=>{await tab('resources');await page.locator('#resource-search').waitFor();};
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bitcraft-companion-v1')));
  const heading=()=>page.locator('.resource-target-heading h2').innerText();
  const quantity=()=>page.locator('[data-key="resourceCatalog.quantity"]');
  const search=async value=>{
   await page.locator('#resource-search').fill(value);
   await page.waitForFunction(value=>JSON.parse(localStorage.getItem('bitcraft-companion-v1'))?.resourceCatalog?.search===value,value);
  };
  const waitForImages=async()=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('#view img')].filter(img=>{const b=img.getBoundingClientRect();return b.width&&b.height&&b.top<innerHeight&&b.bottom>0;}).every(img=>img.complete&&img.naturalWidth>0));
   const images=await page.locator('#view img').evaluateAll(images=>images.filter(img=>img.complete&&img.naturalWidth>0).map(img=>({src:img.src,width:img.naturalWidth,height:img.naturalHeight})));
   assert.ok(images.length>0,'The view displays actual local game images');
   const root=new URL(await assetURL(page,'assets/bitcraft/'));
   for(const image of images){
    const source=new URL(image.src);
    assert.ok(source.origin===root.origin&&source.pathname.startsWith(root.pathname),'Game images use the application origin and asset directory');
   }
  };
  const assertEmblemContainsImage=async scope=>{
   const emblems=page.locator(`${scope} .item-emblem:has(img)`);
   assert.ok(await emblems.count()>0,`A game image is present inside ${scope}`);
   for(const emblem of await emblems.all()){
    await emblem.scrollIntoViewIfNeeded();
    await emblem.locator('img').evaluate(img=>img.decode());
    const box=await emblem.boundingBox(),image=await emblem.locator('img').boundingBox();
    assert.ok(image.x>=box.x-1&&image.y>=box.y-1&&image.x+image.width<=box.x+box.width+1&&image.y+image.height<=box.y+box.height+1,`The image stays inside its ${box.width} × ${box.height} emblem in ${scope}`);
   }
  };
  const hideToast=async()=>{await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#toast')).opacity)<.01);};
  const exportBackup=async file=>{
   const download=page.waitForEvent('download');await page.locator('.top-actions [data-action="export"]').click();
   await(await download).saveAs(file);return JSON.parse(await fs.readFile(file,'utf8'));
  };
  const importBackup=async data=>{
   await page.evaluate(()=>document.querySelector('#toast').textContent='');
   await page.locator('#import-file').setInputFiles({name:'resource-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
   await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Данные импортированы'));
  };

  await waitForImages();await assertEmblemContainsImage('.drop-settings');
  await openResources();
  assert.match(await heading(),/Rathium/i,'The empty profile opens a real T6 resource');
  assert.equal(await quantity().inputValue(),'1');
  assert.ok(await page.locator('.resource-sources').count()>0,'Real sources and processing methods are shown');
  assert.ok(await page.locator('.resource-uses').count()>0,'Usage links connect resources to production');
  assert.ok(await page.locator('.resource-catalog-results [data-action="resource-target"]').count()<=10,'The resource catalogue mounts one bounded page');
  await waitForImages();await assertResourceContrast(page);

  await quantity().fill('7');await quantity().press('Tab');
  const initialKey=(await state()).resourceCatalog.targetKey,initialName=await heading();
  const stock=()=>page.locator(`[data-recipe-stock="${initialKey}"]`).first();
  await stock().fill('3');await stock().press('Tab');
  await page.locator('[data-action="resource-plan"]').click();
  await page.locator('#recipe-search').waitFor();
  assert.equal(await page.locator('[data-key="recipeBook.quantity"]').inputValue(),'7');
  assert.equal(await page.locator('.recipe-target-heading h2').innerText(),initialName,'Resource planning opens the same typed entity');
  assert.equal((await state()).recipeBook.targetKey,initialKey);
  assert.equal((await state()).recipeBook.inventory[initialKey],3,'The production plan shares the resource inventory');
  await waitForImages();
  await assertEmblemContainsImage('.recipe-target-heading');
  await openResources();
  assert.equal(await quantity().inputValue(),'7');
  assert.equal(await stock().inputValue(),'3');

  await search('Rathium');
  assert.ok(await page.locator('.resource-catalog-results [data-action="resource-target"]').count()>0);
  await page.locator('[data-resource-filter="tier"]').selectOption('6');
  for(const text of await page.locator('.resource-catalog-results [data-action="resource-target"]').allTextContents())assert.match(text,/T6/);
  await search('resource-not-present-987654321');
  assert.equal(await page.locator('.resource-catalog-results [data-action="resource-target"]').count(),0);
  assert.match(await page.locator('.resource-catalog-results').innerText(),/Ресурсы не найдены/);
  await hideToast();await page.screenshot({path:'output/resources-empty-1420.png',fullPage:true});
  await page.locator('[data-action="resource-reset"]').first().click();
  assert.equal(await page.locator('#resource-search').inputValue(),'');
  assert.equal(await page.locator('[data-resource-filter="tier"]').inputValue(),'');
  const category=page.locator('[data-resource-filter="category"]');
  const categoryValue=await category.locator('option').evaluateAll(options=>options.find(o=>o.value)?.value);
  assert.ok(categoryValue,'Resource categories are populated from real data');
  await category.selectOption(categoryValue);
  assert.ok(await page.locator('.resource-catalog-results [data-action="resource-target"]').count()>0);
  await page.locator('[data-action="resource-reset"]').first().click();

  // Preserve both the game resources and the previous user recipe editor in v1.
  const backup=await exportBackup('output/resources-qa-backup.json');
  assert.equal(backup.version,1);assert.ok(backup.resources.recipes.some(r=>r.id==='expedition'));
  assert.equal(backup.resourceCatalog.quantity,undefined);
  assert.equal(backup.recipeBook.quantity,undefined);
  const nextResource=page.locator(`.resource-catalog-results [data-action="resource-target"]:not([data-id="${initialKey}"])`).first();
  await nextResource.click();
  assert.equal(await quantity().inputValue(),'1','Choosing another material resets its quantity');
  await importBackup(backup);await page.locator('#resource-search').waitFor();
  const sourceLink=page.locator('.resource-sources .resource-inline-link[data-action="resource-target"]').first();
  const sourceKey=await sourceLink.getAttribute('data-id');
  await sourceLink.click();
  assert.equal((await state()).resourceCatalog.targetKey,sourceKey,'A source or ingredient link opens its typed entity');
  await importBackup(backup);await page.locator('#resource-search').waitFor();
  await page.locator('[data-resource-filter="showNodes"]').check();
  const node=page.locator('.resource-catalog-results [data-action="resource-target"]').first(),nodeKey=await node.getAttribute('data-id');
  assert.match(nodeKey,/^resource:/,'The resource node filter displays actual world sources');
  await node.click();
  assert.match(await page.locator('.resource-target-heading').innerText(),/ИСТОЧНИК В МИРЕ/);
  assert.match(await page.locator('.resource-sources').innerText(),/Что добывается/);
  assert.equal(await quantity().count(),0,'Resource nodes are reference sources, not craftable item quantities');
  await importBackup(backup);await page.locator('#resource-search').waitFor();
  await page.locator('[data-action="resource-mode"][data-mode="custom"]').click();
  assert.match(await page.locator('#view').innerText(),/Начальная цепочка учебная/);
  assert.equal((await state()).resourceCatalog.mode,'custom');
  await page.locator('[data-action="resource-mode"][data-mode="game"]').click();
  await page.locator('#resource-search').waitFor();
  await importBackup({...backup,resourceCatalog:{...backup.resourceCatalog,quantity:7}});
  await page.locator('#resource-search').waitFor();
  assert.equal(await quantity().inputValue(),'1','Legacy draft quantities are discarded');
  const legacy=structuredClone(backup);delete legacy.resourceCatalog;
  legacy.tab='resources';legacy.resources.recipes[0].name='Собственный рецепт из старого экспорта';
  await importBackup(legacy);
  await page.locator('#resource-search').waitFor();
  assert.equal((await state()).resources.recipes[0].name,'Собственный рецепт из старого экспорта');
  assert.equal(await quantity().inputValue(),'1','Legacy files receive default game resource controls');
  await page.locator('[data-action="resource-mode"][data-mode="custom"]').click();
  assert.equal(await page.locator('input[data-recipe="expedition"][data-prop="name"]').inputValue(),'Собственный рецепт из старого экспорта');
  await importBackup(backup);await page.locator('#resource-search').waitFor();

  const creaturesTab=page.getByRole('tab',{name:'Существа',exact:true});
  await creaturesTab.click();
  assert.equal(await creaturesTab.getAttribute('aria-selected'),'true');
  const creatureType=page.getByRole('combobox',{name:'Тип',exact:true});
  await creatureType.selectOption('Huntable Animal');
  await page.getByRole('combobox',{name:'Тир',exact:true}).selectOption('4');
  await search('Rangifer');
  assert.equal(await page.locator('.resource-catalog-results .resource-search-item').count(),1);
  await page.locator('.resource-catalog-results [data-id="enemy:9"]').click();
  assert.match(await heading(),catalogName('Rangifer'));
  assert.equal(await quantity().count(),0);
  await page.reload();
  await page.locator('.resource-target-heading h2').filter({hasText:'Rangifer'}).waitFor();
  assert.equal(await creatureType.inputValue(),'Huntable Animal');
  await page.locator('[data-action="resource-reset"]').first().click();
  assert.equal(await creatureType.inputValue(),'');
  await waitForImages();await assertResourceContrast(page);
  await page.screenshot({path:'output/creatures-1420.png'});
  const antler=page.locator('.resource-sources [data-id="item:400827528"]');
  await antler.click();
  assert.match(await heading(),catalogName('Rangifer Antler'));
  await page.locator('.resource-sources [data-id="enemy:9"]').click();
  assert.match(await heading(),catalogName('Rangifer'));
  await page.locator('.resource-sources [data-action="drop-from-catalog"]').click();
  assert.equal(await page.locator('[data-key="drop.preset"]').inputValue(),'rangifer-antler');
  assert.equal(await page.locator('[data-key="drop.chance"]').inputValue(),'2');
  await importBackup(backup);await page.locator('#resource-search').waitFor();

  for(const [width,height]of [[1420,1050],[1280,900],[760,1100],[530,1100],[390,844],[360,800]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await hideToast();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No page overflow at ${width}px`);
   await waitForImages();await assertResourceContrast(page);
   await page.screenshot({path:`output/resources-top-${width}.png`});
   await page.screenshot({path:`output/resources-${width}.png`,fullPage:true});
  }
  await page.locator('#resource-search').focus();assert.ok(await page.locator('#resource-search').evaluate(el=>el===document.activeElement));
  await page.locator('#resource-search').press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));

  // A failed image keeps its allocated slot and reveals the local vector fallback.
  const picture=page.locator('.resource-target-heading .entity-image').first();
  await picture.scrollIntoViewIfNeeded();
  const before=await picture.boundingBox();
  assert.ok(await picture.locator('img').count()>0,'A known material has its real game icon');
  await context.route('**/qa-missing-image.webp',route=>route.abort());
  await picture.locator('img').evaluate((img,src)=>img.src=src,await assetURL(page,'assets/bitcraft/files/qa-missing-image.webp'));
  await page.waitForFunction(()=>!document.querySelector('.resource-target-heading .entity-image img'));
  assert.ok(await picture.locator('.entity-image-fallback').isVisible(),'A failed image reveals the fallback without another image request');
  const after=await picture.boundingBox();
  assert.equal(after.width,before.width);assert.equal(after.height,before.height);
  await context.unroute('**/qa-missing-image.webp');

  // This actual service item has no saved game image; it must render a fallback.
  const missingImage=structuredClone(backup);missingImage.tab='recipeBook';missingImage.recipeBook.targetKey='item:123464';
  await importBackup(missingImage);await page.locator('#recipe-search').waitFor();
  assert.match(await page.locator('.recipe-target-heading').innerText(),/Developer Pickaxe/);
  const missingSlot=page.locator('.recipe-target-heading [data-entity-key="item:123464"]');
  assert.equal(await missingSlot.locator('img').count(),0,'Records without a local binding do not request a guessed image');
  await missingSlot.scrollIntoViewIfNeeded();assert.ok(await missingSlot.locator('.entity-image-fallback').isVisible());

  // A tall pickaxe icon must fit its goal frame as well as the flatter ingot icon.
  const tallImage=structuredClone(backup);tallImage.tab='recipeBook';tallImage.recipeBook.targetKey='family:item:1606324183';
  tallImage.recipeBook.quantity=10;tallImage.recipeBook.inventory={};
  await importBackup(tallImage);await page.locator('#recipe-search').waitFor();
  await page.setViewportSize({width:1420,height:1050});
  await assertEmblemContainsImage('.recipe-target-heading');
  await page.evaluate(()=>scrollTo(0,0));await waitForImages();await hideToast();
  await page.screenshot({path:'output/recipes-top-1420.png'});

  assert.deepEqual(externalRequests,[],'Rendering game resources never contacts the CDN');
  assert.deepEqual(failedRequests,[],'All bundled resource images and catalogues load');
  assert.deepEqual(errors,[],'Resource and image workflows produce no uncaught JavaScript errors');
  console.log('PASS: real game resources and creatures, local images, search/filter/reset, production plan, Rangifer loot, v1/legacy data preservation, keyboard, contrast and responsive layouts; no JS or HTTP errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
