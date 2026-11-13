'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {evaluateSceneClipLicenseTier} from '@/lib/sceneClipSelection';
import {formatFrameTimecode,formatSourceTimecode,formatRelativeTimecode,secondsToFrame} from '../../viewer/src/playback-selection.js';
import styles from './CompositeSelection.module.css';

type Markers={inFrame:number|null;outFrame:number|null};
type Scene={id:string;name:string;projectName:string};
type Library={authenticated:boolean;scenes:Scene[];clips?:{id:string;version:number;inFrame:number|null;outFrame:number|null;plate:{sku:string}}[];error?:string};
type Props={id:string;sku?:string;fps:number;duration:number;sourceTimecode:string;media:RefObject<HTMLVideoElement|null>;seek:(time:number)=>void;pause:()=>void;ready:boolean};
const EMPTY:Markers={inFrame:null,outFrame:null};
export function CompositeSelection(props:Props){
  const [markers,setMarkers]=useState<Markers>(EMPTY),[frame,setFrame]=useState(0),[hydrated,setHydrated]=useState(false);
  const [chooser,setChooser]=useState(false),[library,setLibrary]=useState<Library|null>(null),[sceneId,setSceneId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
  const [returnPath,setReturnPath]=useState('');
  const live=useRef({props,markers});live.current={props,markers};
  const storageKey=`platelab-selection:${props.sku||props.id}`;
  const lastFrame=Math.max(0,Math.ceil(props.duration*props.fps)-1);
  useEffect(()=>{
    let draft=false;
    try{const raw=localStorage.getItem(storageKey);if(raw){const value=JSON.parse(raw);if(['inFrame','outFrame'].every(key=>value[key]===null||(Number.isSafeInteger(value[key])&&value[key]>=0&&value[key]<=lastFrame))){setMarkers(value);draft=true;}}}catch{}
    const url=new URL(location.href);setReturnPath(url.pathname+url.search+url.hash);
    const preferred=url.searchParams.get('scene')||new URLSearchParams(url.searchParams.get('from')?.split('?')[1]).get('scene')||'';
    setSceneId(preferred);setHydrated(true);
    if(!preferred||!props.sku||draft)return;
    const controller=new AbortController();
    fetch(`/api/scene-library?scene=${encodeURIComponent(preferred)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const data:Library=await response.json();const clip=data.clips?.find(item=>item.plate.sku===props.sku);
      if(clip?.inFrame!==null&&clip?.outFrame!==null&&clip?.inFrame!==undefined&&clip.outFrame!==undefined&&!controller.signal.aborted&&!localStorage.getItem(storageKey)){setMarkers({inFrame:clip.inFrame,outFrame:clip.outFrame});setSaved('Saved to this scene.');}
    }).catch(()=>{});
    return()=>controller.abort();
  },[storageKey]);
  // Write only in response to a marker edit; loading a page must not overwrite a saved scene selection.
  function change(next:Markers){setMarkers(next);setSaved('');setError('');try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{}}
  useEffect(()=>{
    const media=props.media.current;if(!media)return;let callback=0,active=true;
    const update=()=>{
      const {props:p,markers:m}=live.current;const f=secondsToFrame(media.currentTime,p.fps);setFrame(f);
      if(!media.paused&&!media.seeking&&m.inFrame!==null&&m.outFrame!==null&&m.outFrame>m.inFrame&&f>m.outFrame)p.seek(m.inFrame/p.fps);
    };
    const tick=()=>{if(!active)return;update();callback=media.requestVideoFrameCallback(tick);};
    if(media.requestVideoFrameCallback)callback=media.requestVideoFrameCallback(tick);
    media.addEventListener('timeupdate',update);media.addEventListener('seeked',update);update();
    return()=>{active=false;if(callback)media.cancelVideoFrameCallback(callback);media.removeEventListener('timeupdate',update);media.removeEventListener('seeked',update);};
  },[props.media]);
  function mark(which:'inFrame'|'outFrame'){
    props.pause();const f=Math.min(lastFrame,secondsToFrame(props.media.current?.currentTime||0,props.fps));setFrame(f);
    change({...markers,[which]:f,...(which==='outFrame'&&markers.inFrame===null?{inFrame:0}:{})});
  }
  async function openSave(){
    setChooser(true);setBusy(true);setError('');
    try{const response=await fetch('/api/scene-library',{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Your scenes could not load.');setLibrary(data);}
    catch(reason){setError(reason instanceof Error?reason.message:'Your scenes could not load.');}finally{setBusy(false);}
  }
  async function save(){
    if(!sceneId||!props.sku)return;setBusy(true);setError('');
    try{
      const read=async()=>{const response=await fetch(`/api/scene-library?scene=${encodeURIComponent(sceneId)}`,{cache:'no-store'});const data:Library=await response.json();if(!response.ok||!data.authenticated)throw Error(data.error||'Please log in again to save.');return data.clips?.find(item=>item.plate.sku===props.sku);};
      let clip=await read();
      if(!clip){const response=await fetch('/api/scene-library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sceneId,sku:props.sku})});const result=await response.json();if(!response.ok)throw Error(result.error||'The plate could not be added.');clip=await read();}
      if(!clip)throw Error('The saved plate could not be found. Please retry.');
      const response=await fetch(`/api/scene-clips/${clip.id}/selection`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...markers,expectedVersion:clip.version})});const result=await response.json();if(!response.ok)throw Error(result.error||'Selection could not be saved.');
      const scene=library?.scenes.find(item=>item.id===sceneId);setSaved(`Saved to ${scene?.projectName} / ${scene?.name}.`);setChooser(false);window.dispatchEvent(new Event('platelab-scene-updated'));
    }catch(reason){setError(reason instanceof Error?reason.message:'Selection could not be saved.');}finally{setBusy(false);}
  }
  const tier=evaluateSceneClipLicenseTier(markers.inFrame,markers.outFrame,props.fps);
  const any=markers.inFrame!==null||markers.outFrame!==null;
  const invalid=markers.inFrame!==null&&markers.outFrame!==null&&!tier;
  return <section className={styles.selection} aria-label="In and Out selection">
    <div className={styles.row}>
      <button disabled={!props.ready||!hydrated||busy} aria-pressed={markers.inFrame!==null} onClick={()=>mark('inFrame')}>Set In</button>
      <button disabled={!props.ready||!hydrated||busy} aria-pressed={markers.outFrame!==null} onClick={()=>mark('outFrame')}>Set Out</button>
      <dl className={styles.readouts}>
        <div><dt>Source TC</dt><dd>{formatSourceTimecode(frame,props.fps,props.sourceTimecode)}</dd></div>
        <div><dt>From In</dt><dd>{formatRelativeTimecode(frame,markers.inFrame,props.fps)}</dd></div>
        <div><dt>In</dt><dd className={styles.marker}>{markers.inFrame===null?'--:--:--:--':formatSourceTimecode(markers.inFrame,props.fps,props.sourceTimecode)}</dd></div>
        <div><dt>Out</dt><dd className={styles.marker}>{markers.outFrame===null?'--:--:--:--':formatSourceTimecode(markers.outFrame,props.fps,props.sourceTimecode)}</dd></div>
        <div><dt>Selected</dt><dd>{tier?formatFrameTimecode(tier.durationFrames,props.fps):'--:--:--:--'}</dd></div>
        <div><dt>License</dt><dd>{tier?.tierSeconds?`${tier.tierSeconds} sec`:'—'}</dd></div>
      </dl>
      {any&&<button disabled={busy} onClick={()=>change(EMPTY)}>Clear markers</button>}
      {props.sku&&<button disabled={!tier||!tier.tierSeconds||busy} onClick={()=>void openSave()}>{saved?'Selection saved':'Save selection'}</button>}
    </div>
    <p className={styles.hint} role="status">{invalid?'Out must be later than In. Reset either marker or clear both.':tier&&!tier.tierSeconds?'This selection exceeds the available license duration.':saved|| (any?'Save this selection to a project scene to keep it with your work. Unsaved markers stay in this browser.':'Set either marker. Setting Out first defaults In to the first frame.')}</p>
    {chooser&&<div className={styles.chooser} role="region" aria-label="Save selection to project">
      {busy?<span role="status">Saving / loading scenes…</span>:library?.authenticated?<>{library.scenes.length?<><label>Project / scene<select value={sceneId} onChange={event=>setSceneId(event.target.value)}><option value="">Choose a scene</option>{library.scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.projectName} / {scene.name}</option>)}</select></label><button disabled={!sceneId||!tier} onClick={()=>void save()}>Save to scene</button></>:<span>Create a project and scene to keep this selection.</span>}<a href={`/projects/new?plateReturn=${encodeURIComponent(returnPath)}`}>Create project &amp; scene</a></>:library?<><span>Log in to save these points to a project scene.</span><a href={`/login?next=${encodeURIComponent(returnPath)}`}>Log in to save</a></>:<button onClick={()=>void openSave()}>Retry</button>}
      <button disabled={busy} onClick={()=>setChooser(false)}>Cancel</button>
    </div>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
