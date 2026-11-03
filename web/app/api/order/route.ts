import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {readOrder} from '@/lib/order';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const result=await readOrder(await createClient());
    return NextResponse.json({...result,count:result.items.length},{headers:{'cache-control':'private, no-store'}});
  }catch{
    return NextResponse.json({error:'Your order could not be loaded. Please retry.'},{status:503,headers:{'cache-control':'private, no-store'}});
  }
}
