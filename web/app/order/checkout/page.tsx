import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {readOrder} from '@/lib/order';
import {readCertifiedStages,type CertifiedStage} from '@/lib/checkout/certifiedStages';
import {CheckoutForm} from '@/components/CheckoutForm';
import styles from '@/components/Checkout.module.css';
export const dynamic='force-dynamic';
export default async function CheckoutPage(){const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect('/login?next=%2Forder%2Fcheckout');const {items}=await readOrder(db);if(!items.length)redirect('/order');let certifiedStages:CertifiedStage[];let stageError='';try{certifiedStages=await readCertifiedStages(db);}catch(e){certifiedStages=[];stageError=e instanceof Error?e.message:'Certified stages unavailable.';}return <main className={styles.root}><CheckoutForm items={items} certifiedStages={certifiedStages} stageError={stageError} email={user.email??''} name={user.user_metadata?.full_name??''}/></main>;}
