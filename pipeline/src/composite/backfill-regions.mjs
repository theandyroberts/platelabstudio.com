import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {json,writeJSON} from './core.mjs';
import {localize,localizeBatch} from './localize.mjs';
import {validRegion} from '../../../shared/composite/regions.mjs';

export function mergeRegions(current,annotated){
  if(current.sourceFingerprint!==annotated.sourceFingerprint||current.labels.length!==annotated.labels.length)throw new Error('Region backfill source changed');
  const patches=new Map(annotated.labels.map(l=>[l.id,l]));
  const evidence=new Set([...(current.frames??[]),...(current.views??[]),...(current.evidence??[])].map(e=>e.id));
  const labels=current.labels.map(label=>{
    const patch=patches.get(label.id);
    if(!patch||label.label!==patch.label||label.detail!==patch.detail||JSON.stringify(label.evidenceIds)!==JSON.stringify(patch.evidenceIds))throw new Error('Region backfill label changed');
    if(!patch.regionScope)return label;
    if(!['localized','whole_frame','unresolved'].includes(patch.regionScope)||!Array.isArray(patch.regions)||patch.regions.length>3||typeof patch.regionNote!=='string'||(patch.regionScope==='localized')!==!!patch.regions.length)throw new Error('Invalid region backfill scope');
    if(patch.regions.some(r=>!validRegion(r)||!label.evidenceIds.includes(r.evidenceId)||!evidence.has(r.evidenceId)))throw new Error('Invalid region backfill');
    return {...label,regions:patch.regions,regionScope:patch.regionScope,regionNote:patch.regionNote,...(patch.regionMethod?{regionMethod:patch.regionMethod}:{})};
  });
  return {...current,labels,localization:annotated.localization};
}
export async function promoteRegions(root,id,annotated){
  const files=[path.join(root,'public/media/composite',id,'clip.json'),path.join(root,'build',id,'clip.json'),path.join(root,'work',id,'enrichment.json')];
  for(const file of files){
    let current;try{current=await json(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    const merged=mergeRegions(current,annotated);
    const backup=path.join(root,'work',id,`before-region-backfill-${file.includes('/public/')?'public':file.includes('/build/')?'build':'enrichment'}.json`);
    try{await fs.copyFile(file,backup,fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
    await writeJSON(file,merged);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(process.env.COMPOSITE_DATA_ROOT),cachedOnly=process.argv.includes('--cached-only');
  const catalog=await json(path.join(root,'public/catalog.json'));
  const statusFile=path.join(root,'region-backfill-status.json');
  const statuses={startedAt:new Date().toISOString(),mode:cachedOnly?'cached-stage':'backfill',clips:[]};
  for(const entry of catalog){
    const id=entry.id,out=path.join(root,'public/media/composite',id),work=path.join(root,'work',id),record=await json(path.join(out,'clip.json'));
    const status={id,state:'running'};statuses.clips.push(status);await writeJSON(statusFile,statuses);
    try{
      if(!cachedOnly){
        try{const partial=await json(path.join(work,'localization-progress.json'));await promoteRegions(root,id,partial);}catch(e){if(e.code!=='ENOENT')throw e;}
      }
      const updated=await localize(record,out,work,{
        ...(cachedOnly?{runBatch:(items,out,work,n)=>localizeBatch(items,out,work,n,async()=>{throw new Error('No completed cached batch');})}:{}),
        onProgress:async updated=>{
          if(!cachedOnly)await promoteRegions(root,id,updated);
          Object.assign(status,{state:'running',...updated.localization});await writeJSON(statusFile,statuses);
        }
      });
      Object.assign(status,{state:'complete',...updated.localization});
    }catch(error){Object.assign(status,{state:cachedOnly?'staged':'failed',error:error.message});console.error(id,error.message);}
    await writeJSON(statusFile,statuses);
  }
  statuses.finishedAt=new Date().toISOString();await writeJSON(statusFile,statuses);
}
