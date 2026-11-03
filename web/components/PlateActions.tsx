'use client';
import Link from 'next/link';
import {useEffect,useId,useRef,useState} from 'react';
import type {SearchScene} from '../lib/sceneSearch';
import {addPlateToScene,PlateActionError,type PlateAction} from '../lib/plateActions';
import styles from './PlateActions.module.css';

type Library={authenticated:boolean;scenes:SearchScene[]};
export function PlateActions({sku,resumeAction=true}:{sku:string;resumeAction?:boolean}){
  const headingId=useId();
  const [revision,setRevision]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const [action,setAction]=useState<PlateAction|null>(null),[library,setLibrary]=useState<Library|null>(null);
  const [sceneId,setSceneId]=useState(''),[loading,setLoading]=useState(false),[pending,setPending]=useState(false);
  const [error,setError]=useState(''),[success,setSuccess]=useState<{action:PlateAction;scene:SearchScene}|null>(null);
  const [returnPath,setReturnPath]=useState('');
  const actionName=action==='order'?'Add to Order':'Add to Project';
  function open(next:PlateAction){setAction(next);setSuccess(null);setError('');}
  useEffect(()=>{
    if(!resumeAction)return;
    const params=new URLSearchParams(window.location.search),intent=params.get('action');
    if(intent==='order'||intent==='project')open(intent);
  },[resumeAction]);
  useEffect(()=>{
    if(!action){dialog.current?.close();return;}
    dialog.current?.showModal();
    const url=new URL(window.location.href);url.searchParams.set('action',action);url.hash='';
    setReturnPath(url.pathname+url.search);
    const controller=new AbortController();setLoading(true);setLibrary(null);setError('');
    fetch('/api/scene-library',{cache:'no-store',signal:controller.signal}).then(async response=>{
      const body=await response.json();if(!response.ok)throw Error(body.error||'Your scenes could not be loaded.');
      if(controller.signal.aborted)return;
      setLibrary(body);
      let preferred=url.searchParams.get('scene')||new URLSearchParams(url.searchParams.get('from')?.split('?')[1]).get('scene');
      try{preferred=preferred||sessionStorage.getItem('platelab-search-scene');}catch{}
      setSceneId(body.scenes.some((scene:SearchScene)=>scene.id===preferred)?preferred||'':'');
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{controller.abort();document.body.style.overflow=previous;};
  },[action,revision]);
  function close(){
    if(pending)return;
    setAction(null);
    const url=new URL(window.location.href);url.searchParams.delete('action');
    window.history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  async function submit(){
    if(!action||!sceneId||pending)return;
    const scene=library?.scenes.find(item=>item.id===sceneId);if(!scene)return;
    setPending(true);setError('');
    try{
      await addPlateToScene(sceneId,sku,action);
      window.dispatchEvent(new Event('platelab-order-updated'));
      try{sessionStorage.setItem('platelab-search-scene',sceneId);}catch{}
      setSuccess({action,scene});setAction(null);
      const url=new URL(window.location.href);url.searchParams.delete('action');window.history.replaceState(null,'',url.pathname+url.search+url.hash);
    }catch(reason){
      if(reason instanceof PlateActionError&&reason.status===401)setLibrary({authenticated:false,scenes:[]});
      setError(reason instanceof Error?reason.message:'The plate could not be added.');
    }finally{setPending(false);}
  }
  return <div className={styles.root}>
    <div className={styles.actions}>
      <button className="primary-button" onClick={()=>open('order')} aria-haspopup="dialog">Add to Order</button>
      <button className="secondary-button" onClick={()=>open('project')} aria-haspopup="dialog">Add to Project</button>
    </div>
    {success&&<p className={styles.feedback} role="status">{success.action==='order'?'Added to order':'Saved to project'} · {success.scene.projectName} / {success.scene.name}.{' '}<Link href={`/projects/${success.scene.projectId}/scenes/${success.scene.id}/clips${success.action==='order'?'?tab=order':''}`}>{success.action==='order'?'View order':'View scene'}</Link></p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={headingId} onCancel={event=>{event.preventDefault();close();}} onClose={()=>{if(!pending)setAction(null);}} onClick={event=>{if(event.target===dialog.current)close();}}>
      <div className={styles.content}>
        <header><h2 id={headingId}>{actionName}</h2><button autoFocus aria-label="Close plate actions" disabled={pending} onClick={close}>×</button></header>
        <p className={styles.sku}>{sku}</p>
        {loading?<p role="status">Loading your scenes…</p>:library?.authenticated?<>
          {library.scenes.length?<><p>Choose the project and scene for this plate.</p><label className={styles.selector}>Project / scene<select value={sceneId} onChange={e=>setSceneId(e.target.value)} disabled={pending}><option value="">Choose a scene</option>{library.scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.projectName} / {scene.name}</option>)}</select></label><button className="primary-button" disabled={!sceneId||pending} onClick={submit}>{pending?'Adding…':actionName}</button></>:<p>Create a project and its first scene to add this plate.</p>}
          <Link className={styles.newProject} href={`/projects/new?plateReturn=${encodeURIComponent(returnPath)}`}>Create a project &amp; scene</Link>
        </>:library&&!error?<><p>Log in to choose a project and scene for this plate.</p><Link className="primary-button" href={`/login?next=${encodeURIComponent(returnPath)}`}>Log in to continue</Link></>:null}
        {error&&<p className={styles.error} role="alert">{error}</p>}
        {!loading&&!library&&<button className="secondary-button" onClick={()=>setRevision(value=>value+1)}>Retry loading scenes</button>}
        {!loading&&library&&!library.authenticated&&!!error&&<Link className="primary-button" href={`/login?next=${encodeURIComponent(returnPath)}`}>Log in to continue</Link>}
      </div>
    </dialog>
  </div>;
}
