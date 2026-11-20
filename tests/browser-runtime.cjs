const {createRequire}=require('node:module');
const path=require('node:path');
const fs=require('node:fs');

// Prefer the project's dependency; retain the bundled Codex runtime fallback.
const runtimeRequire=createRequire(path.resolve(path.dirname(process.execPath),'../node_modules/playwright/package.json'));
let playwright;
try{
 require.resolve('playwright');
 playwright=require('playwright');
}catch(error){
 if(error.code!=='MODULE_NOT_FOUND'||!String(error.message).includes("'playwright'"))throw error;
 try{playwright=runtimeRequire('playwright');}
 catch(runtimeError){throw new Error('Playwright is unavailable. Use an installed project dependency or the bundled Node runtime.',{cause:runtimeError});}
}

const browserName=process.env.BROWSER||'chromium';
if(!['chromium','firefox','webkit'].includes(browserName))throw new Error(`Unsupported BROWSER=${browserName}; use chromium, firefox or webkit.`);
const target=new URL(process.env.BASE_URL||'http://127.0.0.1:4173/');
if(!['http:','https:'].includes(target.protocol))throw new Error('BASE_URL must use HTTP or HTTPS.');
target.search='';target.hash='';
if(!target.pathname.endsWith('/'))target.pathname+='/';
const baseURL=target.href;
const appURL=(relative='')=>new URL(relative,baseURL).href;
// Built releases keep their module and assets beneath a versioned directory.
const assetURL=(page,relative='')=>page.locator('script[type="module"][src]').first().evaluate((script,relative)=>new URL(relative,script.src).href,relative);
function isAppURL(value){
 try{const url=new URL(value,baseURL);return url.origin===target.origin&&url.pathname.startsWith(target.pathname);}
 catch{return false;}
}

function edgeExecutable(){
 if(process.platform!=='win32')return null;
 const roots=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean);
 return roots.map(root=>path.join(root,'Microsoft','Edge','Application','msedge.exe')).find(file=>fs.existsSync(file))||null;
}
function browserCapabilities(){
 const bundledExecutable=playwright[browserName].executablePath();
 const explicitExecutable=process.env.BROWSER_EXECUTABLE_PATH||null;
 const hasBundledBrowser=fs.existsSync(bundledExecutable);
 const edgeFallback=!explicitExecutable&&!hasBundledBrowser&&browserName==='chromium'?edgeExecutable():null;
 return {browserName,explicitExecutable,bundledExecutable,hasBundledBrowser,edgeFallback,available:Boolean(explicitExecutable?fs.existsSync(explicitExecutable):hasBundledBrowser||edgeFallback)};
}
async function launchBrowser(options={}){
 const settings={headless:true,...options};
 if(settings.executablePath||settings.channel)return playwright[browserName].launch(settings);
 const capability=browserCapabilities();
 if(capability.explicitExecutable)return playwright[browserName].launch({...settings,executablePath:capability.explicitExecutable});
 try{return await playwright[browserName].launch(settings);}
 catch(error){
  // The default headless launch may use an installed headless shell instead
  // of executablePath(). Only a genuinely missing browser allows fallback.
  if(!/Executable doesn't exist/i.test(error.message))throw error;
  const edge=browserName==='chromium'?edgeExecutable():null;
  if(edge)return playwright.chromium.launch({...settings,channel:'msedge'});
  throw new Error(`No installed ${browserName} browser is available. Set BROWSER_EXECUTABLE_PATH to an existing compatible browser; this test does not download browsers.`,{cause:error});
 }
}

function catalogName(original) {
 const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 return new RegExp(`^(?:${escaped}|.+ \\(${escaped}\\))$`);
}

module.exports={playwright,chromium:playwright.chromium,browserName,launchBrowser,baseURL,appURL,assetURL,isAppURL,browserCapabilities,catalogName};
