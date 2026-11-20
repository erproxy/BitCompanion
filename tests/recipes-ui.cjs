const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {launchBrowser,baseURL,catalogName}=require('./browser-runtime.cjs');

async function assertRecipeContrast(page){
 const result=await page.evaluate(()=>{
  const rgba=value=>{const match=value.match(/rgba?\(([^)]+)\)/);return match?match[1].split(/[ ,/]+/).filter(Boolean).map(Number):[0,0,0,0];};
  const over=(front,back)=>front.slice(0,3).map((value,index)=>value*(front[3]??1)+back[index]*(1-(front[3]??1)));
  const luminance=rgb=>{const a=rgb.map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});return .2126*a[0]+.7152*a[1]+.0722*a[2];};
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const selectors='.field>span,.field input,.field select,.table-input,.data-table th,.data-table td,.primary,.secondary,.recipe-explanation,.recipe-method summary,.recipe-tree-node summary,.recipe-facts dt,.recipe-facts dd,.recipe-record,.recipe-total-time,.recipe-description,.recipe-source-note,.recipe-metrics span,.recipe-metrics b,.recipe-search-item b,.recipe-search-item small,.recipe-issues li,.recipe-issues summary,.recipe-result-count,.recipe-link';
  let checked=0;const failures=[];
  for(const element of document.querySelector('.recipe-book').querySelectorAll(selectors)){
   const style=getComputedStyle(element),box=element.getBoundingClientRect();
   const text=(element.value||element.textContent||'').trim();
   if(!box.width||!box.height||style.visibility!=='visible'||element.disabled||!text)continue;
   const parents=[];for(let node=element;node;node=node.parentElement)parents.push(node);
   let backgrounds=[[255,255,255]];
   for(const node of parents.reverse()){
    const current=getComputedStyle(node);backgrounds=backgrounds.map(bg=>over(rgba(current.backgroundColor),bg));
    const stops=[...current.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(match=>rgba(match[0]));
    if(stops.length)backgrounds=backgrounds.flatMap(bg=>stops.map(stop=>over(stop,bg)));
   }
   const color=rgba(style.color),actual=Math.min(...backgrounds.map(bg=>contrast(over(color,bg),bg)));
   const large=parseFloat(style.fontSize)>=24||(Number(style.fontWeight)>=700&&parseFloat(style.fontSize)>=18.66);
   const minimum=large?3:4.5;checked++;
   if(actual+.02<minimum)failures.push({element:element.tagName+'.'+String(element.className),text:text.slice(0,80),contrast:Number(actual.toFixed(2)),minimum});
  }
  return {checked,failures};
 });
 assert.ok(result.checked>100,'Recipe fields, table cells, methods and details were checked for readable contrast');
 assert.deepEqual(result.failures,[],`Recipe contrast failures: ${JSON.stringify(result.failures)}`);
}

