"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProjectSceneGrid } from '@/app/projects/actions';
import { CURRENT_VEHICLE_KEY, SceneVehicleSelect } from './SceneVehicleSelect';
import { sceneClipCounts, type SceneClipStatus } from '@/lib/sceneClipCounts';
import { sceneDetailsHref } from '@/lib/sceneSearch';
import { moveSceneRow, type GridSceneInput } from '@/lib/projectSceneGrid';
import { parseSceneVehicle, type SceneVehicle } from '@/lib/sceneConfiguration';
import { plateActionReturnPath } from '@/lib/plateActions';

type Scene = { id: string; name: string; script_pages: string | null; vehicle: string; scene_clips: { status: SceneClipStatus }[] };
type Row = GridSceneInput & { editing: boolean; touched: boolean; count: number; chosen: boolean };
const blank = (key: string, vehicle: SceneVehicle): Row => ({key,id:null,name:'',vehicle,pages:'',editing:true,touched:false,count:0,chosen:false});
const hasContent = (row: Row) => !!row.id || !!row.name.trim() || !!row.pages.trim() || row.touched;
export function SceneGrid({ projectId: initialId = null, projectName = '', version: initialVersion, scenes = [], saveSku, organizationName, displayName, plateReturn }: {
  projectId?: string | null; projectName?: string; version?: number; scenes?: Scene[]; saveSku?: string;
  organizationName?: string; displayName?: string; plateReturn?: string;
}) {
  const router = useRouter();
  const [projectId,setProjectId] = useState(initialId);
  const [version,setVersion] = useState(initialVersion);
  const [name,setName] = useState(projectName);
  const [vehicle,setVehicle] = useState<SceneVehicle>('sports_car');
  const sequence = useRef(1);
  const [rows,setRows] = useState<Row[]>(() => [...scenes.map(scene => {
    const counts=sceneClipCounts(scene.scene_clips);
    return {key:scene.id,id:scene.id,name:scene.name,vehicle:parseSceneVehicle(scene.vehicle),pages:scene.script_pages||'',editing:false,touched:false,count:counts.considering+counts.selected,chosen:counts.selected>0};
  }),blank('new-0','sports_car')]);
  const [dirty,setDirty] = useState(false), [pending,setPending] = useState(false);
  const [error,setError] = useState(''), [message,setMessage] = useState('');
  const saving=useRef(false);
  useEffect(() => {
    try {
      const current=localStorage.getItem(CURRENT_VEHICLE_KEY);
      const model: Record<string,SceneVehicle>={ferrari:'sports_car',bmwM5:'sedan',escalade:'suv'};
      const selected=current ? model[current]||parseSceneVehicle(current) : 'sports_car';
      setVehicle(selected); setRows(currentRows=>currentRows.map(row=>!hasContent(row)?{...row,vehicle:selected}:row));
    } catch { /* Default matches the Lab. */ }
  },[]);
  useEffect(() => {
    if (!dirty) return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn); return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  function change(key:string, patch:Partial<Row>) {
    setRows(current=>current.map(row=>row.key===key?{...row,...patch}:row));
    setDirty(true); setMessage('');
  }
  function move(index:number,direction:-1|1) {
    setRows(current=>moveSceneRow(current,index,direction)); setDirty(true);setMessage('');
  }
  async function save(detailsKey?:string) {
    if(saving.current)return;
    const existingTarget=detailsKey?rows.find(row=>row.key===detailsKey):undefined;
    if(!dirty && existingTarget?.id){router.push(sceneDetailsHref({id:existingTarget.id,name:existingTarget.name},saveSku));return;}
    saving.current=true;setPending(true);setError('');setMessage('');
    try {
      const filled=rows.filter(hasContent);
      const result=await saveProjectSceneGrid({projectId,name,version,organizationName,displayName,rows:filled.map(({key,id,name,vehicle,pages})=>({key,id,name,vehicle,pages}))});
      if(!result.ok){setError(result.error);return;}
      const ids=new Map(result.rows.map(row=>[row.key,row.id]));
      const updated=filled.map(row=>({...row,id:ids.get(row.key)!,editing:false,touched:false}));
      setProjectId(result.projectId);setVersion(result.version);setDirty(false);
      setRows([...updated,blank(`new-${sequence.current++}`,vehicle)]);setMessage('Saved');
      const target=detailsKey?updated.find(row=>row.key===detailsKey):undefined;
      if(target?.id){router.push(sceneDetailsHref({id:target.id,name:target.name},saveSku));return;}
      const returnPath=plateActionReturnPath(plateReturn);
      if(!projectId && returnPath && updated[0]) {
        const url=new URL(returnPath,window.location.origin);url.searchParams.set('scene',updated[0].id!);router.push(url.pathname+url.search);return;
      }
      if(!projectId) router.replace(`/projects/${result.projectId}${saveSku?`?save=${encodeURIComponent(saveSku)}`:''}`);
      else router.refresh();
    } catch {setError('The project could not be saved. Your edits are still here; please retry.');}
    finally {saving.current=false;setPending(false);}
  }
  const filledCount=rows.filter(hasContent).length;
  return <form className="workspace-form project-scene-editor" onSubmit={event=>{
    event.preventDefault(); const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
    void save(submitter?.value?.startsWith('details:')?submitter.value.slice(8):undefined);
  }}>
    <div className="project-name-save">
      <label><span>Project name *</span><input name="projectName" required maxLength={200} value={name} placeholder="Brand or production name" disabled={pending} onChange={event=>{setName(event.target.value);setDirty(true);setMessage('');}} /></label>
      <button type="submit" className="primary-button" disabled={pending}>{pending?'Saving…':'Save'}</button>
    </div>
    {error&&<p className="auth-alert error" role="alert">{error}</p>}
    <div className="grid-save-status" role="status">{message || (dirty?'Unsaved changes':'')}<span>* Required · Page # optional</span></div>
    <div className="scene-table-wrap"><table className="scene-table scene-editor-table">
      <thead><tr><th><span className="sr-only">Reorder</span></th><th>Scene name *</th><th>Vehicle *</th><th>Page # <span className="dim">optional</span></th><th># Clips</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{rows.map((row,index)=>{
        const populated=hasContent(row); const locked=!!row.id&&!row.editing;
        return <tr key={row.key} data-draft={!row.id}>
          <td className="scene-elevator">{populated&&<div><button type="button" disabled={pending||index===0} aria-label={`Move ${row.name||'new scene'} up`} onClick={()=>move(index,-1)}>↑</button><button type="button" disabled={pending||index>=filledCount-1} aria-label={`Move ${row.name||'new scene'} down`} onClick={()=>move(index,1)}>↓</button></div>}</td>
          <td><input aria-label={`Scene name ${index+1} *`} name={`sceneName-${row.key}`} required={populated} maxLength={200} value={row.name} readOnly={locked} disabled={pending} placeholder="Add a scene…" onChange={event=>change(row.key,{name:event.target.value})} /></td>
          <td><SceneVehicleSelect value={row.vehicle} disabled={pending||locked} onChange={selected=>{setVehicle(selected);change(row.key,{vehicle:selected,touched:true});}} /></td>
          <td><input aria-label={`Page number ${index+1} (optional)`} name={`pages-${row.key}`} maxLength={80} value={row.pages} readOnly={locked} disabled={pending} placeholder="—" onChange={event=>change(row.key,{pages:event.target.value})} /></td>
          <td className="scene-grid-count">{populated&&<>{row.count}{row.chosen&&<span className="scene-chosen-marker">✓ Chosen</span>}</>}</td>
          <td className="scene-row-actions">{populated&&<div>
            {locked?<button type="button" className="secondary-button" disabled={pending} onClick={()=>setRows(current=>current.map(item=>item.key===row.key?{...item,editing:true}:item))}>Edit</button>:<button type="submit" className="primary-button" disabled={pending}>Save</button>}
            <button type="submit" name="intent" value={`details:${row.key}`} className="secondary-button" disabled={pending}>Details</button>
          </div>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <button type="button" className="secondary-button add-grid-scene" disabled={pending} onClick={()=>{
      const empty=rows.find(row=>!hasContent(row));
      if(empty){document.getElementsByName(`sceneName-${empty.key}`)[0]?.focus();return;}
      setRows(current=>[...current,blank(`new-${sequence.current++}`,vehicle)]);
    }}>+ Add scene</button>
  </form>;
}
