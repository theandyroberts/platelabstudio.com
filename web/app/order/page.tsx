import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {readOrder} from '@/lib/order';
import {OrderDetails} from '@/components/OrderDetails';
import {money} from '@/lib/checkout/format';
import styles from '@/components/Checkout.module.css';
export const dynamic='force-dynamic';
export default async function OrderPage(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect('/login?next=%2Forder');
 let order;try{order=await readOrder(db);}catch{return <main className={styles.root}><h1>Order details</h1><p role="alert">Your order could not be loaded. <Link href="/order">Retry</Link></p></main>;}
 const {data:history,error}=await db.from('plate_orders').select('id,reference,created_at,estimate_usd').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30);
 return <main className={styles.root}><nav className={styles.crumb} aria-label="Order steps"><strong>1 · Order details</strong><span>2 · Checkout</span><span>3 · Confirmation</span></nav><h1 className={styles.heading}>Your order</h1><p className={styles.intro}>Review your plates and selected ranges. Every delivery is prepared for the stage where it will be used.</p><OrderDetails initialItems={order.items}/>{error&&<p role="alert">Submitted orders could not be loaded. <Link href="/order">Retry</Link></p>}{!!history?.length&&<section><h2 className={styles.subheading}>Submitted orders</h2><div className={styles.history}>{history.map(row=><Link key={row.id} href={`/order/${row.id}`}><strong>{row.reference}</strong><span>{new Date(row.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})} · {money(row.estimate_usd)}</span><span>View →</span></Link>)}</div></section>}</main>;
}
