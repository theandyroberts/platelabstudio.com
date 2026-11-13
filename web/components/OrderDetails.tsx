'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {OrderItem} from '@/lib/order';
import styles from './OrderDetails.module.css';
export function OrderDetails({initialItems}:{initialItems:OrderItem[]}){
  const [items,setItems]=useState(initialItems),[pending,setPending]=useState<string|null>(null),[error,setError]=useState('');
  async function remove(item:OrderItem){
    setPending(item.id);setError('');
    try{
      const response=await fetch('/api/order',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({sceneClipId:item.id,inOrder:false,expectedVersion:item.version})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'This plate could not be removed.');
      setItems(current=>current.filter(row=>row.id!==item.id));
      window.dispatchEvent(new Event('platelab-order-updated'));
    }catch(reason){setError(reason instanceof Error?reason.message:'Please retry.');}finally{setPending(null);}
  }
  const scenes=Array.from(new Set(items.map(item=>item.sceneId)));
  return <div className={styles.root}>
    <p className={styles.count}>{items.length} {items.length===1?'plate':'plates'} in your order</p>
    {error&&<p role="alert" className="auth-alert">{error}</p>}
    {!items.length&&<p>Your order is empty. <Link href="/browse">Find plates →</Link></p>}
    {scenes.map(sceneId=>{const rows=items.filter(item=>item.sceneId===sceneId),scene=rows[0];return <section className={styles.scene} key={sceneId}>
      <header><h2>{scene.projectName} / {scene.sceneName}</h2><Link href={`/projects/${scene.projectId}/scenes/${sceneId}/clips?tab=order`}>Scene details →</Link></header>
      <ul>{rows.map(item=><li key={item.id}><Link className={styles.plate} href={`/plate/${item.sku}?from=%2Forder`}><span className="mono accent">{item.sku}</span><strong>{item.title}</strong></Link><button className="secondary-button" disabled={!!pending} onClick={()=>remove(item)}>{pending===item.id?'Removing…':'Remove from order'}</button></li>)}</ul>
    </section>;})}
  </div>;
}
