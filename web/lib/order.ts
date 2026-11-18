import { publicMediaUrl } from './publicMediaUrl';
import type { Database } from '@platelab/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderItem = {
  id: string; version: number; status: string;
  sku: string; title: string;
  poster:string; stitchStatus:string; inFrame:number|null; outFrame:number|null; fps:number|null; durationSeconds:number|null; estimateUsd:number|null;
  projectId: string; projectName: string; sceneId: string; sceneName: string;
};

/** Order membership is independent of the scene choice; all reads retain session RLS. */
export async function readOrder(supabase: SupabaseClient<Database>) {
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) return {authenticated:false, items:[] as OrderItem[]};
  const {data:scenes,error:sceneError} = await supabase.from('scenes')
    .select('id, project_id, name, projects!inner(name, status)')
    .is('archived_at',null).eq('projects.status','active');
  if (sceneError) throw new Error('Your order could not be loaded. Please retry.');
  if (!scenes?.length) return {authenticated:true,items:[] as OrderItem[]};
  const {data:clips,error} = await supabase.from('scene_clips')
    .select('id, scene_id, status, version, in_frame, out_frame, stock_clips(sku, source_metadata)')
    .in('scene_id',scenes.map(scene=>scene.id)).eq('in_order',true).order('created_at');
  if (error) throw new Error('Your order could not be loaded. Please retry.');
  const items:OrderItem[] = (clips??[]).map(clip=>{
    const scene=scenes.find(scene=>scene.id===clip.scene_id)!;
    const project=Array.isArray(scene.projects)?scene.projects[0]:scene.projects;
    const stock=Array.isArray(clip.stock_clips)?clip.stock_clips[0]:clip.stock_clips;
    const metadata=stock?.source_metadata as {title?:unknown;renditions?:{poster?:string};stitchStatus?:string;media?:{fps?:number;durationSec?:number};pricing?:{totalUsd?:number;perMinuteUsd?:number;minimumMinutes?:number}}|null;
    const fps=metadata?.media?.fps??null,inFrame=clip.in_frame??null,outFrame=clip.out_frame??null;
    const durationSeconds=inFrame!==null&&outFrame!==null&&fps? (outFrame-inFrame+1)/fps:metadata?.media?.durationSec??null;
    const pricing=metadata?.pricing;
    const estimateUsd=inFrame!==null&&durationSeconds&&pricing?.perMinuteUsd&&pricing.minimumMinutes?Math.round(pricing.perMinuteUsd*Math.max(pricing.minimumMinutes,durationSeconds/60)):pricing?.totalUsd??null;
    return {poster:metadata?.renditions?.poster?publicMediaUrl(metadata.renditions.poster):'',stitchStatus:metadata?.stitchStatus??'rough',inFrame,outFrame,fps,durationSeconds,estimateUsd,id:clip.id,version:clip.version,status:clip.status,sku:stock?.sku??'Unavailable plate',
      title:typeof metadata?.title==='string'?metadata.title:'Plate details unavailable',
      sceneId:scene.id,sceneName:scene.name,projectId:scene.project_id,projectName:project?.name??'Project'};
  });
  return {authenticated:true,items};
}
