'use client';
import {type ReactNode,forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {preload} from 'react-dom';
import {stitchStatus,type StitchStatus as Status} from '@platelab/shared';
import {StitchStatus} from './StitchStatus';
import {CompositeSelection} from './CompositeSelection';
import {secondsToFrame,formatFrameTimecode} from '../../viewer/src/playback-selection.js';
import {compositeStartupFiles,videoSources} from '@/lib/browserPreview';
import {bufferedAhead,hasSource,prefersNoAutoplay,useAdaptiveVideo} from '@/lib/adaptiveVideo';
import styles from './CompositeDetail.module.css';

export type CompositePlayerHandle={seek:(time:number)=>void};
type Props={sku?:string;fullLabTelemetry?:ReactNode;stitchStatus?:Status;id:string;title:string;videoURL:string;stageBase:string;posterURL:string;start:number;duration:number;fps:number;sourceTimecode:string;coverageBottom:number;onTimeChange:(time:number)=>void;onSettled?:()=>void};
const AUTO_SWITCH_SECONDS=10;
// Footage comes first. Lab 360 (a 3D scene of several megabytes) may use the
// connection only once this much footage is in hand, or when it is asked for.
const SETTLED_BUFFER_SECONDS=8;
// Lab 360 is reported as still loading after this long...
const STAGE_STARTUP_TIMEOUT_MS=20000;
// ...and gives way to the panorama after this long. Footage plays throughout, so a slow
// connection costs nothing by waiting; giving up earlier only wasted what had arrived.
const STAGE_REQUESTED_TIMEOUT_MS=60000;
// The telemetry car model waits for Lab 360 to start or stand down, but no longer than this.
const EXTRAS_WAIT_MS=30000;
const clock=(time:number)=>`${Math.floor(time/60).toString().padStart(2,'0')}:${Math.floor(time%60).toString().padStart(2,'0')}`;

// SVG shapes avoid platform emoji substitution for playback symbols.
function PlayIcon(){return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>;}
function PauseIcon(){return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>;}

export const CompositePlayer=forwardRef<CompositePlayerHandle,Props>(function CompositePlayer(props,ref){
  const sources=useMemo(()=>videoSources(props.videoURL),[props.videoURL]);
  // The one progressive file names this footage for the Lab, whichever way it is delivered.
  const playbackURL=sources.progressive;
  const video=useRef<HTMLVideoElement>(null),iframe=useRef<HTMLIFrameElement>(null),shell=useRef<HTMLDivElement>(null);
  const [mode,setMode]=useState<'panorama'|'stage'>('stage'),[playing,setPlaying]=useState(false),[wanted,setWanted]=useState(false),[ready,setReady]=useState(false),[stageReady,setStageReady]=useState(false),[auto,setAuto]=useState(false),[error,setError]=useState(''),[stageError,setStageError]=useState(''),[current,setCurrent]=useState(props.start),[expanded,setExpanded]=useState(false),[telemetryOpen,setTelemetryOpen]=useState(false),[fullFrame,setFullFrame]=useState(false),[stageAttempt,setStageAttempt]=useState(0);
  // The Lab iframe is not created, and downloads nothing, until this is set.
  const [labRequested,setLabRequested]=useState(false),[labSlow,setLabSlow]=useState(false);
  const modeRef=useRef(mode),stageReadyRef=useRef(false),lastStageFrame=useRef(0);
  const stageWarmup=useRef({frames:0,last:0});
  modeRef.current=mode;
  const showStage=mode==='stage'&&stageReady&&!error;
  const expandButton=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  const targetTime=useRef(props.start),playPromise=useRef<Promise<void>|null>(null),playIntent=useRef(false),hoverPaused=useRef(false);
  const userPaused=useRef(false),systemPause=useRef(false),inView=useRef(false),settled=useRef(false),extrasReleased=useRef(false),labByName=useRef(false),automaticStart=useRef(false);
  const videoId=`composite-video-${props.id}`;
  // Playback asked for before the source existed begins as soon as it is attached.
  const adaptive=useAdaptiveVideo(video,sources,{onSourceAttached:()=>{if(playIntent.current)void startPlayback(automaticStart.current);}});
  // The poster is the first thing seen; the playlists are the first thing played.
  preload(props.posterURL,{as:'image',fetchPriority:'high'});
  for(const file of compositeStartupFiles(sources))preload(file,{as:'fetch',crossOrigin:'anonymous'});
  // Stable for this clip: changing views or the playhead never reloads the iframe.
  const [stageURL]=useState(()=>`${props.stageBase}/index.html?${new URLSearchParams({video:playbackURL,label:props.title,fps:String(props.fps),sourceTimecode:props.sourceTimecode,coverageBottom:String(props.coverageBottom),stitchStatus:stitchStatus(props.stitchStatus),embed:'1',preview:'1',scene:'road',sharedVideo:videoId})}`);
  const seek=(time:number)=>{targetTime.current=time;setCurrent(time);props.onTimeChange(time);if(video.current&&video.current.readyState>=1)video.current.currentTime=time;};
  useImperativeHandle(ref,()=>({seek}));
  function pause(byVisitor=false){
    playIntent.current=false;hoverPaused.current=true;if(byVisitor)userPaused.current=true;
    // Scrolling away or hiding the tab pauses too; only a visitor's pause should stick.
    systemPause.current=!byVisitor&&Boolean(video.current&&!video.current.paused);
    video.current?.pause();setPlaying(false);setWanted(false);
  }
  function resetStage(){stageReadyRef.current=false;stageWarmup.current={frames:0,last:0};setStageReady(false);setLabSlow(false);}
  function unavailableStage(message='Lab 360 is unavailable. Showing panoramic footage.'){
    resetStage();labByName.current=false;setStageError(message);setAuto(false);setMode('panorama');releaseExtras();
  }
  function mediaFailed(){
    pause();setReady(false);setAuto(false);resetStage();
    setError('Footage could not load. Playback is paused. Click Play to retry.');
  }
  // With a fallback source still available the player recovers by itself.
  function mediaErrored(media:HTMLVideoElement){if(media.error&&adaptive.current&&adaptive.current.mode!=='progressive')return;mediaFailed();}
  async function startPlayback(automatic=false){
    const media=video.current;if(!media)return;
    playIntent.current=true;automaticStart.current=automatic;setWanted(true);hoverPaused.current=false;userPaused.current=false;setError('');
    // Set the actual properties as well as markup for Safari/autoplay policies.
    media.muted=true;media.defaultMuted=true;media.playsInline=true;
    if(media.error||error){targetTime.current=media.currentTime||targetTime.current;setReady(false);adaptive.current?.retry();}
    // A source is being attached: onSourceAttached calls back here.
    if(!hasSource(media))return;
    if(playPromise.current)return playPromise.current;
    const attempt=async()=>{
      try{await media.play();}
      catch(reason){
        // A seek/load can interrupt play without a media failure. Retry once,
        // but never undo a deliberate pause while a play request was pending.
        if(reason instanceof DOMException&&reason.name==='AbortError'){
          if(!playIntent.current)return;
          try{await media.play();return;}catch{}
        }
        // A browser that declines to autoplay leaves the Play button; that is not a fault.
        if(playIntent.current){pause();if(!(automatic&&reason instanceof DOMException&&reason.name==='NotAllowedError'))setError('Playback could not start. Click Play to retry.');}
      }
    };
    playPromise.current=attempt().finally(()=>{playPromise.current=null;});
    return playPromise.current;
  }
  // Footage is flowing (or deliberately idle): the rest of the page may load.
  function settle(){if(settled.current)return;settled.current=true;setLabRequested(true);}
  // Lower-priority extras (the telemetry car model, the same file Lab 360 needs) load once Lab 360
  // is up or has stood down, so the two never share a slow link.
  function releaseExtras(){if(extrasReleased.current)return;extrasReleased.current=true;props.onSettled?.();}
  function checkSettled(){
    const media=video.current;if(!media||settled.current||media.readyState<2)return;
    if(media.paused){if(!playIntent.current)settle();return;}
    const remaining=Math.max(0,(media.duration||0)-media.currentTime);
    // A visitor who asked for the Lab by name gets it as soon as footage is moving.
    if(bufferedAhead(media)>=Math.min(labByName.current?1:SETTLED_BUFFER_SECONDS,remaining-0.25))settle();
  }
  useEffect(()=>{if(mode!=='panorama')setFullFrame(false);},[mode]);
  function chooseMode(next:'panorama'|'stage'){
    setAuto(false);
    if(next==='stage'){
      labByName.current=true;setLabRequested(true);
      if(stageError){resetStage();setStageError('');lastStageFrame.current=0;setStageAttempt(value=>value+1);}
    }else labByName.current=false;
    setMode(next);
    if(next==='panorama')void startPlayback();
  }
  function openFullLab(){
    chooseMode('stage');setTelemetryOpen(false);setExpanded(true);
    // Keep the same iframe/video; use a full-window overlay if fullscreen is unavailable.
    shell.current?.requestFullscreen?.().catch(()=>{});
  }
  function closeFullLab(){
    setExpanded(false);
    if(document.fullscreenElement===shell.current)void document.exitFullscreen().catch(()=>{});
    expandButton.current?.focus();
  }
  useEffect(()=>{
    if(!expanded)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    closeButton.current?.focus();
    let enteredFullscreen=false;
    const fullscreen=()=>{
      if(document.fullscreenElement===shell.current)enteredFullscreen=true;
      else if(enteredFullscreen){setExpanded(false);expandButton.current?.focus();}
    };
    fullscreen();
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')closeFullLab();};
    document.addEventListener('fullscreenchange',fullscreen);window.addEventListener('keydown',escape);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('fullscreenchange',fullscreen);window.removeEventListener('keydown',escape);};
  },[expanded]);
  useEffect(()=>{
    const media=video.current;if(!media)return;
    const initialize=()=>{media.currentTime=targetTime.current;};
    if(media.readyState>=1)initialize();
    // Fast cached loads and failures can precede React attaching media handlers.
    if(media.error)mediaErrored(media);
    else if(media.readyState>=2)setReady(true);
    media.addEventListener('loadedmetadata',initialize);
    return()=>media.removeEventListener('loadedmetadata',initialize);
  },[]);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==iframe.current?.contentWindow)return;
      // Readiness is acknowledged after actual renders, including after iframe loads/HMR.
      if(event.data?.type==='tpl-stage-frame'&&Number.isFinite(event.data.time)){
        const media=video.current;
        if(media&&!media.error&&media.readyState>=2&&Math.abs(media.currentTime-event.data.time)<1){
          const now=performance.now();
          lastStageFrame.current=now;
          // Safari can deliver one frame before shader compilation stalls the
          // next render. During playback, keep the live panorama until three
          // steady frames arrive. A paused clip only needs its completed still.
          if(!stageReadyRef.current&&!media.paused){
            const previous=stageWarmup.current;
            const frames=previous.last&&now-previous.last<=1000?previous.frames+1:1;
            stageWarmup.current={frames,last:now};
            if(frames<3)return;
          }
          stageReadyRef.current=true;setStageReady(true);setStageError('');setLabSlow(false);
          // The Lab's own download no longer shares the link with the footage.
          adaptive.current?.linkFreed();
          releaseExtras();
          if(modeRef.current==='stage'){setCurrent(event.data.time);props.onTimeChange(event.data.time);}
        }
      }
      if(event.data?.type==='tpl-stage-error')unavailableStage();
      if(event.data?.type==='tpl-stage-interaction')setAuto(false);
    };
    window.addEventListener('message',receive);
    return()=>window.removeEventListener('message',receive);
  },[]);
  useEffect(()=>{
    if(!labRequested)return;
    let started=performance.now(),lastCheck=started;
    if(stageReadyRef.current)lastStageFrame.current=started;
    const check=()=>{
      if(document.hidden){started=performance.now();lastStageFrame.current=started;return;}
      iframe.current?.contentWindow?.postMessage({type:'tpl-stage-probe',active:modeRef.current==='stage'},location.origin);
      if(modeRef.current!=='stage')return;
      const now=performance.now(),media=video.current;
      // Footage waiting on the network gives the Lab nothing new to draw; that is not a Lab fault.
      // Nor is a long task on this thread, which the Lab shares (a vehicle model being parsed).
      if((media&&(media.seeking||media.readyState<3))||now-lastCheck>1000)lastStageFrame.current=now;
      lastCheck=now;
      if(!stageReadyRef.current){
        const waited=now-started;
        if(waited>STAGE_REQUESTED_TIMEOUT_MS)unavailableStage('Lab 360 is taking longer to load. Showing panoramic footage.');
        else if(waited>STAGE_STARTUP_TIMEOUT_MS)setLabSlow(true);
      }
      else if(lastStageFrame.current&&now-lastStageFrame.current>1500)unavailableStage('Lab 360 stopped updating. Showing panoramic footage.');
    };
    check();const timer=window.setInterval(check,500);
    return()=>window.clearInterval(timer);
  },[stageAttempt,mode,labRequested]);
  useEffect(()=>{
    if(!labRequested)return;
    const timer=window.setTimeout(releaseExtras,EXTRAS_WAIT_MS);
    return()=>window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[labRequested]);
  useEffect(()=>{
    if(!auto||!playing||!stageReady)return;
    const timer=window.setInterval(()=>setMode(previous=>previous==='panorama'?'stage':'panorama'),AUTO_SWITCH_SECONDS*1000);
    return()=>window.clearInterval(timer);
  },[auto,playing,stageReady]);
  useEffect(()=>{
    // "Open in Lab" links arrive on this anchor.
    if(location.hash==='#plate-viewer')labByName.current=true;
    // Footage plays as soon as the player is on screen, and only while it is.
    const automatic=!prefersNoAutoplay();
    const resume=()=>{if(automatic&&inView.current&&!document.hidden&&!userPaused.current)void startPlayback(true);};
    const visibility=()=>{if(document.hidden)pause();else resume();};
    document.addEventListener('visibilitychange',visibility);
    const observer=new IntersectionObserver(entries=>{
      inView.current=entries[0].isIntersecting;
      if(!inView.current)pause();else{hoverPaused.current=false;resume();}
    },{threshold:0.25});
    if(shell.current)observer.observe(shell.current);
    return()=>{document.removeEventListener('visibilitychange',visibility);observer.disconnect();};
  },[]);
  const labLoading=mode==='stage'&&labRequested&&!stageReady&&!error;
  const hint=error?'Playback is paused.':stageError||(mode==='stage'&&!stageReady?(labSlow?'Lab 360 is still loading on this connection. Panoramic footage keeps playing.':labRequested?'Showing panoramic preview while Lab 360 loads.':'Panoramic preview first. Lab 360 follows once footage is flowing.'):auto?`Views alternate every ${AUTO_SWITCH_SECONDS} seconds`:'Choose a view · playback and location stay in sync');
  return <div id="plate-viewer" className={styles.compositeViewer}>
    <div className={styles.viewerBar}>
      <div className={styles.modeSwitch} role="group" aria-label="Preview view">
        <button aria-pressed={mode==='stage'} aria-busy={labLoading||undefined} className={mode==='stage'?styles.active:''} onClick={()=>chooseMode('stage')}><span aria-hidden="true">◉</span> Lab 360</button>
        <button aria-pressed={mode==='panorama'} className={mode==='panorama'?styles.active:''} onClick={()=>chooseMode('panorama')}><span aria-hidden="true">▭</span> Panoramic view</button>
      </div>
      <div className={styles.viewerActions}>{mode==='panorama'&&<button className={`${styles.autoSwitch} ${fullFrame?styles.autoSwitchOn:''}`} aria-pressed={fullFrame} onClick={()=>setFullFrame(value=>!value)}>Show full frame</button>}<button className={`${styles.autoSwitch} ${auto?styles.autoSwitchOn:''}`} aria-pressed={auto} onClick={()=>setAuto(value=>!value)}>Auto-switch <span>{AUTO_SWITCH_SECONDS}s</span></button><button ref={expandButton} className={styles.fullLabButton} onClick={openFullLab}><span aria-hidden="true">⛶</span> Full Lab</button></div>
    </div>
    <div className={`${styles.player} ${expanded?styles.expandedPlayer:''}`} ref={shell} data-preview-mode={mode} data-full-frame={mode==='panorama'&&fullFrame} data-stage-ready={stageReady} data-lab-requested={labRequested} data-visible-view={showStage?'stage':'panorama'}>
      {expanded&&<div className={styles.expandedBar}><strong>Lab 360</strong><button ref={closeButton} onClick={closeFullLab}>Exit Full Lab <span aria-hidden="true">×</span></button></div>}
      <div className={styles.previewRow}>
      <div className={`${styles.previewFrame} stitch-surface`} data-stitch-status={stitchStatus(props.stitchStatus)} onPointerEnter={event=>{if(event.pointerType==='mouse'&&!hoverPaused.current)void startPlayback();}} onPointerLeave={()=>{hoverPaused.current=false;}}>
        {!showStage&&<StitchStatus status={props.stitchStatus} overlay/>}
        <div className={`${styles.panoramaLayer} ${!showStage?styles.layerActive:''}`} aria-hidden={showStage} inert={showStage}>
          <div className={styles.crop}>
            <video id={videoId} ref={video} src={sources.adaptive?undefined:playbackURL} data-shared-source={playbackURL} muted playsInline loop preload="auto" style={{opacity:ready?1:0}} onLoadedData={()=>{setReady(true);checkSettled();}} onSeeked={()=>setReady(true)} onProgress={checkSettled} onTimeUpdate={event=>{checkSettled();if(modeRef.current==='stage'&&stageReadyRef.current)return;const time=event.currentTarget.currentTime;setCurrent(time);props.onTimeChange(time);}} onPlaying={()=>{setPlaying(true);setReady(true);setError('');}} onWaiting={()=>setPlaying(false)} onPlay={()=>{playIntent.current=true;userPaused.current=false;setWanted(true);}} onPause={()=>{if(!systemPause.current)userPaused.current=true;systemPause.current=false;setPlaying(false);setWanted(false);playIntent.current=false;checkSettled();}} onError={event=>mediaErrored(event.currentTarget)} onClick={()=>void startPlayback()}/>
            {!ready&&<img className={styles.playerPoster} src={props.posterURL} alt="Selected panoramic poster" fetchPriority="high" decoding="async"/>}
            {!wanted&&<button className={styles.bigPlay} onClick={()=>void startPlayback()} aria-label="Play composite"><PlayIcon/></button>}
          </div>
        </div>
        {labRequested&&<iframe key={stageAttempt} ref={iframe} onError={()=>unavailableStage()} className={`${styles.stageLayer} ${showStage?styles.layerActive:''}`} aria-hidden={!showStage} inert={!showStage} tabIndex={showStage?0:-1} title="Lab 360 — stabilized composite" src={stageURL} allow="autoplay; fullscreen" loading="eager"/>}
        {labLoading&&<div className={styles.stageLoading} aria-busy="true"><span>Loading Lab 360 · panoramic preview available</span></div>}
        {wanted&&!playing&&<div className={styles.buffering} role="status"><span>{ready?'Buffering…':'Loading footage…'}</span></div>}
      </div>
      </div>
      {expanded&&props.fullLabTelemetry&&<div className={styles.fullLabTelemetry}>
        {telemetryOpen&&<div id={`lab-telemetry-${props.id}`} className={styles.fullLabTelemetryPopup} role="region" aria-label="Full Lab map and IMU">{props.fullLabTelemetry}</div>}
        <button type="button" className={styles.telemetryToggle} aria-expanded={telemetryOpen} aria-controls={telemetryOpen?`lab-telemetry-${props.id}`:undefined} onClick={()=>setTelemetryOpen(open=>!open)}>map/imu</button>
      </div>}
      <div className={styles.transport}><button disabled={!ready} onClick={()=>{pause(true);seek(Math.max(0,(secondsToFrame(video.current?.currentTime||0,props.fps)-1)/props.fps));}} aria-label="Step back one frame">−1 frame</button><button onClick={()=>wanted?pause(true):void startPlayback()} aria-label={wanted?'Pause composite':'Play composite'}>{wanted?<PauseIcon/>:<PlayIcon/>}</button><button disabled={!ready} onClick={()=>{pause(true);seek(Math.min(props.duration-1/props.fps,(secondsToFrame(video.current?.currentTime||0,props.fps)+1)/props.fps));}} aria-label="Step forward one frame">+1 frame</button><span>{formatFrameTimecode(secondsToFrame(current,props.fps),props.fps)}</span><input aria-label="Clip timeline" type="range" min="0" max={props.duration-1/props.fps} step={1/props.fps} value={current} onChange={event=>seek(Number(event.target.value))}/><span className={styles.dim}>{formatFrameTimecode(secondsToFrame(props.duration,props.fps),props.fps)}</span><button onClick={()=>expanded?closeFullLab():shell.current?.requestFullscreen?.().catch(()=>{})} aria-label={expanded?'Exit Full Lab':'Full screen'}>⛶</button></div>
      <CompositeSelection id={props.id} sku={props.sku} fps={props.fps} duration={props.duration} sourceTimecode={props.sourceTimecode} media={video} seek={seek} pause={()=>pause(true)} ready={ready&&!error}/>
      {error&&<p role="alert" className={styles.playbackError}>{error}</p>}
    </div>
    <p className={styles.previewHint} role="status">{hint}</p>
  </div>;
});
