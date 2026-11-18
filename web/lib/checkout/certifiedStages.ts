import type {Database} from '@platelab/shared';
import type {SupabaseClient} from '@supabase/supabase-js';
import {stageSchema,type StageBrief} from './schema';
export type CertifiedStage={id:string;name:string;location:string|null;confirmedAt:string;spec:StageBrief};
export function confirmedStage(row:{id:string;name:string;location:string|null;active:boolean;certified_at:string|null;checkout_spec:unknown}):CertifiedStage|null{
 if(!row.active||!row.certified_at||!row.checkout_spec||typeof row.checkout_spec!=='object')return null;
 const parsed=stageSchema.safeParse({...row.checkout_spec,name:row.name,mode:'dimensions'});
 if(!parsed.success||!parsed.data.company||parsed.data.upper==='confirm')return null;
 return {id:row.id,name:row.name,location:row.location,confirmedAt:row.certified_at,spec:{...parsed.data,mode:'certified',certifiedStageId:row.id,certifiedAt:row.certified_at}};
}
export async function readCertifiedStages(db:SupabaseClient<Database>){
 const {data,error}=await db.from('stage_profiles').select('id,name,location,active,certified_at,checkout_spec').eq('active',true).not('certified_at','is',null).order('name');
 if(error)throw Error('Certified stages are temporarily unavailable. Enter the stage manually or provide details later.');
 return (data??[]).map(confirmedStage).filter((s):s is CertifiedStage=>s!==null);
}
export function resolveCertifiedStages(stages:StageBrief[],catalog:CertifiedStage[]){return stages.map(stage=>{
 if(stage.mode!=='certified'){const {certifiedStageId,certifiedAt,...manual}=stage;return manual;}
 const verified=catalog.find(c=>c.id===stage.certifiedStageId);if(!verified)throw Error('A selected certified stage is no longer available. Please choose another stage.');
 return {...verified.spec,clipIds:stage.clipIds,notes:stage.notes};
});}
