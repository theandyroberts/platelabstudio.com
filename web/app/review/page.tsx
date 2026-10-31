import fs from 'node:fs/promises';
import path from 'node:path';
import {notFound} from 'next/navigation';
import {loadComposite,compositePaths} from '@/lib/compositeReview';
import {CompositeTagCatalog} from '@/components/CompositeTags';
export const dynamic='force-dynamic';
export default async function ReviewCatalog({searchParams}:{searchParams:Promise<{tag?:string}>}){
  if(process.env.PLATELAB_COMPOSITE_REVIEW!=='1')notFound();
  const dir=path.dirname(path.dirname(compositePaths('placeholder').record));
  const entries=await fs.readdir(dir,{withFileTypes:true}).catch(()=>[]);
  const clips=[];for(const entry of entries){if(!entry.isDirectory())continue;try{clips.push(await loadComposite(entry.name));}catch{}}
  const {tag=''}=await searchParams;
  return <CompositeTagCatalog clips={clips} query={tag}/>;
}
