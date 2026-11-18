import 'server-only';
import {createClient} from '@/lib/supabase/server';
import type {SubmittedOrder} from './types';
export async function getSubmittedOrder(id:string){
 if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))return null;
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return null;
 const {data,error}=await db.from('plate_orders').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();
 if(error)throw Error('Order unavailable. Please retry.');return data as unknown as SubmittedOrder|null;
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin)return false;try{return new URL(origin).host===(request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()||request.headers.get('host')||new URL(request.url).host);}catch{return false;}}
