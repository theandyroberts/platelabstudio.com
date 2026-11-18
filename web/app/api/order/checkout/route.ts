import {NextResponse,after} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {readOrder} from '@/lib/order';
import {readCertifiedStages,resolveCertifiedStages} from '@/lib/checkout/certifiedStages';
import {checkoutSchema} from '@/lib/checkout/schema';
import {sameOrigin} from '@/lib/checkout/server';
import {sendOrderEmail} from '@/lib/checkout/email';
import type {Json} from '@platelab/shared';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:'Cross-origin submission denied.'},{status:403});
 try{
 const raw=await request.text();if(raw.length>100000)return NextResponse.json({error:'Order is too large.'},{status:413});
 let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid order.'},{status:400});}
 const parsed=checkoutSchema.safeParse(body);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message,fields:parsed.error.flatten()},{status:400});
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user?.email)return NextResponse.json({error:'Sign in again before submitting.'},{status:401});
 const input=parsed.data,admin=createAdminClient();
 const {data:prior,error:priorError}=await admin.from('plate_orders').select('id').eq('user_id',user.id).eq('submission_key',input.submissionKey).maybeSingle();
 if(priorError)throw Error('Unable to check prior submission');
 if(prior){after(()=>sendOrderEmail(prior.id));return NextResponse.json({id:prior.id});}
 const {items}=await readOrder(db);
 if(items.length!==input.items.length||items.some(item=>!input.items.some(expected=>expected.id===item.id&&expected.version===item.version&&expected.estimateUsd===item.estimateUsd)))return NextResponse.json({error:'Your order or estimate changed. Return to order details and review it again.'},{status:409});
 const {contact,delivery,acknowledgment}=input;
 let stages;try{stages=resolveCertifiedStages(input.stages,input.stages.some(s=>s.mode==='certified')?await readCertifiedStages(db):[]);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Please review stage selections.'},{status:409});}
 const {data:id,error}=await admin.rpc('submit_plate_order',{actor:user.id,request_key:input.submissionKey,order_details:{contact,stages,delivery,acknowledgment} as Json,order_items:items as unknown as Json,recipient:user.email});
 if(error)return NextResponse.json({error:error.code==='40001'?'Your order changed. Return to order details and review it again.':'Your order could not be saved. Please retry.'},{status:error.code==='40001'?409:503});
 after(()=>sendOrderEmail(id));return NextResponse.json({id},{status:201});
 }catch{return NextResponse.json({error:'Your order could not be submitted. Your selections are safe; please retry.'},{status:503});}
}
