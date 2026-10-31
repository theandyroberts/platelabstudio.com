import {notFound} from 'next/navigation';
import {loadComposite} from '@/lib/compositeReview';
import {CompositeDetail} from '@/components/CompositeDetail';
export const dynamic='force-dynamic';
export default async function CompositeReview({params}:{params:Promise<{id:string}>}) {
  if(process.env.PLATELAB_COMPOSITE_REVIEW!=='1')notFound();
  const {id}=await params;
  let clip;try{clip=await loadComposite(id);}catch{notFound();}
  return <CompositeDetail clip={clip}/>;
}
