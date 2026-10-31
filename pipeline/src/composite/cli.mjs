import fs from 'node:fs/promises';
import {deriveCompositeTags} from '../../../shared/composite/tags.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {inspectPackage,json,writeJSON,CROP,VERSION,telemetrySummary,publicationDecision,command} from './core.mjs';
import {buildMedia} from './media.mjs';
import {buildMap} from './map.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const [mode='prepare',sourceArg,...args]=process.argv.slice(2);
const root=path.resolve(sourceArg ?? path.join(repo,'../content/Roll_001_Clip_020'));
const id=process.env.COMPOSITE_CLIP_ID || path.basename(root).toLowerCase().replaceAll('_','-');
if(!/^[a-z0-9-]+$/.test(id))throw new Error('Invalid clip identifier');
const out=path.join(process.env.COMPOSITE_OUTPUT_ROOT || path.join(repo,'web/public/media/composite'),id),work=path.join(process.env.COMPOSITE_WORK_ROOT || path.join(repo,'sample-data/composite'),id);
await fs.mkdir(work,{recursive:true});await fs.mkdir(out,{recursive:true});
if(mode==='retag') {
  const record=await json(path.join(out,'clip.json'));
  Object.assign(record,deriveCompositeTags(record.labels));
  await writeJSON(path.join(out,'clip.json'),record);
  console.log(`Updated ${record.tags.length} evidence-backed search tags for ${id}`);
} else if(mode==='prepare') {
  const requestedRole=args.find(a=>a.startsWith('--composite-role='))?.split('=')[1];
  console.log(`Validating immutable package ${id} (${requestedRole??'automatic composite selection'})…`);
  const pkg=await inspectPackage(root,{compositeRole:requestedRole});
  const role=pkg.compositeRole;
  const summary=telemetrySummary(pkg.tracks);
  await writeJSON(path.join(work,'package.json'),{...pkg,root,id});
  const tasks=await Promise.allSettled([buildMedia(pkg.files[role],out,work,pkg.media,pkg.fingerprint),buildMap(summary,out,work)]);
  for(const t of tasks)if(t.status==='rejected')throw t.reason;
  const [assets,map]=tasks.map(t=>t.value);
  const motion={schema:'tpl.imu.v1',fps:pkg.media.fps,frameCount:pkg.media.frameCount,samples:pkg.tracks.imu,mounting:'upright-screen-rear',mountingVerified:false,physicalSynchronizationProven:pkg.validation.physicalSynchronizationProven,profile:'mls-estimated-preview-v1'};
  await writeJSON(path.join(out,'motion.json'),motion);
  const prepared={version:VERSION,id,stockId:pkg.manifest.stock_clip_id,sourceFingerprint:pkg.fingerprint,media:pkg.media,crop:CROP,summary,map,assets,validation:pkg.validation,hashes:pkg.hashes,sourceRole:role,baseURL:`/media/composite/${id}`,sourceTimecode:pkg.manifest.source_take.timecode_in};
  await writeJSON(path.join(work,'prepared.json'),prepared);
  console.log(`Prepared ${id}: ${assets.frames.length} timeline frames, ${assets.views.length} rectilinear views, ${map.features} map features`);
} else if(mode==='enrich') {
  const {enrich}=await import('./enrich.mjs');
  await enrich(await json(path.join(work,'prepared.json')),out,work);
} else if(mode==='localize'||mode==='localize-published') {
  const {localize,localizeForPublish}=await import('./localize.mjs');
  const target=mode==='localize'?path.join(work,'enrichment.json'):path.join(out,'clip.json');
  const record=await json(target);
  const updated=await (mode==='localize'?localizeForPublish:localize)(record,out,work);
  await writeJSON(target,updated);
  console.log(`Evidence rectangles: ${updated.localization.status}; ${updated.localization.localizedLabels} observations marked`);
} else if(mode==='publish'||mode==='preview') {
  const prepared=await json(path.join(work,'prepared.json'));
  let enriched;
  if(mode==='preview') {
    const receipt=await json(path.join(work,'ai-timeline.json'));
    const {validateEnrichment}=await import('./enrich.mjs');
    validateEnrichment(receipt.report,prepared.assets.frames,prepared.media.duration);
    enriched={...receipt.report,sourceFingerprint:prepared.sourceFingerprint,evidence:[...prepared.assets.frames,...prepared.assets.views],labels:receipt.report.labels.map(l=>({...l,id:`label-${crypto.createHash('sha256').update(JSON.stringify([l.category,l.label.toLowerCase(),[...l.evidenceIds].sort()])).digest('hex').slice(0,16)}`,editorialStatus:'machine-proposed'})),enrichment:{status:'running',model:receipt.model,effort:receipt.effort,passes:[{name:receipt.name,usage:receipt.usage}],coverage:{timelineSeconds:1,directionalSeconds:4,adaptiveTimes:[]}}};
  } else enriched=await json(path.join(work,'enrichment.json'));
  if(enriched.sourceFingerprint!==prepared.sourceFingerprint)throw new Error('Enrichment source changed');
  let overrides={};try{overrides=await json(path.join(work,'overrides.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const posterTime=overrides.posterTime ?? enriched.posterCandidates[0]?.t ?? 0;
  if(!Number.isFinite(posterTime)||posterTime<0||posterTime>=prepared.media.duration)throw new Error('Invalid poster override');
  const pkg=await json(path.join(work,'package.json'));
  await command('ffmpeg',['-v','error','-ss',String(posterTime),'-i',pkg.files[prepared.sourceRole],'-frames:v','1','-vf',`crop=${CROP.width}:${CROP.height}:0:0,scale=1536:432`,'-q:v','2','-y',path.join(out,'poster.jpg')]);
  const {assets,...publicPrepared}=prepared;
  const publication=publicationDecision(enriched.watermark,[{code:'physical_sync_unverified',message:'Frame mapping verified; physical sensor/camera synchronization unverified.',blocking:false},{code:'mounting_assumed',message:'MLS upright/screen-rear mounting profile assumed for this take.',blocking:false},...(prepared.media.color.transfer==='unknown'?[{code:'source_transfer_unspecified',message:'Source transfer tag absent; browser preview assumes BT.709. No creative grade applied.',blocking:false}]:[])]);
  if(mode==='preview')publication.state='preview-enrichment-running';
  // Write the audit before making the local catalog record visible. Missing watermark never blocks it.
  await fs.appendFile(path.join(work,'audit.jsonl'),JSON.stringify({at:new Date().toISOString(),sourceFingerprint:prepared.sourceFingerprint,action:mode==='preview'?'preview-local':'publish-local',publication})+'\n');
  const record={...publicPrepared,...enriched,...deriveCompositeTags(enriched.labels),coverage:assets.coverage,title:overrides.title??enriched.title,description:overrides.description??enriched.description,posterTime,hoverStart:overrides.hoverStart??posterTime,posterURL:`${prepared.baseURL}/poster.jpg`,videoURL:`${prepared.baseURL}/composite.mp4`,motionURL:`${prepared.baseURL}/motion.json`,frames:assets.frames,views:enriched.evidence,publication,publishedAt:new Date().toISOString(),overrides};
  await writeJSON(path.join(out,'clip.json'),record);
  console.log(`${mode==='preview'?'Preview ready':'Published locally'}: /review/${id} (${record.labels.length} evidence-linked labels)`);
} else throw new Error('Use prepare, enrich, localize, localize-published, publish, preview, or retag');
