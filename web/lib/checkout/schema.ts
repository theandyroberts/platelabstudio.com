import { z } from 'zod';
import { LICENSE_VERSION } from './license';
const text = (max=160) => z.string().trim().min(1,'Required').max(max);
const optional = (max=500) => z.string().trim().max(max).default('');
export const stageSchema = z.object({
  projectId:z.string().uuid().optional(), clipIds:z.array(z.string().uuid()).optional(), certifiedStageId:z.string().uuid().optional(), certifiedAt:z.string().optional(), mode:z.enum(['facility','dimensions','certified','later']), company:optional(160), name:optional(160),
  shape:z.enum(['curved','flat']), units:z.enum(['ft','m']), width:z.number().positive().max(1000).nullable(), height:z.number().positive().max(1000).nullable(),
  arc:z.number().min(1).max(360).nullable(), upper:z.enum(['led-ceiling','front-projection','rear-projection','none','confirm']),
  upperNotes:optional(800), notes:optional(2000),
}).superRefine((s,ctx)=>{
  if(s.mode==='certified'&&!s.certifiedStageId)ctx.addIssue({code:'custom',path:['certifiedStageId'],message:'Choose a certified stage.'});
  if(s.mode==='facility')for(const key of ['company','name'] as const)if(!s[key])ctx.addIssue({code:'custom',path:[key],message:'Enter the facility company and stage name.'});
  if(s.mode==='dimensions')for(const key of ['width','height'] as const)if(s[key]===null)ctx.addIssue({code:'custom',path:[key],message:'Enter both screen dimensions.'});
  if(s.mode==='dimensions'&&s.shape==='curved'&&s.arc===null)ctx.addIssue({code:'custom',path:['arc'],message:'Enter the wall wrap angle.'});
});
export const contactSchema=z.object({name:text(),company:text(),email:z.string().trim().email().max(254),phone:optional(60),address1:text(200),address2:optional(200),city:text(),region:optional(100),postalCode:optional(40),country:text(100)});
export const checkoutSchema=z.object({
  submissionKey:z.string().uuid(),
  items:z.array(z.object({id:z.string().uuid(),version:z.number().int().positive(),estimateUsd:z.number().nonnegative().nullable()})).min(1).max(100),
  contact:contactSchema,
  stages:z.array(stageSchema).min(1).max(100),
  delivery:z.object({purpose:text(300),neededBy:optional(10).refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v), 'Enter a valid date.'),format:optional(120),color:optional(120),notes:optional(2000)}),
  licenseVersion:z.literal(LICENSE_VERSION), acknowledgment:z.literal(true),
}).superRefine((v,ctx)=>{
  if(new Set(v.items.map(i=>i.id)).size!==v.items.length)ctx.addIssue({code:'custom',path:['items'],message:'Duplicate order items.'});
  const assigned=v.stages.flatMap(s=>s.clipIds??[]);
  if(v.stages.some(s=>!s.clipIds?.length)||assigned.length!==v.items.length||new Set(assigned).size!==assigned.length||assigned.some(id=>!v.items.some(i=>i.id===id)))ctx.addIssue({code:'custom',path:['stages'],message:'Assign every clip to exactly one stage, or choose stage information later.'});
});
export type CheckoutInput=z.infer<typeof checkoutSchema>;
export type StageBrief=z.infer<typeof stageSchema>;
export type CheckoutDetails=Pick<CheckoutInput,'contact'|'stages'|'delivery'|'acknowledgment'>;
export function describeStage(stage:StageBrief){return stage.mode==='later'?'Stage information to follow':stage.mode==='facility'||stage.mode==='certified'?`${stage.company} / ${stage.name}`:`${stage.shape==='curved'?'Diameter':'Width'} ${stage.width} × height ${stage.height} ${stage.units}${stage.shape==='curved'?` · ${stage.arc}° wrap`:''}`;}
export const UPPER_LABELS:Record<StageBrief['upper'],string>={'led-ceiling':'LED ceiling','front-projection':'Front projection above','rear-projection':'Rear projection above',none:'No upper / ceiling display',confirm:'Confirm with stage operator'};

export const DEFERRED_STAGE_WARNING='Stage information will be provided later. This may delay delivery: we need the target stage and confirmed output specifications before we can prepare these clips.';
export function stageItems(stage:StageBrief,items:import('../order').OrderItem[]){return items.filter(i=>stage.clipIds?stage.clipIds.includes(i.id):i.projectId===stage.projectId);}
export function stageAssignmentLabel(stage:StageBrief,items:import('../order').OrderItem[]){return stageItems(stage,items).map(i=>`${i.sku} (${i.projectName} / ${i.sceneName})`).join(', ');}
