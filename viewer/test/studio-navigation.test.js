import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneDestination, studioNavigationItems } from '../src/studio-navigation.js'
const scenes = [{ id: 's1', projectId: 'p1', name: 'Bridge' }, { id: 's2', projectId: 'p2', name: 'Night drive' }, { id: 's3', projectId: 'p2', name: 'Empty scene' }]
const projects = [{id:'p1',name:'Film one'},{id:'p2',name:'Film two'},{id:'p3',name:'Empty project'}]
const scenePreviews = [{id:'c1',sceneId:'s1',sku:'PL-1',studioHref:'/stage?scene=s1&version=3&inFrame=24&outFrame=72'}, {id:'c2',sceneId:'s1',sku:'PL-2',studioHref:'/stage?scene=s1&clip=c2'}, {id:'c3',sceneId:'s2',sku:'PL-1',studioHref:'/stage?scene=s2&clip=c3'}, {id:'c4',sceneId:'s2',chosen:true,studioHref:'/stage?scene=s2&clip=c4'}]
test('scene destinations prefer chosen plate and preserve complete saved selection URLs',()=>{
 assert.equal(sceneDestination(scenes[0],scenePreviews),scenePreviews[0].studioHref)
 assert.equal(sceneDestination(scenes[1],scenePreviews),scenePreviews[3].studioHref)
 assert.equal(sceneDestination(scenes[2],scenePreviews),'/browse?scene=s3&q=Empty+scene&details=1')
})
test('menus exclude current project and scene, group other scenes and scope thumbnails',()=>{
 const result=studioNavigationItems({projects,scenes,scenePreviews},{projectId:'p1',sceneId:'s1',sceneClipId:'c2',sku:'PL-2'})
 assert.deepEqual(result.projects.map(p=>p.id),['p2','p3'])
 assert.equal(result.projects[0].href,scenePreviews[3].studioHref)
 assert.equal(result.projects[1].href,'/projects/p3')
 assert.deepEqual(result.sceneGroups.map(p=>p.scenes.map(s=>s.id)),[['s2','s3']])
 assert.deepEqual(result.clips.map(c=>[c.id,c.current]),[['c1',false],['c2',true]])
})
test('empty libraries and inactive projects cannot supply navigation',()=>{
 assert.deepEqual(studioNavigationItems({},{}),{projects:[],sceneGroups:[],clips:[]})
 const result=studioNavigationItems({projects:[],scenes,scenePreviews:[]},{})
 assert.deepEqual(result.sceneGroups,[])
})
