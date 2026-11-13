import assert from 'node:assert/strict';
import test from 'node:test';
import { projectOverview, type ProjectOverviewData } from '../lib/projectOverview';
import { parseOrderAddition, parseOrderUpdate } from '../lib/orderActions';
const scenes = ['First scene', 'Second scene'].map((name,i) => ({id:`s${i}`,name,projectId:'p',projectName:'Film',brief:'Other text'}));
const base: ProjectOverviewData = {projects:[{id:'p',name:'Film'}],scenes,scenePreviews:[]};
const preview = (sceneId:string,chosen:boolean,inOrder:boolean) => ({id:sceneId,sceneId,sku:'PL-123',title:'Drive',poster:'/poster.jpg',studioHref:'/stage',stitchStatus:'rough' as const,chosen,inOrder});
test('project and scene rows open searched scene detail preserving the ordered first scene',()=>{
  const [project]=projectOverview(base);
  assert.equal(project.href,'/browse?scene=s0&q=First+scene&details=1');
  assert.equal(project.scenes[1].href,'/browse?scene=s1&q=Second+scene&details=1');
  assert.equal(projectOverview({...base,scenes:[]})[0].href,'/projects/p');
});
test('completion requires every scene chosen, independent of order membership',()=>{
  assert.equal(projectOverview({...base,scenes:[]})[0].complete,false);
  assert.equal(projectOverview({...base,scenePreviews:[preview('s0',true,true),preview('s1',false,true)]})[0].complete,false);
  const [project]=projectOverview({...base,scenePreviews:[preview('s0',true,false),preview('s1',true,true)]});
  assert.equal(project.complete,true);assert.equal(project.chosenCount,2);assert.equal(project.scenes[0].chosen?.inOrder,false);
});
test('order mutations require valid identifiers, boolean membership, and an integer version',()=>{
  const id='12345678-1234-4234-8234-123456789012';
  assert.deepEqual(parseOrderAddition({projectId:id,sceneId:id}),{projectId:id,sceneId:id});
  assert.deepEqual(parseOrderUpdate({sceneClipId:id,inOrder:false,expectedVersion:3}),{sceneClipId:id,inOrder:false,expectedVersion:3});
  for(const value of [null,{}, {projectId:'wrong'}, {projectId:id,sceneId:7}])assert.equal(parseOrderAddition(value),null);
  for(const value of [{sceneClipId:id,inOrder:'false',expectedVersion:1},{sceneClipId:id,inOrder:true,expectedVersion:0},{sceneClipId:id,inOrder:true,expectedVersion:1.5}])assert.equal(parseOrderUpdate(value),null);
});
