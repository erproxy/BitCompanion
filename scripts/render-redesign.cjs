const {createRequire}=require('node:module');
const path=require('node:path');
const fs=require('node:fs/promises');
const runtimeRequire=createRequire(path.resolve(path.dirname(process.execPath),'../node_modules/playwright/package.json'));
const {chromium}=runtimeRequire('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const files=(await fs.readdir('tmp/pdfs/concepts')).filter(x=>x.endsWith('.html')).sort();
 for(const file of files){
  const context=await browser.newContext({viewport:{width:1360,height:820},deviceScaleFactor:2});
  const page=await context.newPage();
  await page.setContent(await fs.readFile(path.join('tmp/pdfs/concepts',file),'utf8'));
  await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight}));
  await page.screenshot({path:path.join('tmp/pdfs/concepts',file.replace('.html','.png'))});
  console.log(file,JSON.stringify(metrics));
  await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
