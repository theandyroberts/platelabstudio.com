import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const VERSION = 'composite-pilot-v1';
export const CROP = { id: 'xl-upper-32x9-v1', x: 0, y: 0, width: 4096, height: 1152 };
export const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
export async function writeJSON(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const temp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n');
  await fs.rename(temp, p);
}
export async function hashFile(p) {
  const hash = crypto.createHash('sha256');
  for await (const block of createReadStream(p)) hash.update(block);
  return hash.digest('hex');
}
export async function containedPath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')) throw new Error('Invalid package-relative path');
  const realRoot = await fs.realpath(root);
  const candidate = await fs.realpath(path.resolve(realRoot, relative));
  if (!candidate.startsWith(realRoot + path.sep)) throw new Error('Package path escapes source root');
  return candidate;
}
export function command(program, args, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    // Keep decoding/filtering bounded on the shared VPS. Encoder threads are set separately.
    if(program==='ffmpeg')args=['-threads','2','-filter_threads','2','-filter_complex_threads','2',...args];
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [], err = [];
    child.stdout.on('data', d => out.push(d)); child.stderr.on('data', d => err.push(d));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(binary ? Buffer.concat(out) : Buffer.concat(out).toString()) : reject(new Error(`${program} failed (${code}): ${Buffer.concat(err).toString().slice(-2500)}`)));
  });
}
export async function probe(file) {
  const result = JSON.parse(await command('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file]));
  const s = result.streams.find(s => s.codec_type === 'video');
  if (!s) throw new Error('No video stream');
  const [a,b] = s.avg_frame_rate.split('/').map(Number);
  return { width:s.width, height:s.height, fps:a/b, frameCount:Number(s.nb_frames), duration:Number(s.duration ?? result.format.duration), codec:s.codec_name, pixelFormat:s.pix_fmt, timecode:s.tags?.timecode ?? null, color:{primaries:s.color_primaries ?? 'unknown',transfer:s.color_transfer ?? 'unknown',matrix:s.color_space ?? 'unknown'} };
}
export function selectCompositeRole(manifest, requested) {
  if(!Array.isArray(manifest?.assets))throw new Error('Manifest assets must be an array');
  if(requested!==undefined && !['stitched_composite','rough_stitch'].includes(requested))throw new Error('Unsupported composite role');
  // MMM's existing finished render remains valid for every stock ID. Camera proxies are not playback candidates.
  const role=requested ?? (manifest.assets.some(a=>a.role==='stitched_composite')?'stitched_composite':'rough_stitch');
  if(manifest.assets.filter(a=>a.role===role).length!==1)throw new Error(`Expected one ${role} asset`);
  return role;
}
export async function inspectPackage(root, { compositeRole } = {}) {
  const manifest = await json(await containedPath(root, '07-Delivery/website_package.json'));
  if (manifest.schema !== 'spheris.stock.website_package.v1' || manifest.asset_path_base !== 'take_package') throw new Error('Unsupported MMM package contract');
  compositeRole = selectCompositeRole(manifest, compositeRole);
  const roles = [compositeRole, 'gps_imu', 'gps_imu_frame_map'];
  const files = {}, hashes = {};
  for (const role of roles) {
    const matches = manifest.assets.filter(a => a.role === role);
    if (matches.length !== 1) throw new Error(`Expected one ${role} asset; select composite explicitly`);
    const asset = matches[0];
    if (!/^[a-f0-9]{64}$/i.test(asset.checksum_sha256 ?? '')) throw new Error(`Missing SHA-256: ${role}`);
    files[role] = await containedPath(root, asset.path);
    hashes[role] = await hashFile(files[role]);
    if (hashes[role] !== asset.checksum_sha256.toLowerCase()) throw new Error(`Checksum mismatch: ${role}`);
  }
  const media = await probe(files[compositeRole]);
  if(!Number.isInteger(media.fps)||media.fps<1||media.fps>60||!Number.isInteger(media.frameCount)||media.frameCount<2||!Number.isFinite(media.duration)||media.duration<=0||media.duration>180)throw new Error('Supported input: constant integer 1–60 fps, 2+ frames, at most 180 seconds');
  if (media.width !== CROP.width || media.height !== 2048) throw new Error('Unvalidated source dimensions for this crop profile');
  const telemetry = await json(files.gps_imu), mapping = await json(files.gps_imu_frame_map);
  const validation = await json(await containedPath(root,'03-GPS-IMU-Logs/gps_imu_validation.json'));
  if (validation.fileHashes?.['gps_imu.json'] !== hashes.gps_imu || validation.fileHashes?.['output-frame-map.json'] !== hashes.gps_imu_frame_map) throw new Error('Validation report belongs to other telemetry');
  if (validation.stockClipID !== manifest.stock_clip_id || validation.state !== 'verified') throw new Error('Unverified or mismatched telemetry');
  if (Math.abs(mapping.fps - media.fps) > 1e-6 || mapping.frameCount !== media.frameCount || media.frameCount !== manifest.source_take.frame_count) throw new Error('Composite / telemetry frame contract mismatch');
  const tracks = validateTracks(telemetry, mapping);
  return {manifest, compositeRole, files, hashes, media, tracks, validation, fingerprint:crypto.createHash('sha256').update(JSON.stringify({version:VERSION,hashes,crop:CROP})).digest('hex')};
}
export function validateTracks(telemetry, mapping) {
  if (mapping.frameIndexBasis !== 'zero-based' || !Number.isFinite(mapping.fps) || mapping.fps <= 0 || !Number.isInteger(mapping.frameCount) || mapping.frameCount < 2 || mapping.canonicalStartFrame !== telemetry.take.start_frame) throw new Error('Invalid frame-map header');
  const result = {};
  for (const kind of ['gps','imu']) {
    const seen = new Set(); let previous = -1;
    result[kind] = (mapping.tracks[kind] ?? []).map(row => {
      if (!Number.isInteger(row.outputFrame) || row.outputFrame < 0 || row.outputFrame >= mapping.frameCount || row.outputFrame < previous || !Number.isInteger(row.sampleIndex) || row.sampleIndex < 0 || seen.has(row.sampleIndex)) throw new Error(`Invalid ${kind} mapping`);
      seen.add(row.sampleIndex); previous = row.outputFrame;
      const s = telemetry.samples[kind]?.[row.sampleIndex];
      if (!s || s.tc_frames - mapping.canonicalStartFrame !== row.outputFrame) throw new Error(`Unanchored ${kind} sample`);
      const base = {frame:row.outputFrame,t:row.outputFrame/mapping.fps};
      if (kind === 'gps') {
        if (![s.latitude,s.longitude,s.altitude_meters].every(Number.isFinite) || Math.abs(s.latitude)>90 || Math.abs(s.longitude)>180 || typeof s.host_wall_clock!=='string' || !Number.isFinite(Date.parse(s.host_wall_clock))) throw new Error('Invalid GPS fix');
        return {...base,lat:s.latitude,lon:s.longitude,altitude:s.altitude_meters,clock:s.host_wall_clock};
      }
      const accel = ['x','y','z'].map(a=>s.raw_accel?.[a]), gyro = ['x','y','z'].map(a=>s.raw_gyro?.[a]);
      if (![...accel,...gyro].every(Number.isFinite)) throw new Error('Invalid raw IMU sample');
      return {...base,accel,gyro,mag:['x','y','z'].map(a=>s.raw_mag?.[a] ?? null)};
    });
    if (result[kind].length < 2 || seen.size !== telemetry.samples[kind].length) throw new Error(`Incomplete ${kind} mapping`);
  }
  return result;
}
export function distance(a,b) {
  const rad = Math.PI/180, dlat=(b.lat-a.lat)*rad, dlon=(b.lon-a.lon)*rad;
  return 6371000*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2));
}
export function telemetrySummary(tracks) {
  const fixes = tracks.gps.filter((p,i,a)=>!i || p.lat!==a[i-1].lat || p.lon!==a[i-1].lon);
  let meters=0; const segments=[[]], warnings=[];
  for (let i=0;i<fixes.length;i++) {
    const p=fixes[i], prev=fixes[i-1];
    if(prev) {
      const d=distance(prev,p),dt=p.t-prev.t;
      if (dt>3 || dt<=0 || d/dt>90) {segments.push([]);warnings.push({code:'gps_gap_or_jump',t:p.t});}
      else meters+=d;
    }
    segments.at(-1).push(p);
  }
  const norms=tracks.imu.map(s=>Math.hypot(...s.accel)), sorted=[...norms].sort((a,b)=>a-b);
  const median=sorted[Math.floor(sorted.length/2)];
  const deviations=norms.map(n=>Math.abs(n-median)).sort((a,b)=>a-b),mad=deviations[Math.floor(deviations.length/2)];
  const threshold=Math.max(3,6*mad), events=[];
  tracks.imu.forEach((s,i)=>{
    if(Math.abs(norms[i]-median)>threshold && (!events.length || s.t-events.at(-1).end>1)) events.push({start:s.t,end:Math.min(s.t+0.5,tracks.imu.at(-1).t),label:'Acceleration outlier',confidence:0.65,detail:'Raw acceleration magnitude differs from this clip baseline; inspect footage before classifying a jolt.'});
    else if(Math.abs(norms[i]-median)>threshold && events.length) events.at(-1).end=s.t;
  });
  return {fixes,segments,warnings,meters,altitude:{start:fixes[0].altitude,end:fixes.at(-1).altitude,min:Math.min(...fixes.map(p=>p.altitude)),max:Math.max(...fixes.map(p=>p.altitude)),verifiedGrade:false},motionEvents:events,acceleration:{median,mad,min:sorted[0],max:sorted.at(-1),threshold},captureDate:tracks.gps[0].clock.slice(0,10)};
}
export function publicationDecision(watermark, alerts=[]) {
  const warnings=[...alerts];
  if(watermark.status!=='detected') warnings.push({code:watermark.status==='not_detected'?'missing_source_watermark':'source_watermark_uncertain',message:'Source watermark not verified. Review flagged; auto-publication continues.',blocking:false});
  return {state:'published-local',warnings,watermark,publicServerUpdated:false};
}
