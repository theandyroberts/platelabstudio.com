'use client';
import {useMemo} from 'react';
import type {CompositeClip} from './CompositeDetail';
import {VehicleAttitude} from './VehicleAttitude';
import {initialRouteHeading} from '../../viewer/src/attitude-heading.js';
import styles from './CompositeDetail.module.css';

type Point=CompositeClip['map']['segments'][number][number];
function positionAt(segments:Point[][],t:number):Point|undefined{
  for(const segment of segments){if(!segment.length||t<segment[0].t||t>segment.at(-1)!.t)continue;for(let i=1;i<segment.length;i++)if(segment[i].t>=t){const a=segment[i-1],b=segment[i],mix=(t-a.t)/(b.t-a.t||1);return {...a,t,lat:a.lat+(b.lat-a.lat)*mix,lon:a.lon+(b.lon-a.lon)*mix,xy:a.xy.map((v,j)=>v+(b.xy[j]-v)*mix),altitude:a.altitude+(b.altitude-a.altitude)*mix};}return segment[0];}
  if(t<(segments[0]?.[0]?.t??0))return segments[0]?.[0];
  const end=segments.at(-1)?.at(-1);return end&&t>end.t?end:undefined;
}

export function CompositeTelemetry({clip,current,catalogMode=false,overlay=false,deferModel=false}:{clip:CompositeClip;current:number;catalogMode?:boolean;overlay?:boolean;deferModel?:boolean}){
  const position=positionAt(clip.map.segments,current);
  const initialHeading=useMemo(()=>initialRouteHeading(clip.map.segments),[clip.map.segments]);
  return (
    <section className={`${styles.telemetryRow} ${overlay?styles.telemetryOverlayPanels:''}`}  aria-label="Synchronized vehicle angle and GPS">
      <VehicleAttitude panel overlay={overlay} deferModel={deferModel} initialHeading={initialHeading} motionURL={clip.motionURL} time={current} videoId={`composite-video-${clip.id}`} stageBase={catalogMode?'/imported-stage':undefined}/>
      <section className={styles.mapCard} aria-label="GPS route"><h2 className={styles.telemetryHeading}>GPS route</h2><div className={styles.map}><img src={`${clip.baseURL}/${clip.map.url}`} alt="Recorded GPS path on a street map" loading="lazy" decoding="async"/><svg viewBox="0 0 1000 650" aria-label="Playback location">{clip.map.segments.map((s,i)=>s.length?<g key={i}><circle cx={s[0].xy[0]} cy={s[0].xy[1]} r="8" fill="#fdfcf6" stroke="#94391c" strokeWidth="4"/><circle cx={s.at(-1)!.xy[0]} cy={s.at(-1)!.xy[1]} r="8" fill="#94391c" stroke="#fdfcf6" strokeWidth="3"/></g>:null)}{position&&<g><circle cx={position.xy[0]} cy={position.xy[1]} r="21" fill="#bb542e" opacity=".2"/><circle cx={position.xy[0]} cy={position.xy[1]} r="9" fill="#1c3027" stroke="white" strokeWidth="4"/></g>}</svg><a href={clip.map.licenseURL} target="_blank" rel="noreferrer" className={styles.attribution}>{clip.map.attribution}</a></div><dl className={styles.gpsReadings}><div><dt>GPS</dt><dd>{position?`${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`:'No fix at this time'}</dd></div><div><dt>ALTITUDE</dt><dd>{position?`${position.altitude.toFixed(1)} m`:'—'}</dd></div></dl></section>
    </section>
  );
}
