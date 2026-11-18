import { z } from 'zod';
import { LICENSE_VERSION } from './license';
const text = (max=160) => z.string().trim().min(1,'Required').max(max);
const optional = (max=500) => z.string().trim().max(max).default('');
export const stageSchema = z.object({
  projectId:z.string().uuid(), mode:z.enum(['facility','dimensions']), company:optional(160), name:optional(160),
  shape:z.enum(['curved','flat']), units:z.enum(['ft','m']), width:z.number().positive().max(1000).nullable(), height:z.number().positive().max(1000).nullable(),
  arc:z.number().min(1).max(360).nullable(), upper:z.enum(['led-ceiling','front-projection','rear-projection','none','confirm']),
  upperNotes:optional(800), notes:optional(2000),
}).superRefine((s,ctx)=>{
  if(s.mode==='facility')for(const key of ['company','name'] as const)if(!s[key])ctx.addIssue({code:'custom',path:[key],message:'Enter the facility company and stage name.'});
  if(s.mode==='dimensions')for(const key of ['width','height'] as const)if(s[key]===null)ctx.addIssue({code:'custom',path:[key],message:'Enter both screen dimensions.'});
  if(s.mode==='dimensions'&&s.shape==='curved'&&s.arc===null)ctx.addIssue({code:'custom',path:['arc'],message:'Enter the wall wrap angle.'});
});
export const checkoutSchema=z.object({
  submissionKey:z.string().uuid(),
  items:z.array(z.object({id:z.string().uuid(),version:z.number().int().positive(),estimateUsd:z.number().nonnegative().nullable()})).min(1).max(100),
  contact:z.object({name:text(),company:text(),email:z.string().trim().email().max(254),phone:optional(60),address1:text(200),address2:optional(200),city:text(),region:optional(100),postalCode:optional(40),country:text(100)}),
  stages:z.array(stageSchema).min(1).max(100),
  delivery:z.object({purpose:text(300),neededBy:optional(10).refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v), 'Enter a valid date.'),format:optional(120),color:optional(120),notes:optional(2000)}),
  licenseVersion:z.literal(LICENSE_VERSION), acknowledgment:z.literal(true),
}).superRefine((v,ctx)=>{
  if(new Set(v.items.map(i=>i.id)).size!==v.items.length)ctx.addIssue({code:'custom',path:['items'],message:'Duplicate order items.'});
  if(new Set(v.stages.map(i=>i.projectId)).size!==v.stages.length)ctx.addIssue({code:'custom',path:['stages'],message:'Duplicate stage briefs.'});
});
export type CheckoutInput=z.infer<typeof checkoutSchema>;
export type StageBrief=z.infer<typeof stageSchema>;
export type CheckoutDetails=Pick<CheckoutInput,'contact'|'stages'|'delivery'|'acknowledgment'>;
export function describeStage(stage:StageBrief){return stage.mode==='facility'?`${stage.company} / ${stage.name}`:`${stage.shape==='curved'?'Diameter':'Width'} ${stage.width} × height ${stage.height} ${stage.units}${stage.shape==='curved'?` · ${stage.arc}° wrap`:''}`;}
export const UPPER_LABELS:Record<StageBrief['upper'],string>={'led-ceiling':'LED ceiling','front-projection':'Front projection above','rear-projection':'Rear projection above',none:'No upper / ceiling display',confirm:'Confirm with stage operator'};
