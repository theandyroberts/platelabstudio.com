'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
export function OrderHeaderLink(){
  const pathname=usePathname();
  const [count,setCount]=useState(0);
  useEffect(()=>{
    let active=true,revision=0;
    async function refresh(){
      const current=++revision;
      try{
        const response=await fetch('/api/order',{cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json();
        if(active&&current===revision)setCount(data.count);
      }catch{/* Keep the last confirmed count when offline. */}
    }
    void refresh();
    window.addEventListener('platelab-order-updated',refresh);
    window.addEventListener('focus',refresh);
    return()=>{active=false;window.removeEventListener('platelab-order-updated',refresh);window.removeEventListener('focus',refresh);};
  },[pathname]);
  return count>0?<Link href="/order" className="site-order-link" aria-live="polite">Order details ({count})</Link>:null;
}
