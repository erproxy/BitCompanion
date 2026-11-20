import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildWeb} from './build-web.mjs';
import {createWebServer} from './serve-web.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function run(file,env={}){
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env,...env},stdio:'inherit',shell:false});
  child.once('error',reject);
  child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${file}: ${signal||'exit '+code}`)));
 });
}
let preview;
try{
 const release=await buildWeb({publicBuild:process.argv.includes('--public')});
 preview=await createWebServer({root:release.outputRoot,port:0,basePath:'/companion/'});
 console.log(`Testing web release ${release.release} at ${preview.url}`);
 const suites=['ui-smoke','localization-ui','dungeons-ui','web-ui','web-offline'];
 if(!release.publicData) suites.splice(2,0,'drops-ui','recipes-ui','resources-ui','buildings-ui','guide-ui','world-ui');
 for(const suite of suites) await run(`tests/${suite}.cjs`,{BASE_URL:preview.url});
 console.log(`PASS: all web UI suites, release ${release.release}`);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await preview?.close();}
