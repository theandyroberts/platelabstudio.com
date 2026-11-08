import assert from 'node:assert/strict';
import test from 'node:test';
import { moveSceneRow, parseProjectSceneGrid } from '../lib/projectSceneGrid';
import { sceneDetailsHref } from '../lib/sceneSearch';
const row={key:'a',id:null,name:' Downtown ',vehicle:'sports_car',pages:''};
test('an empty project and optional page numbers are accepted',()=>{
  assert.deepEqual(parseProjectSceneGrid([]),[]);
  assert.deepEqual(parseProjectSceneGrid([row]),[{...row,name:'Downtown'}]);
});
test('scene names and vehicles are required and duplicate rows are rejected',()=>{
  for(const rows of [[{...row,name:''}],[{...row,vehicle:''}],[row,row],[{...row,id:'invalid'}]]) assert.throws(()=>parseProjectSceneGrid(rows));
});
test('elevator changes only the requested neighbors and respects both ends',()=>{
  const rows=['a','b','c'];assert.deepEqual(moveSceneRow(rows,1,-1),['b','a','c']);
  assert.deepEqual(moveSceneRow(rows,1,1),['a','c','b']);
  assert.equal(moveSceneRow(rows,0,-1),rows);assert.equal(moveSceneRow(rows,2,1),rows);
  assert.deepEqual(rows,['a','b','c']);
});
test('Details opens saved plates with the scene name as its search',()=>{
  const url=new URL(sceneDetailsHref({id:'scene-1',name:'Bridge drive'},'PL-1630021'),'http://localhost');
  assert.equal(url.pathname,'/browse');assert.equal(url.searchParams.get('details'),'1');
  assert.equal(url.searchParams.get('q'),'Bridge drive');assert.equal(url.searchParams.get('scene'),'scene-1');assert.equal(url.searchParams.get('save'),'PL-1630021');
});
