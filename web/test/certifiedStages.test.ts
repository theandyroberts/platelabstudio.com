import test from 'node:test';import assert from 'node:assert/strict';
import {confirmedStage,resolveCertifiedStages} from '../lib/checkout/certifiedStages';
import {stageAssignmentLabel,DEFERRED_STAGE_WARNING} from '../lib/checkout/schema';
import {orderEmailContent} from '../lib/checkout/emailContent';
import {fixture} from './fixtures/checkout';
const row={id:'f3fafca0-2222-4444-8888-000000000007',active:true,name:'Confirmed test stage',location:'Test location',certified_at:'2026-11-18T12:00:00Z',checkout_spec:{...fixture.details.stages[0],company:'Test stage operator'}};
test('unconfirmed presets, incomplete specifications and inactive stages cannot be offered as certified',()=>{
 assert.equal(confirmedStage({...row,certified_at:null}),null);assert.equal(confirmedStage({...row,active:false}),null);assert.equal(confirmedStage({...row,checkout_spec:{}}),null);assert.equal(confirmedStage({...row,checkout_spec:{...row.checkout_spec,upper:'confirm'}}),null);assert.ok(confirmedStage(row));
});
test('server uses certified catalog specifications instead of client-supplied dimensions',()=>{
 const certified=confirmedStage(row)!;const supplied={...certified.spec,width:999,company:'Forged',clipIds:[fixture.items[0].id]};const resolved=resolveCertifiedStages([supplied],[certified])[0];assert.equal(resolved.width,40);assert.equal(resolved.company,'Test stage operator');assert.deepEqual(resolved.clipIds,[fixture.items[0].id]);assert.throws(()=>resolveCertifiedStages([supplied],[]),/no longer available/);
});
test('saved legacy orders keep project assignments; new emails identify clips and delayed delivery',()=>{
 assert.match(stageAssignmentLabel(fixture.details.stages[0],fixture.items),/PL-1630021/);
 const order=structuredClone(fixture);order.details.stages=[{...order.details.stages[0],mode:'later',clipIds:[fixture.items[0].id]}];const email=orderEmailContent(order,'https://staging.platelabstudio.com');assert.ok(email.text.includes(DEFERRED_STAGE_WARNING));assert.match(email.text,/PL-1630021/);
});
