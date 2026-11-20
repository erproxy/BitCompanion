const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {launchBrowser,baseURL}=require('./browser-runtime.cjs');

// Inspect the ordinary text users need to read, rather than decorative stars,
// disabled controls or the low-emphasis application footer.
async function assertReadableText(page,scope='body'){
 const results=await page.evaluate(scope=>{
  const rgba=value=>{const m=value.match(/rgba?\(([^)]+)\)/);return m?m[1].split(/[ ,/]+/).filter(Boolean).map(Number):[0,0,0,0];};
  const composite=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));
  const lum=rgb=>{const a=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*a[0]+.7152*a[1]+.0722*a[2];};
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const selectors='.field>span,.field input,.field select,.table-input,.stat-label,.stat-sub,.orbit-caption,.orbit-note,.result-description,.data-table th,.data-table td,.notice p,.timer-status,dialog p,.source-list,.source-list b,.source-list a,.primary,.secondary';
  let count=0;const failures=[];
  for(const el of document.querySelector(scope).querySelectorAll(selectors)){
   const style=getComputedStyle(el),box=el.getBoundingClientRect();
   if(!box.width||!box.height||style.visibility!=='visible'||el.disabled||!((el.value||el.textContent||'').trim()))continue;
   const parents=[];for(let p=el;p;p=p.parentElement)parents.push(p);
   let backgrounds=[[255,255,255]];
   for(const p of parents.reverse()){
    const s=getComputedStyle(p),base=rgba(s.backgroundColor);
    backgrounds=backgrounds.map(bg=>composite(base,bg));
    const stops=[...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m=>rgba(m[0]));
    if(stops.length)backgrounds=backgrounds.flatMap(bg=>stops.map(stop=>composite(stop,bg)));
   }
   const color=rgba(style.color),contrast=Math.min(...backgrounds.map(bg=>ratio(composite(color,bg),bg)));
   const large=parseFloat(style.fontSize)>=24||(Number(style.fontWeight)>=700&&parseFloat(style.fontSize)>=18.66);
   const required=large?3:4.5;count++;
   if(contrast+.02<required)failures.push({element:el.tagName+'.'+String(el.className),text:(el.value||el.textContent).trim().slice(0,65),contrast:Number(contrast.toFixed(2)),required});
  }
  return{count,failures};
 },scope);
 assert.ok(results.count>0,`Readable text was checked in ${scope}`);
 assert.deepEqual(results.failures,[],`Insufficient text contrast: ${JSON.stringify(results.failures)}`);
}

