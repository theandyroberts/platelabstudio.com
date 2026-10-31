import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {containedPath,selectCompositeRole,validateTracks,telemetrySummary,publicationDecision} from '../src/composite/core.mjs';
import {escapeXML,mapProjection} from '../src/composite/map.mjs';
import {validateEnrichment} from '../src/composite/enrich.mjs';

function fixture(){const samples={gps:[],imu:[]},mapping={fps:30,frameCount:100,frameIndexBasis:'zero-based',canonicalStartFrame:900,tracks:{gps:[],imu:[]}};for(let i=0;i<3;i++){samples.gps.push({tc_frames:900+i*30,latitude:34,longitude:-118+i*.0001,altitude_meters:40-i,host_wall_clock:'2024-01-04T15:00:00Z'});samples.imu.push({tc_frames:900+i*30,raw_accel:{x:0,y:9.8,z:0},raw_gyro:{x:0,y:0,z:0}});for(const k of ['gps','imu'])mapping.tracks[k].push({outputFrame:i*30,sampleIndex:i});}return{telemetry:{samples,take:{start_frame:900}},mapping};}
test('package paths reject traversal, absolute paths and symlink escapes',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-path-test-'));try{await fs.mkdir(path.join(dir,'root'));await fs.writeFile(path.join(dir,'outside'),'private');await fs.symlink(path.join(dir,'outside'),path.join(dir,'root/link'));for(const relative of ['../outside',path.join(dir,'outside'),'link'])await assert.rejects(containedPath(path.join(dir,'root'),relative));await fs.writeFile(path.join(dir,'root/valid'),'ok');assert.equal(await containedPath(path.join(dir,'root'),'valid'),await fs.realpath(path.join(dir,'root/valid')));}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('frame mapping uses declared fps rather than stretching samples or assuming 24',()=>{const {telemetry,mapping}=fixture();const result=validateTracks(telemetry,mapping);assert.equal(result.imu[1].t,1);assert.equal(result.imu[2].frame,60);assert.deepEqual(result.imu[0].accel,[0,9.8,0]);});
test('mismatched, duplicate-index, and out-of-bounds frame mappings are rejected',()=>{for(const mutate of [f=>f.mapping.tracks.imu[1].outputFrame++,f=>f.mapping.tracks.imu[1].sampleIndex=0,f=>f.mapping.tracks.imu[2].outputFrame=100,f=>f.telemetry.samples.imu[0].raw_gyro.x=NaN]){const f=fixture();mutate(f);assert.throws(()=>validateTracks(f.telemetry,f.mapping));}});
test('GPS discontinuities split routes instead of drawing lines over missing data',()=>{const f=fixture(),tracks=validateTracks(f.telemetry,f.mapping);tracks.gps[2].t=12;const result=telemetrySummary(tracks);assert.equal(result.segments.length,2);assert.equal(result.warnings.length,1);assert.ok(result.meters<15);});
test('watermark absence and uncertainty are audited but never hold publication',()=>{for(const status of ['not_detected','uncertain']){const result=publicationDecision({status});assert.equal(result.state,'published-local');assert.equal(result.warnings[0].blocking,false);}assert.equal(publicationDecision({status:'detected'}).warnings.length,0);});
test('map projection keeps observed route in a padded viewport; names cannot inject SVG',()=>{const f=fixture(),tracks=validateTracks(f.telemetry,f.mapping),p=mapProjection(tracks.gps);for(const fix of tracks.gps){const [x,y]=p.point(fix);assert.ok(x>0&&x<1000&&y>0&&y<650);}assert.equal(escapeXML('<script>&"'), '&lt;script&gt;&amp;&quot;');});
test('enrichment cannot invent evidence, timestamps, or detected-watermark evidence',()=>{const evidence=[{id:'frame-0',t:0}],base={title:'Test',description:'Test',labels:[{label:'Bridge',category:'scene',confidence:.9,start:0,end:0,evidenceIds:['frame-0']}],posterCandidates:[{t:0}],watermark:{status:'uncertain',evidenceIds:[]},limitations:[]};assert.equal(validateEnrichment(base,evidence,10),base);for(const mutate of [d=>d.labels[0].evidenceIds=['fake'],d=>d.labels[0].end=12,d=>d.posterCandidates[0].t=9,d=>d.watermark.status='detected']){const data=structuredClone(base);mutate(data);assert.throws(()=>validateEnrichment(data,evidence,10));}});

test('composite selection supports unchanged MMM and newer role names without camera fallback',()=>{
 const old={stock_clip_id:'ANY-JOB-CLIP',selected_publish_asset_type:'rebuilt_nine_camera_proxies',assets:[{role:'rough_stitch'},{role:'camera_4_proxy'}]};
 assert.equal(selectCompositeRole(old),'rough_stitch');
 assert.equal(selectCompositeRole({assets:[{role:'stitched_composite'}]}),'stitched_composite');
 const both={assets:[{role:'rough_stitch'},{role:'stitched_composite'}]};
 assert.equal(selectCompositeRole(both),'stitched_composite');assert.equal(selectCompositeRole(both,'rough_stitch'),'rough_stitch');
 for(const assets of [[],[{role:'camera_4_proxy'}],[{role:'rough_stitch'},{role:'rough_stitch'}],[{role:'stitched_composite'},{role:'stitched_composite'},{role:'rough_stitch'}]])assert.throws(()=>selectCompositeRole({assets}));
 assert.throws(()=>selectCompositeRole(old,'camera_4_proxy'));
});
