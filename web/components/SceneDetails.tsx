import type {CompositeClip} from './CompositeDetail';
import styles from './SceneDetails.module.css';
import {routeSpeeds} from '../lib/routeStats';

/** Capture/delivery values are separate from the imported review movie's metadata. */
export type CaptureDetails={
  array?:string; arrayReference?:boolean; camera?:string; lenses?:string|string[]; recording?:string;
  nativeStitch?:string; maxResolution?:string; hdr?:boolean;
};

export function SceneDetails({clip,capture}:{clip:CompositeClip;capture?:CaptureDetails}){
  const speeds=routeSpeeds(clip.map.segments);
  const hdr=capture?.recording?.toUpperCase()==='RED RAW'||capture?.hdr===true;
  const origin=clip.map.segments.find(segment=>segment.length)?.[0];
  const duration=`${Math.floor(clip.media.duration/60).toString().padStart(2,'0')}:${Math.floor(clip.media.duration%60).toString().padStart(2,'0')}`;
  return <section className={styles.card} aria-label="Scene details">
    <h2 className={styles.title}>Scene details</h2>
    <dl className={styles.metrics}>
      <div><dt>Duration</dt><dd>{duration}</dd></div>
      <div><dt>Frames / sec</dt><dd>{clip.media.fps}</dd></div>
      <div><dt>Max resolution</dt><dd className={!capture?.maxResolution?styles.pending:undefined}>{capture?.maxResolution??'To confirm'}</dd></div>
    </dl>
    <dl className={styles.specs}>
      <div><dt>Camera array</dt><dd>{capture?.array??'Not recorded'}</dd></div>
      <div><dt>Camera / capture{capture?.arrayReference?' · reference':''}</dt><dd>{capture?.camera??'To confirm'}{capture?.recording&&<small>{capture.recording}</small>}</dd></div>
      <div className={styles.wide}><dt>Lenses{capture?.arrayReference?' · reference':''}</dt><dd>{(Array.isArray(capture?.lenses)?capture.lenses:[capture?.lenses??'Not recorded']).map((line,i)=><span className={styles.lensLine} key={i}>{line}</span>)}</dd></div>
      {capture?.nativeStitch&&<div className={styles.wide}><dt>Native stitch</dt><dd>{capture.nativeStitch}</dd></div>}
    </dl>
    <div className={styles.flags} aria-label="Scene data and delivery">
      {origin&&<span>GPS route</span>}
      {clip.motionURL&&<span>IMU</span>}
      {hdr?<span>HDR available</span>:capture?.hdr===false?<span>SDR delivery</span>:null}
    </div>
    <dl className={styles.route} aria-label="GPS route statistics">
      <div><dt>Route length</dt><dd>{Number.isFinite(clip.summary.meters)?`${(clip.summary.meters/1000).toFixed(2)} km`:'—'}</dd></div>
      <div><dt>Avg speed</dt><dd>{speeds?`${speeds.average.toFixed(1)} km/h`:'—'}</dd></div>
      <div><dt>Min speed</dt><dd>{speeds?`${speeds.min.toFixed(1)} km/h`:'—'}</dd></div>
      <div><dt>Max speed</dt><dd>{speeds?`${speeds.max.toFixed(1)} km/h`:'—'}</dd></div>
    </dl>
    <footer className={styles.footer}>
      <span title="Speeds are derived from consecutive GPS fixes, not instantaneous sensor velocity.">Captured {new Date(`${clip.summary.captureDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
      {origin&&<span>Start GPS {origin.lat.toFixed(5)}, {origin.lon.toFixed(5)}</span>}
    </footer>
  </section>;
}
