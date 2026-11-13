import assert from 'node:assert/strict';
import test from 'node:test';
import type {Database} from '@platelab/shared';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readOrder} from '../lib/order';
function fixture(authenticated:boolean,responses:Array<{data:unknown;error?:unknown}>){
  const calls:unknown[][]=[];
  const client={auth:{getUser:async()=>({data:{user:authenticated?{id:'user'}:null}})},from(table:string){
    calls.push(['from',table]);const response=responses.shift();assert.ok(response);
    const query={then(resolve:(v:unknown)=>unknown){return Promise.resolve(response).then(resolve);},select(...a:unknown[]){calls.push(['select',...a]);return query;},is(...a:unknown[]){calls.push(['is',...a]);return query;},eq(...a:unknown[]){calls.push(['eq',...a]);return query;},in(...a:unknown[]){calls.push(['in',...a]);return query;},order(){return query;}};return query;
  }};
  return {client:client as unknown as SupabaseClient<Database>,calls};
}
test('guests have no order and do not query private tables',async()=>{
  const {client,calls}=fixture(false,[]);assert.deepEqual(await readOrder(client),{authenticated:false,items:[]});assert.equal(calls.length,0);
});
test('order uses active accessible scenes and independent membership, retaining scene associations',async()=>{
  const {client,calls}=fixture(true,[{data:[{id:'s1',name:'Drive',project_id:'p1',projects:{name:'Demo'}}]},{data:[{id:'c1',scene_id:'s1',status:'selected',version:2,stock_clips:{sku:'PL-1630021',source_metadata:{title:'Tunnel'}}}]}]);
  const order=await readOrder(client);assert.equal(order.items.length,1);assert.equal(order.items[0].sceneName,'Drive');assert.equal(order.items[0].sku,'PL-1630021');
  assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq','in_order',true])));
  assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq','projects.status','active'])));
  assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['is','archived_at',null])));
});
test('order failures are not shown as an empty order',async()=>{
  const {client}=fixture(true,[{data:null,error:{message:'offline'}}]);await assert.rejects(readOrder(client),/could not be loaded/);
});
