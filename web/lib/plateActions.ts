import type { SavedSearchClip } from './sceneSearch';
export type PlateAction='order'|'project';
export class PlateActionError extends Error {
  constructor(message:string,public status:number){super(message);}
}

/** Uses the same authenticated, permission-checked save and status APIs as the scene workspace. */
export async function addPlateToScene(sceneId:string,sku:string,action:PlateAction,request:typeof fetch=fetch){
  async function json(url:string,init?:RequestInit){
    const response=await request(url,{cache:'no-store',...init});
    const body=await response.json();
    if(!response.ok)throw new PlateActionError(body.error||'The plate could not be added. Please retry.',response.status);
    return body;
  }
  const saved=await json('/api/scene-library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sceneId,sku})});
  if(action==='project')return;
  try{
    const library=await json(`/api/scene-library?scene=${encodeURIComponent(sceneId)}`);
    if(!library.authenticated)throw new PlateActionError('Log in to add this plate to your order.',401);
    const clip=(library.clips as SavedSearchClip[]).find(item=>item.id===saved.id);
    if(!clip)throw new PlateActionError('Refresh your scenes and try again.',409);
    // Keep existing order selections, submitted clips and saved frame ranges intact.
    if(clip.inOrder)return;
    if(clip.status==='selected'||clip.status==='submitted') {
      await json('/api/order',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({sceneClipId:clip.id,inOrder:true,expectedVersion:clip.version})});
      return;
    }
    await json(`/api/scene-clips/${encodeURIComponent(clip.id)}/status`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'selected',expectedVersion:clip.version})});
  }catch(error){
    if(error instanceof PlateActionError&&error.status===401)throw error;
    throw new PlateActionError(`The plate is saved to your project, but was not added to the order. ${error instanceof Error?error.message:'Please retry.'}`,error instanceof PlateActionError?error.status:500);
  }
}

// Only detail-page return paths are accepted by the project-creation flow.
export function plateActionReturnPath(value:unknown){
  if(typeof value!=='string'||!value.startsWith('/plate/')||value.startsWith('//'))return null;
  try{
    const url=new URL(value,'http://localhost');
    if(url.origin!=='http://localhost'||!/^\/plate\/PL-[A-Z0-9-]{1,80}$/i.test(url.pathname))return null;
    return url.pathname+url.search;
  }catch{return null;}
}
