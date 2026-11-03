import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {readOrder} from '@/lib/order';
import {OrderDetails} from '@/components/OrderDetails';
export const dynamic='force-dynamic';
export default async function OrderPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login?next=%2Forder');
  let order;
  try{order=await readOrder(supabase);}catch{
    return <main className="workspace-shell"><h1>Order details</h1><p className="auth-alert" role="alert">Your order could not be loaded.</p><Link href="/order">Retry loading order</Link></main>;
  }
  return <main className="workspace-shell"><div className="scene-nav"><Link className="mono dim back-link" href="/browse">← Search plates</Link></div><section className="scene-heading"><h1>Order details</h1></section><OrderDetails initialItems={order.items}/></main>;
}
