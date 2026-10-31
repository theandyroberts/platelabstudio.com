import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=spawnSync(process.execPath,['viewer/node_modules/vite/bin/vite.js','build','--config','team-review/vite.config.mjs'],{cwd:root,stdio:'inherit'});
if(build.status!==0)process.exit(build.status??1);
const dest=path.join(root,'team-review/dist');
await fs.cp(path.join(root,'web/public/stage'),path.join(dest,'stage'),{recursive:true});
// Only explicitly selected review clips are included in the public collection.
const ids=JSON.parse(await fs.readFile(path.join(root,'team-review/clips.json'),'utf8'));
const catalog=[];
for(const id of ids){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))throw new Error('Invalid review clip ID');
  const relative=`media/composite/${id}`;
  await fs.cp(path.join(root,'web/public',relative),path.join(dest,relative),{recursive:true});
  const record=path.join(dest,relative,'clip.json'),clip=JSON.parse(await fs.readFile(record,'utf8'));
  for(const field of ['baseURL','videoURL','posterURL','motionURL'])clip[field]='/composite-review'+clip[field];
  clip.overrides={};
  clip.enrichment.passes=clip.enrichment.passes.map(({name,model,effort,usage,createdAt})=>({name,model,effort,usage,createdAt}));
  clip.publication={...clip.publication,state:'team-review-copy'};
  const serialized=JSON.stringify(clip,null,2)+'\n';
  if(serialized.includes('/Users/')||serialized.includes('OPENAI_API_KEY'))throw new Error('Private local details found in public record');
  await fs.writeFile(record,serialized);
  const {title,posterURL,tags=[],media}=clip;
  catalog.push({id,title,posterURL,tags,media:{duration:media.duration,fps:media.fps}});
  try{await fs.access(path.join(dest,relative,'label-editorial.json'));catalog.at(-1).labelEditorialURL=`/composite-review/${relative}/label-editorial.json`;}catch(e){if(e.code!=='ENOENT')throw e;}
}
await fs.writeFile(path.join(dest,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(`Built public review bundle with ${catalog.length} tagged clips and email feedback.`);
