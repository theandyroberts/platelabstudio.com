import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {readOrder} from '@/lib/order';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const result=await readOrder(await createClient());
    return NextResponse.json({...result,count:result.items.length},{headers:{'cache-control':'private, no-store'}});
  }catch{
    return NextResponse.json({error:'Your order could not be loaded. Please retry.'},{status:503,headers:{'cache-control':'private, no-store'}});
  }
}

import { parseOrderAddition, parseOrderUpdate } from '@/lib/orderActions';

async function mutate(request: Request, action: 'add' | 'update') {
  const origin = request.headers.get('origin');
  const expectedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host') || new URL(request.url).host;
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch { /* Reject invalid origins. */ }
    if (originHost !== expectedHost) return NextResponse.json({ error: 'Cross-origin update denied.' }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const addition = action === 'add' ? parseOrderAddition(body) : null;
  const update = action === 'update' ? parseOrderUpdate(body) : null;
  if (!addition && !update) return NextResponse.json({ error: 'A valid project or order item is required.' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to update your order.' }, { status: 401 });
  const { data, error } = addition
    ? await supabase.rpc('add_chosen_clips_to_order', { target_project_id: addition.projectId, ...(addition.sceneId ? { target_scene_id: addition.sceneId } : {}) })
    : await supabase.rpc('set_scene_clip_order', { target_scene_clip_id: update!.sceneClipId, next_in_order: update!.inOrder, expected_version: update!.expectedVersion });
  if (error) {
    const conflict = ['40001', '23505', '40P01'].includes(error.code);
    return NextResponse.json({ error: conflict ? 'This scene changed. Refresh and try again.' : 'Your order could not be updated. Check your project access and retry.' }, { status: conflict ? 409 : 403 });
  }
  return NextResponse.json(addition ? { addedCount: data } : { version: data, inOrder: update!.inOrder }, { headers: { 'cache-control': 'private, no-store' } });
}
export async function POST(request: Request) { return mutate(request, 'add'); }
export async function PATCH(request: Request) { return mutate(request, 'update'); }
