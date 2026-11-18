import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {readOrder} from '@/lib/order';
import {CheckoutForm} from '@/components/CheckoutForm';
import styles from '@/components/Checkout.module.css';
export const dynamic='force-dynamic';
export default async function CheckoutPage(){const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect('/login?next=%2Forder%2Fcheckout');const {items}=await readOrder(db);if(!items.length)redirect('/order');return <main className={styles.root}><nav className={styles.crumb} aria-label="Order steps"><Link href="/order">1 · Order details</Link><strong>2 · Checkout</strong><span>3 · Confirmation</span></nav><h1 className={styles.heading}>Built for your stage.</h1><p className={styles.intro}>Tell us where these plates are going. We’ll confirm the scope, price and license before payment or production begins.</p><CheckoutForm items={items} email={user.email??''} name={user.user_metadata?.full_name??''}/></main>;}
