import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {compositePaths,loadComposite} from '@/lib/compositeReview';
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  if(process.env.PLATELAB_COMPOSITE_REVIEW!=='1')return NextResponse.json({error:'Unavailable'},{status:404});
  // Next development can normalize nextUrl to localhost even when accessed at 127.0.0.1.
  const origin=request.headers.get('origin');
  let sameLocalOrigin=false;
  try{const url=new URL(origin??'');sameLocalOrigin=['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.protocol==='http:'&&url.host===request.headers.get('host');}catch{}
  if(!sameLocalOrigin)return NextResponse.json({error:'Invalid origin'},{status:403});
  try {
    const {id}=await params,clip=await loadComposite(id),data=await request.json();
    const allowed=['posterTime','hoverStart','notes','labelDecisions','title'];
    if(Object.keys(data).some(k=>!allowed.includes(k)))throw new Error('Unknown editorial field');
    for(const k of ['posterTime','hoverStart'])if(k in data&&(!Number.isFinite(data[k])||data[k]<0||data[k]>=clip.media.duration))throw new Error('Invalid timestamp');
    if('posterTime'in data&&!clip.frames.some((f:any)=>f.t===data.posterTime))throw new Error('Choose an inspected poster frame');
    if('notes'in data&&(typeof data.notes!=='string'||data.notes.length>10000))throw new Error('Invalid notes');
    if('title'in data&&(typeof data.title!=='string'||data.title.trim().length<3||data.title.length>180))throw new Error('Invalid title');
    if('labelDecisions'in data){if(!data.labelDecisions||Array.isArray(data.labelDecisions)||typeof data.labelDecisions!=='object')throw new Error('Invalid decisions');for(const [key,value]of Object.entries(data.labelDecisions)){if(!clip.labels.some((l:any)=>l.id===key)||!['accepted','dismissed','pending'].includes(String(value)))throw new Error('Invalid label decision');}}
    const overrides={...clip.overrides,...data,...('labelDecisions'in data?{labelDecisions:{...clip.overrides.labelDecisions,...data.labelDecisions}}:{}),updatedAt:new Date().toISOString()},dest=path.join(compositePaths(id).work,'overrides.json'),temp=`${dest}.${randomUUID()}.tmp`;
    await fs.writeFile(temp,JSON.stringify(overrides,null,2)+'\n');await fs.rename(temp,dest);
    return NextResponse.json({overrides});
  }catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
