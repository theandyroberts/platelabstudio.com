'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {OrderItem} from '@/lib/order';
import {money,estimateTotal} from '@/lib/checkout/format';
import {OrderPlates} from './OrderPlates';
import styles from './Checkout.module.css';
export function OrderDetails({initialItems}:{initialItems:OrderItem[]}){
 const router=useRouter();const [items,setItems]=useState(initialItems),[pending,setPending]=useState<string|null>(null),[error,setError]=useState('');
 async function remove(item:OrderItem){setPending(item.id);setError('');try{const response=await fetch('/api/order',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({sceneClipId:item.id,inOrder:false,expectedVersion:item.version})});const result=await response.json();if(!response.ok)throw Error(result.error||'This plate could not be removed.');setItems(current=>current.filter(row=>row.id!==item.id));window.dispatchEvent(new Event('platelab-order-updated'));router.refresh();}catch(reason){setError(reason instanceof Error?reason.message:'Please retry.');}finally{setPending(null);}}
 return <>{error&&<p role="alert" className={styles.error}>{error} <Link href="/order">Reload order</Link></p>}{!items.length?<section className={styles.panel}><h2>Your next scene starts here.</h2><p>Your order is empty. Choose plates for a scene, or add them to your order from the Lab.</p><Link className={styles.primary} href="/browse">Find plates →</Link></section>:<div className={styles.layout}><section className={styles.panel}><div className={styles.split}><h2>{items.length} {items.length===1?'plate':'plates'} selected</h2><Link href="/projects">Manage scenes →</Link></div><OrderPlates items={items} remove={remove} pending={pending}/></section><aside className={`${styles.panel} ${styles.aside}`}><p className={styles.eyebrow}>Order estimate · USD</p><p className={styles.price}>{money(estimateTotal(items))}</p><p className={styles.muted}>Based on your selected footage and source ranges. Stage customization, taxes and final pricing are confirmed after review.</p><hr className={styles.rule}/><p className={styles.muted}>Next: contact information, stage setup and license review.</p><Link className={`${styles.primary} ${styles.full}`} href="/order/checkout">Continue to checkout →</Link><p className={styles.muted}>No payment is collected at checkout.</p></aside></div>}</>;
}
