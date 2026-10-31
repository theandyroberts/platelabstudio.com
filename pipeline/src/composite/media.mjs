import fs from 'node:fs/promises';
import path from 'node:path';
import { command, probe, json, writeJSON, CROP } from './core.mjs';

export function reviewedCoverage(violations,review,fingerprint,frameCount){
  if(!violations.length)return null;
  if(!review||review.sourceFingerprint!==fingerprint||review.decision!=='dark-scene-false-positive'||typeof review.reason!=='string'||!review.reason.trim()||!Array.isArray(review.frames)||review.frames.some(n=>!Number.isInteger(n)||n<0||n>=frameCount)||violations.some(n=>!review.frames.includes(n)))throw new Error(`Crop intersects lower black region in ${violations.length} frames; source-matched visual coverage review required`);
  return {method:'assistant-visual-review',frames:violations,reason:review.reason};
}

export async function buildMedia(source, out, work, media, fingerprint) {
  if(!Number.isInteger(media.fps))throw new Error('This crop/evidence pilot requires integer frame rates; add fractional-rate frame sampling before accepting this source');
  await fs.mkdir(path.join(out,'frames'),{recursive:true});
  await fs.mkdir(path.join(out,'views'),{recursive:true});
  const done=path.join(work,'media.json');
  try { const cache=await json(done); if(cache.fingerprint===fingerprint) {await Promise.all(['composite.mp4',...cache.frames.map(e=>e.file),...cache.views.map(e=>e.file)].map(file=>fs.access(path.join(out,file))));return cache;} } catch {}
  // A changed source must not leave old frames/views in a later public package.
  for(const dir of ['frames','views','source-frames']){await fs.rm(path.join(out,dir),{recursive:true,force:true});await fs.mkdir(path.join(out,dir),{recursive:true});}
  console.log('Encoding one full 4096×2048 composite for every playback view…');
  const temp=path.join(out,'composite.partial.mp4');
  const encoder=process.env.COMPOSITE_ENCODER || (process.platform==='darwin'?'h264_videotoolbox':'libx264');
  if(!['libx264','h264_videotoolbox'].includes(encoder))throw new Error('Unsupported composite encoder');
  const encoding=encoder==='libx264'?['-c:v','libx264','-preset','fast','-crf','18','-threads','2']:['-c:v','h264_videotoolbox','-b:v','24000000'];
  await command('ffmpeg',['-v','error','-i',source,'-map','0:v:0','-an',...encoding,'-profile:v','high','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart','-y',temp]);
  const rendition=await probe(temp);
  if(rendition.frameCount!==media.frameCount || rendition.fps!==media.fps || rendition.width!==media.width || rendition.height!==media.height) throw new Error('Rendition changed frame correspondence');
  await fs.rename(temp,path.join(out,'composite.mp4'));
  console.log('Extracting exact one-second evidence frames and complete-clip coverage check…');
  // select at exact frame indices; fps filtering can select an offset frame.
  await command('ffmpeg',['-v','error','-i',source,'-vf',`select=not(mod(n\\,${Math.round(media.fps)})),crop=${CROP.width}:${CROP.height}:0:0,scale=1536:432`,'-fps_mode','vfr','-q:v','3','-start_number','0','-y',path.join(out,'frames','%03d.jpg')]);
  const pixels=await command('ffmpeg',['-v','error','-i',source,'-vf','scale=256:128','-pix_fmt','gray','-f','rawvideo','pipe:1'],{binary:true});
  const frameSize=256*128, inspected=pixels.length/frameSize;
  if(inspected!==media.frameCount) throw new Error('Coverage inspection missed frames');
  let earliest=128; const violations=[];
  for(let frame=0;frame<inspected;frame++) {
    let first=128;
    for(let y=127;y>40;y--) {
      let dark=0;for(let x=0;x<256;x++) if(pixels[frame*frameSize+y*256+x]<=12) dark++;
      if(dark/256>=0.985) first=y;else break;
    }
    earliest=Math.min(earliest,first);
    if(first*16<CROP.height) violations.push(frame);
  }
  await writeJSON(path.join(work,'coverage-inspection.json'),{sourceFingerprint:fingerprint,frameCount:inspected,earliestBlackRowEstimate:earliest*16,cropBottom:CROP.height,violations});
  let review=null;
  if(violations.length){try{review=await json(path.join(work,'coverage-review.json'));}catch(e){if(e.code!=='ENOENT')throw e;}}
  const coverageReview=reviewedCoverage(violations,review,fingerprint,inspected);
  // Four overlapping 110° rectilinear views expose signs/objects hidden by panoramic distortion.
  const evidence=[];
  for(let t=0;t<media.duration;t+=4) {
    for(const yaw of [-135,-45,45,135]) {
      const name=`t${String(t).padStart(3,'0')}-yaw${yaw}.jpg`;
      await command('ffmpeg',['-v','error','-ss',String(t),'-i',source,'-frames:v','1','-vf',`v360=input=equirect:output=flat:yaw=${yaw}:pitch=8:h_fov=110:v_fov=70:w=1280:h=800`,'-q:v','3','-y',path.join(out,'views',name)]);
      evidence.push({id:`view-${t}-${yaw}`,t,yaw,file:`views/${name}`});
    }
  }
  const frames=Array.from({length:Math.ceil(media.duration)},(_,t)=>({id:`frame-${t}`,t,file:`frames/${String(t).padStart(3,'0')}.jpg`}));
  const result={fingerprint,rendition,frames,views:evidence,coverage:{framesInspected:inspected,analysisResolution:[256,128],earliestBlackRowEstimate:earliest*16,cropBottom:CROP.height,violations:0,heuristicViolations:violations.length,...(coverageReview?{review:coverageReview}:{}),method:'Contiguous near-black rows at bottom of every decoded frame; reduced-resolution heuristic, not pixel-level certification.'}};
  await writeJSON(done,result);return result;
}

export async function extractExtraViews(source,out,times) {
  const views=[];
  for(const t of times) for(const yaw of [-135,-45,45,135]) {
    const name=`detail-${t.toFixed(2)}-yaw${yaw}.jpg`;
    await command('ffmpeg',['-v','error','-ss',String(t),'-i',source,'-frames:v','1','-vf',`v360=input=equirect:output=flat:yaw=${yaw}:pitch=8:h_fov=110:v_fov=70:w=1600:h=1000`,'-q:v','2','-y',path.join(out,'views',name)]);
    views.push({id:`detail-${t}-${yaw}`,t,yaw,file:`views/${name}`});
  }
  return views;
}

export async function extractWatermarkFrames(source,out,duration) {
  await fs.mkdir(path.join(out,'source-frames'),{recursive:true});
  const result=[];
  for(let t=0;t<duration;t+=12){
    const name=`source-${t}.jpg`;
    await command('ffmpeg',['-v','error','-ss',String(t),'-i',source,'-frames:v','1','-vf','scale=2048:1024','-q:v','3','-y',path.join(out,'source-frames',name)]);
    result.push({id:`source-${t}`,t,file:`source-frames/${name}`,fullSource:true});
  }
  return result;
}
