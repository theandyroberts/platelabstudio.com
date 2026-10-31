import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {isBillingError} from './analysis-response.mjs';
import {billingHoldActive,BILLING_RECHECK_MS} from './billing-hold.mjs';
import {json,writeJSON,containedPath,inspectPackage,hashFile,selectCompositeRole} from './core.mjs';

const safeName=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const clipIdFor=stockId=>{
  if(typeof stockId!=='string'||!stockId.trim()||stockId.length>200)throw new Error('Invalid stock_clip_id');
  return `clip-${stockId.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)}-${crypto.createHash('sha256').update(stockId).digest('hex').slice(0,12)}`;
};
export async function initialize(root){
  for(const name of ['uploading','ready','processing','archive','failed','status','work','build','public/media/composite'])await fs.mkdir(path.join(root,name),{recursive:true});
}
export function publicRecord(record){
  const clip=structuredClone(record);
  for(const key of ['baseURL','videoURL','posterURL','motionURL'])if(!clip[key].startsWith('/composite-review/'))clip[key]='/composite-review'+clip[key];
  clip.overrides={};
  clip.enrichment.passes=clip.enrichment.passes.map(({name,model,effort,usage,createdAt})=>({name,model,effort,usage,createdAt}));
  clip.publication={...clip.publication,state:'published-review',publicServerUpdated:true};
  const serialized=JSON.stringify(clip);
  if(/OPENAI_API_KEY|\/Users\/|\/home\/ubuntu\//.test(serialized))throw new Error('Private paths found in public record');
  return clip;
}
async function catalogAt(root){try{return await json(path.join(root,'public/catalog.json'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export async function requiredProcessingSpace(root,id,fingerprint,sourceBytes){
  const reserve=2*1024**3;
  try{
    const cache=await json(path.join(root,'work',id,'media.json'));
    if(cache.fingerprint!==fingerprint)throw new Error('Media belongs to another source');
    const sizes=await Promise.all(['composite.mp4',...cache.frames.map(e=>e.file),...cache.views.map(e=>e.file)].map(async file=>{
      const stat=await fs.stat(await containedPath(path.join(root,'build',id),file));
      if(!stat.isFile()||stat.size===0)throw new Error('Incomplete prepared media');
      return stat.size;
    }));
    // Resuming labels reuses the rendition. Reserve space for publication,
    // extra evidence and metadata, rather than another two source copies.
    return reserve+2*sizes.reduce((a,b)=>a+b,0);
  }catch{return Math.max(reserve,sourceBytes*2);}
}
export async function publishReview(root,id){
  if(!safeName.test(id))throw new Error('Invalid public clip ID');
  const build=path.join(root,'build',id),record=publicRecord(await json(path.join(build,'clip.json')));
  const parent=path.join(root,'public/media/composite'),dest=path.join(parent,id);
  let existing;try{existing=await json(path.join(dest,'clip.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing){
    if(existing.sourceFingerprint!==record.sourceFingerprint||existing.stockId!==record.stockId)throw new Error('Published identity collision; refusing to replace a different source');
  }else{
    const staged=path.join(root,'build',`.${id}.publishing`);
    await fs.mkdir(staged,{recursive:true});
    // Only generated media is exposed. Input packages, logs and request receipts remain private.
    for(const name of ['composite.mp4','poster.jpg','motion.json','map.svg','frames','views','source-frames']){
      try{await fs.cp(path.join(build,name),path.join(staged,name),{recursive:true});}catch(e){if(e.code!=='ENOENT'||!['source-frames'].includes(name))throw e;}
    }
    await writeJSON(path.join(staged,'clip.json'),record);
    await fs.rename(staged,dest);
  }
  const published=existing??record;
  const catalog=await catalogAt(root);
  const entry={id,title:published.title,posterURL:published.posterURL,tags:published.tags??[],media:{duration:published.media.duration,fps:published.media.fps}};
  const index=catalog.findIndex(c=>c.id===id);if(index<0)catalog.push(entry);else catalog[index]={...entry,...(catalog[index].labelEditorialURL?{labelEditorialURL:catalog[index].labelEditorialURL}:{})};
  await writeJSON(path.join(root,'public/catalog.json'),catalog);
  return published;
}
async function pipeline(root,source,id,role){
  const runner=fileURLToPath(new URL('./run.mjs',import.meta.url));
  const logfile=await fs.open(path.join(root,'work',id,'pipeline.log'),'a',0o600);
  await fs.rm(path.join(root,'work',id,'ai-provider-error.json'),{force:true});
  try{await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[runner,source,`--composite-role=${role}`],{env:{...process.env,COMPOSITE_CLIP_ID:id,COMPOSITE_OUTPUT_ROOT:path.join(root,'build'),COMPOSITE_WORK_ROOT:path.join(root,'work')},stdio:['ignore',logfile.fd,logfile.fd]});
    child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`Pipeline stopped (${signal??code}); see private work/${id}/pipeline.log, then retry the same transfer`)));
  });}catch(error){
    let provider;try{provider=await json(path.join(root,'work',id,'ai-provider-error.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(provider)throw Object.assign(new Error(provider.message),{code:provider.code});
    throw error;
  }finally{await logfile.close();}
}
export async function processTransfer(root,transfer,{inspect=inspectPackage,run=pipeline}={}){
  if(!safeName.test(transfer))throw new Error('Invalid transfer folder name');
  const source=path.join(root,'processing',transfer),statusFile=path.join(root,'status',`${transfer}.json`);
  let status={transfer,state:'validating',updatedAt:new Date().toISOString()};
  const update=async changes=>{status={...status,...changes,updatedAt:new Date().toISOString()};await writeJSON(statusFile,status);};
  try{
    const st=await fs.lstat(source);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('Transfer must be a real directory');
    const manifestPath=await containedPath(source,'07-Delivery/website_package.json');
    const manifest=await json(manifestPath), manifestHash=await hashFile(manifestPath);
    const role=selectCompositeRole(manifest);
    let id=clipIdFor(manifest.stock_clip_id);
    for(const entry of await catalogAt(root)){
      const published=await json(path.join(root,'public/media/composite',entry.id,'clip.json'));
      if(published.stockId===manifest.stock_clip_id){id=entry.id;break;}
    }
    await update({id,stockId:manifest.stock_clip_id,manifestHash});
    const pkg=await inspect(source,{compositeRole:role});
    let existing;try{existing=await json(path.join(root,'public/media/composite',id,'clip.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(existing&&existing.sourceFingerprint!==pkg.fingerprint)throw new Error('This stock_clip_id is already published with different source bytes; use a new revision ID');
    await fs.mkdir(path.join(root,'work',id),{recursive:true});
    await update({state:'processing',sourceFingerprint:pkg.fingerprint});
    const stat=await fs.statfs(root);
    const sourceBytes=(await fs.stat(pkg.files?.[role]??manifestPath)).size;
    if(Number(stat.bavail)*Number(stat.bsize)<await requiredProcessingSpace(root,id,pkg.fingerprint,sourceBytes))throw new Error('Insufficient free disk for processing; free space and retry');
    await run(root,source,id,role);
    const generated=await json(path.join(root,'build',id,'clip.json'));
    if(generated.sourceFingerprint!==pkg.fingerprint||generated.stockId!==manifest.stock_clip_id)throw new Error('Generated clip does not match validated package');
    if(await hashFile(manifestPath)!==manifestHash)throw new Error('Manifest changed during processing');
    await update({state:'publishing'});
    const clip=await publishReview(root,id);
    await update({state:'published',url:`https://theplatelab.studio/composite-review/review/${id}`,warnings:clip.publication.warnings});
    await fs.rename(source,path.join(root,'archive',transfer));
  }catch(error){
    if(isBillingError(error)){
      await writeJSON(path.join(root,'queue-hold.json'),{reason:'api_billing',code:error.code,message:error.message,at:new Date().toISOString(),nextCheckAt:new Date(Date.now()+BILLING_RECHECK_MS).toISOString()});
      await update({state:'waiting_for_billing',error:error.message,errorCode:error.code});
      await fs.rename(source,path.join(root,'ready',transfer));
      return status;
    }
    await update({state:'failed',error:error.message,...(error.code?{errorCode:error.code}:{})});
    try{await fs.rename(source,path.join(root,'failed',transfer));}catch(moveError){if(moveError.code!=='ENOENT')throw moveError;}
  }
  return status;
}
export async function tick(root,options){
  // A billing failure holds the queue intact instead of repeatedly failing every remaining upload.
  if(await billingHoldActive(root))return;
  for(const folder of ['processing','ready']){
    const entries=(await fs.readdir(path.join(root,folder),{withFileTypes:true})).filter(e=>e.isDirectory()&&safeName.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name));
    if(!entries.length)continue;
    let selected;
    for(const entry of entries){
      const used=folder==='ready' && (await Promise.all(['archive','failed'].map(final=>fs.access(path.join(root,final,entry.name)).then(()=>true,()=>false)))).some(Boolean);
      if(!used){selected=entry;break;}
      console.error(`Ignoring duplicate transfer name ${entry.name}; use a new transfer ID`);
    }
    if(!selected)continue;
    const transfer=selected.name;
    if(folder==='ready'){
      for(const final of ['archive','failed']){try{await fs.access(path.join(root,final,transfer));throw new Error(`Transfer name already used: ${transfer}; remove duplicate from ready or choose a new transfer ID`);}catch(e){if(e.code!=='ENOENT')throw e;}}
      await fs.rename(path.join(root,'ready',transfer),path.join(root,'processing',transfer));
    }
    const result=await processTransfer(root,transfer,options);console.log(JSON.stringify(result));return result;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(process.env.COMPOSITE_DATA_ROOT??'composite-server-data');await initialize(root);
  // systemd uses flock around this process: a second worker cannot publish concurrently.
  console.log(`Composite pickup started: ${root}/ready`);
  do{try{await tick(root);}catch(e){console.error(e.message);}if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,5000));}while(true);
}