// This context has no access to the installed application's browser profile.
(async()=>{
 const browser=await launchBrowser();
 try{
  const context=await browser.newContext({ locale: 'ru-RU', viewport:{width:1420,height:1050},deviceScaleFactor:1,acceptDownloads:true});
  const page=await context.newPage(),errors=[],failedRequests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{if(response.status()>=400)failedRequests.push(`${response.status()} ${response.url()}`);});
  await fs.mkdir('output',{recursive:true});
  await page.goto(baseURL);
  const tab=async name=>page.locator(`.nav-item[data-tab="${name}"]`).click();
  const openBook=async()=>{await tab('recipeBook');await page.locator('#recipe-search').waitFor();};
  const quantity=()=>page.locator('[data-key="recipeBook.quantity"]');
  const rootMethod=()=>page.locator('.recipe-detail > section').first().locator('[data-recipe-method]');
  const targetKey=()=>rootMethod().getAttribute('data-recipe-method');
  const heading=()=>page.locator('.recipe-target-heading h2').innerText();
  const fillQuantity=async n=>{await quantity().fill(String(n));await quantity().press('Tab');};
  const search=async value=>{
   await page.locator('#recipe-search').fill(value);
   await page.waitForFunction(value=>{
    const state=JSON.parse(localStorage.getItem('bitcraft-companion-v1'));
    return state?.recipeBook?.search===value;
   },value);
  };
  const chain=()=>page.locator('.recipe-tree-node > summary').evaluateAll(nodes=>nodes.map(node=>node.textContent.replace(/\s+/g,' ').trim()));
  const assertPickaxeChain=async n=>{
   const summaries=await chain();
   for(const [tier,name]of [[6,'Rathium'],[5,'Luminite'],[4,'Elenvar'],[3,'Emarium'],[2,'Pyrelite'],[1,'Ferralith']]){
    const node=summaries.find(text=>text.includes(`${name} Pickaxe`)&&text.includes(`T${tier}`));
    assert.ok(node,`T${tier} ${name} Pickaxe appears in the upgrade chain`);
    assert.match(node,new RegExp(`× ${n}(?:$|\\D)`),`${name} upgrade requires ${n} pickaxes`);
   }
  };
  const exportBackup=async file=>{
   const event=page.waitForEvent('download');
   await page.locator('.top-actions [data-action="export"]').click();
   await(await event).saveAs(file);
   return JSON.parse(await fs.readFile(file,'utf8'));
  };
  const importBackup=async data=>{
   await page.evaluate(()=>document.querySelector('#toast').textContent='');
   await page.locator('#import-file').setInputFiles({name:'recipes-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
   await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Данные импортированы'));
  };

  await openBook();
  assert.match(await heading(),catalogName('Rathium Pickaxe'));
  assert.equal(await quantity().inputValue(),'1');
  assert.match(await page.locator('.recipe-target-heading').innerText(),/T6.*Любая редкость/i);
  await assertPickaxeChain(1);
  assert.ok(await page.locator('.recipe-steps > li').count()>6,'The plan includes intermediate materials as well as tool upgrades');
  assert.ok(await page.locator('.recipe-materials tbody tr').count()>0,'The plan includes resources to obtain');
  assert.notEqual(await rootMethod().inputValue(),'external','The default goal uses a manufacturing recipe');
  assert.match(await page.locator('.recipe-plan-summary').innerText(),/Сбор.*дорога/);
  assert.match(await page.locator('.recipe-plan-summary').innerText(),/скорост|прогресс|действи/i,'The time estimate explains its baseline assumptions');
  await assertRecipeContrast(page);
  const methodDetails=page.locator('.recipe-detail > section').filter({hasText:'Получение и рецепты'}).last().locator('.recipe-method > summary').first();
  await methodDetails.click();await assertRecipeContrast(page);await methodDetails.click();
  const initialKey=await targetKey();
  await page.screenshot({path:'output/recipes-default-1420.png',fullPage:true});
  await page.locator('.recipe-tree').screenshot({path:'output/recipes-chain.png'});

  await fillQuantity(2);await assertPickaxeChain(2);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('bitcraft-companion-v1')));
  assert.equal(stored.recipeBook.quantity,undefined,'Draft quantity is absent from local storage');
  await page.reload();await page.locator('#recipe-search').waitFor();
  assert.equal(await quantity().inputValue(),'1','Reload starts a new calculation');
  await assertPickaxeChain(1);
  await fillQuantity(10);

  // The previous tier may be supplied as a finished tool; its production stops.
  const tier5Node=page.locator('.recipe-tree-node > summary').filter({hasText:'Luminite Pickaxe'}).first().locator('..');
  const tier5Select=tier5Node.locator('[data-recipe-method]').first();
  const tier5Key=await tier5Select.getAttribute('data-recipe-method');
  const tier5Recipe=await tier5Select.inputValue();
  await tier5Select.selectOption('external');
  assert.ok((await chain()).some(text=>text.includes('Luminite Pickaxe')));
  assert.ok(!(await chain()).some(text=>text.includes('Elenvar Pickaxe')),'An external T5 tool stops lower-tier tool production');
  const externalRow=page.locator('.recipe-materials tbody tr').filter({hasText:'Luminite Pickaxe'});
  assert.equal(await externalRow.count(),1);
  assert.match(await externalRow.innerText(),/10/);
  await page.locator(`[data-recipe-method="${tier5Key}"]`).first().selectOption(tier5Recipe);
  await assertPickaxeChain(10);

  // Stock of the actual target should satisfy the goal without crafting.
  const stock=()=>page.locator(`[data-recipe-stock="${initialKey}"]`).first();
  await stock().fill('10');await stock().press('Tab');
  assert.equal(await page.locator('.recipe-steps > li').count(),0);
  assert.match(await page.locator('.recipe-detail').innerText(),/Запасы закрывают цель/);
  await stock().fill('0');await stock().press('Tab');await assertPickaxeChain(10);

  // Search stays bounded, and Russian search aliases find the English names.
  await search('кирка');
  assert.ok(await page.locator('.recipe-search-item').count()>0);
  assert.ok(await page.locator('.recipe-search-item').count()<=12,'Only one result page is mounted');
  const russianCount=await page.locator('.recipe-result-count').innerText();
  for(const name of await page.locator('.recipe-search-item b').allTextContents())assert.match(name,/Pickaxe/i);
  await search('Pickaxe');
  assert.equal(await page.locator('.recipe-result-count').innerText(),russianCount);
  await page.locator('[data-recipe-filter="tier"]').selectOption('6');
  for(const text of await page.locator('.recipe-search-item small').allTextContents())assert.match(text,/T6(?:\D|$)/);
  await search('no-such-recipe-987654321');
  assert.equal(await page.locator('.recipe-search-item').count(),0);
  assert.match(await page.locator('#recipe-results').innerText(),/Ничего не найдено/);
  await page.screenshot({path:'output/recipes-empty-1420.png',fullPage:true});
  await page.locator('#recipe-results [data-action="recipe-reset"]').click();
  assert.equal(await page.locator('#recipe-search').inputValue(),'');
  assert.equal(await page.locator('[data-recipe-filter="tier"]').inputValue(),'');
  assert.ok(await page.locator('.recipe-search-item').count()>0);

  await search('Luminite Pickaxe');
  await page.locator('[data-recipe-filter="type"]').selectOption('Family');
  await page.locator('.recipe-search-item').first().click();
  assert.match(await heading(),catalogName('Luminite Pickaxe'));
  assert.match(await page.locator('.recipe-target-heading').innerText(),/T5/);
  assert.notEqual(await targetKey(),initialKey);
  assert.equal(await quantity().inputValue(),'1','Choosing another recipe resets its quantity');
  const ingredientLink=page.locator('.recipe-materials .recipe-link').first();
  if(await ingredientLink.count()){
   const linkedKey=await ingredientLink.getAttribute('data-id');
   await ingredientLink.click();
   assert.equal(await targetKey(),linkedKey,'A material link opens its own recipe card');
  }

  // Restore the meaningful default and save it through the application's journal.
  await search('Rathium Pickaxe');
  await page.locator('[data-recipe-filter="tier"]').selectOption('6');
  await page.locator(`.recipe-search-item[data-id="${initialKey}"]`).click();
  await fillQuantity(10);await assertPickaxeChain(10);
  await page.locator('[data-action="save"][data-type="recipeBook"]').click();
  await tab('journal');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bitcraft-companion-v1'))?.saved.some(plan=>plan.type==='recipeBook'&&plan.data.quantity===10));
  await page.reload();
  const saved=page.locator('.saved-card').filter({hasText:'Rathium Pickaxe'}).first();
  await saved.waitFor();assert.equal(await saved.count(),1);
  await saved.locator('[data-action="open-saved"]').click();
  assert.match(await heading(),catalogName('Rathium Pickaxe'));
  assert.equal(await quantity().inputValue(),'10');
  await assertPickaxeChain(10);
  const backup=await exportBackup('output/recipes-qa-backup.json');
  assert.equal(backup.version,1,'Existing export version remains supported');
  assert.equal(backup.recipeBook.targetKey,initialKey);
  assert.equal(backup.recipeBook.quantity,undefined);
  assert.ok(backup.recipeBook.snapshot,'The saved calculation identifies its catalogue snapshot');
  assert.equal(backup.saved.find(plan=>plan.type==='recipeBook').data.quantity,10);
  assert.ok(backup.resources.recipes.length>0,'The custom recipe book remains in the export');
  const legacy=structuredClone(backup);delete legacy.recipeBook;
  legacy.saved=legacy.saved.filter(plan=>plan.type!=='recipeBook');
  await importBackup(legacy);
  await tab('resources');
  await page.locator('[data-action="resource-mode"][data-mode="custom"]').click();
  assert.ok(await page.locator('.recipe-editor').count(),'An export without the new section still imports');
  await importBackup({...backup,recipeBook:{...backup.recipeBook,quantity:10}});
  await openBook();
  assert.equal(await targetKey(),initialKey);
  await assertPickaxeChain(1);

  // A real, long chain is checked at all required viewport widths.
  await page.locator('.recipe-catalog [data-action="recipe-reset"]').click();
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#toast')).opacity)===0);
  for(const [width,height]of [[1420,1050],[1280,900],[760,1100],[530,1100],[390,844],[360,800]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>scrollTo(0,0));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Recipe book has no page overflow at ${width}px`);
   for(const selector of ['#recipe-search','[data-key="recipeBook.quantity"]','.recipe-total-time']){
    assert.ok(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;}),`${selector} stays within ${width}px viewport`);
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'Long recipe content remains vertically scrollable');
   await page.screenshot({path:`output/recipes-top-${width}.png`});
   await page.screenshot({path:`output/recipes-${width}.png`,fullPage:true});
  }
  await page.locator('#recipe-search').focus();
  assert.ok(await page.locator('#recipe-search').evaluate(el=>el===document.activeElement),'Search is keyboard focusable');
  await page.locator('#recipe-search').press('Tab');
  assert.ok(await page.evaluate(()=>document.activeElement!==document.body),'Keyboard navigation reaches another control');
  assert.equal(await page.locator('.error').count(),0);
  assert.deepEqual(failedRequests,[],'All local recipe assets load successfully');
  assert.deepEqual(errors,[],'Recipe workflows produce no uncaught JavaScript errors');
  console.log('PASS: recipe search/filter/reset, 10 T6 pickaxes through T1, quantity and stock, nested external methods, item links, journal, persistence and compatible export/import, 1420/1280/760/530/390/360px layouts; no JS errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