(async()=>{
 const browser=await launchBrowser();
 try {
 const context=await browser.newContext({ locale: 'ru-RU', viewport:{width:1420,height:1050},deviceScaleFactor:1,acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(baseURL);
 await page.evaluate(()=>localStorage.clear());await page.reload();
 const change=async(key,value)=>{const el=page.locator(`input[data-key="${key}"],select[data-key="${key}"]`).first();if(await el.evaluate(x=>x.tagName==='SELECT'))await el.selectOption(String(value));else{await el.fill(String(value));await el.press('Tab');}};
 const tab=async(name)=>{await page.locator(`.nav-item[data-tab="${name}"]`).click();if(name==='resources')await page.locator('#resource-search,[data-key="resources.targetId"]').first().waitFor();};
 const body=()=>page.locator('#view').innerText();
 const assertRing=async expected=>{
  const progress=page.locator('.probability-card .orbit-progress');
  assert.equal(await progress.getAttribute('pathLength'),'100');
  // Read the authored value: CSSOM rounds SVG dash values to six significant digits.
  const actual=await progress.evaluate(el=>parseFloat(el.getAttribute('style')?.match(/(?:^|;)\s*stroke-dasharray\s*:\s*([^\s;]+)/)?.[1]||el.getAttribute('stroke-dasharray')));
  assert.ok(Math.abs(actual-expected)<1e-8,`Probability ring ${actual}% should equal ${expected}%`);
  const description=await progress.evaluate(el=>el.closest('[role="img"]')?.getAttribute('aria-label'));
  assert.ok(description&&description.includes('%'),'Probability ring has an accessible percentage description');
 };
 const dark=await page.evaluate(()=>{const [r,g,b]=getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);return Math.max(r,g,b)<75;});
 assert.ok(dark,'Moon Observatory uses a dark application surface');
 assert.match(await body(),/86,74/);assert.match(await body(),/149/);
 await assertRing((1-Math.pow(.98,100))*100);
 await fs.mkdir('output',{recursive:true});
 await page.screenshot({path:'output/BitCraft-Companion.png',fullPage:true});
 await change('drop.quantity',2);
 const chance=Number((await page.locator('.big-result').innerText()).replace('%','').replace(',','.'));
 const independent=(1-Math.pow(.98,100)-100*.02*Math.pow(.98,99))*100;
 assert.ok(Math.abs(chance-independent)<.01);
 await assertRing(independent);
 await change('drop.preset','custom');await change('drop.chance',100);await change('drop.quantity',3);await change('drop.attempts',2);
 assert.match(await page.locator('.big-result').innerText(),/^0/);
 await assertRing(0);
 await change('drop.attempts',3);assert.match(await page.locator('.big-result').innerText(),/^100/);
 await assertRing(100);
 await change('drop.chance',0);assert.match(await page.locator('.big-result').innerText(),/^0/);assert.match(await body(),/∞/);
 await assertRing(0);
 await change('drop.chance',.0000001);assert.equal(Number(await page.locator('[data-key="drop.chance"]').inputValue()),.0000001);
 await change('drop.preset','hexite-chitin');assert.ok(Math.abs(Number(await page.locator('[data-key="drop.chance"]').inputValue())-100/251)<1e-12);
 await page.locator('input[data-key="drop.attempts"]').fill('44');await page.locator('[data-action="save"]').click();await tab('journal');assert.equal(await page.locator('.saved-card').count(),1);
 await page.locator('[data-action="open-saved"]').click();assert.match(await page.locator('.hero h2').innerText(),/Хитин/);
 await tab('rarity');await change('rarity.transition',5);await change('rarity.attempts',100);assert.match(await page.locator('.big-result').innerText(),/84,94/);
 await page.locator('[data-mode="tiers"]').click();assert.match(await body(),/0,020109/);
 await change('rarity.start',5);assert.equal(await page.locator('[data-key="rarity.startTier"]').inputValue(),'6');assert.match(await body(),/100%/);
 await tab('resources');await page.locator('[data-action="resource-mode"][data-mode="custom"]').click();
 assert.equal(await page.locator('[data-key="resources.quantity"]').inputValue(),'1');
 await change('resources.quantity',10);assert.match(await body(),/11 мин/);
 assert.match(await body(),/60/);assert.match(await body(),/100/);
 await page.locator('[data-inventory="logs"]').fill('10');await page.locator('[data-inventory="logs"]').press('Tab');
 assert.match(await page.locator('.data-table').first().innerText(),/50/);
 await page.locator('[data-inventory="board"]').fill('4');await page.locator('[data-inventory="board"]').press('Tab');
 assert.match(await page.locator('.data-table').first().innerText(),/44/);
 await change('resources.targetId','board');
 assert.equal(await page.locator('[data-key="resources.quantity"]').inputValue(),'1');
 await change('resources.quantity',7);
 await page.locator('[data-action="new-recipe"]').click();await page.locator('#recipe-form [name="name"]').fill('Тестовый рецепт');await page.locator('#recipe-form button[type="submit"]').click();
 await page.locator('[data-action="new-ingredient"]').click();await page.locator('#ingredient-form [name="name"]').fill('Руда');await page.locator('#ingredient-form [name="amount"]').fill('3');await page.locator('#ingredient-form button[type="submit"]').click();assert.match(await body(),/Руда/);
 assert.equal(await page.locator('[data-key="resources.quantity"]').inputValue(),'1');
 assert.match(await page.locator('.data-table').first().innerText(),/3/);
 await page.locator('[data-action="save"]').click();
 await tab('time');assert.match(await body(),/160/);
 await page.locator('[data-action="timer-toggle"]').click();await page.waitForTimeout(1200);await page.locator('[data-action="timer-toggle"]').click();await page.locator('[data-action="timer-finish"]').click();assert.equal(await page.locator('.session-row').count(),1);
 await page.reload();assert.equal(await page.locator('.session-row').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.locator('.top-actions [data-action="export"]').click();const download=await downloadPromise;await download.saveAs('output/qa-backup.json');
 const backup=JSON.parse(await fs.readFile('output/qa-backup.json','utf8'));assert.equal(backup.saved.length,2);assert.equal(backup.time.sessions.length,1);
 await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":2}')});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Импорт:'));
 await page.locator('#import-file').setInputFiles('output/qa-backup.json');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Данные импортированы'));
 await page.locator('[data-action="sources"]').first().click();assert.match(await page.locator('#modal').innerText(),/Где хранятся данные/);await assertReadableText(page,'#modal');await page.locator('[data-action="close-modal"]').click();
 await page.evaluate(()=>localStorage.clear());await page.reload();
 const sections=['drops','rarity','resources','time','journal'];
 for(const name of sections){await tab(name);assert.equal(await page.locator('.error').count(),0);await assertReadableText(page);await page.screenshot({path:`output/qa-${name}.png`,fullPage:true});}
 await tab('drops');await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/BitCraft-Moon-1280.png',fullPage:true});
 for(const width of [760,530,390,360]){
  await page.setViewportSize({width,height:1100});
  for(const name of sections){await tab(name);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal overflow in ${name} at ${width}px`);}
  await page.locator('[data-action="sources"]').first().click();
  assert.ok(await page.locator('#modal').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),`Sources dialog fits ${width}px viewport`);
  await page.locator('[data-action="close-modal"]').click();await tab('drops');
  await page.screenshot({path:width===760?'output/BitCraft-Compact.png':`output/BitCraft-Moon-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1420,height:1050});await page.screenshot({path:'output/BitCraft-Companion.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: probability rings and accessible descriptions, dark theme and text contrast, drop boundaries, multi-drop math, exact presets, rarity chains, inventory, recipe editing, plans, timer, persistence, export/import, all tabs at 760/530/390/360px; no JS errors.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
