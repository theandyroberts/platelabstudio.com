import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import {applyLabelEditorial} from '../../shared/composite/label-editorial.mjs';
export function compositePaths(id:string) {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))throw new Error('Invalid clip id');
  const web=process.cwd().endsWith('/web')?process.cwd():path.join(process.cwd(),'web');
  return {record:path.join(web,'public/media/composite',id,'clip.json'),work:path.join(web,'../sample-data/composite',id)};
}
export async function loadComposite(id:string) {
  const {record,work}=compositePaths(id);
  const raw=JSON.parse(await fs.readFile(record,'utf8'));
  let editorial=null;try{editorial=JSON.parse(await fs.readFile(path.join(path.dirname(record),'label-editorial.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const data=applyLabelEditorial(raw,editorial);
  let overrides:Record<string,any>={};try{overrides=JSON.parse(await fs.readFile(path.join(work,'overrides.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  return {...data,overrides,title:overrides.title??data.title,posterTime:overrides.posterTime??data.posterTime,hoverStart:overrides.hoverStart??data.hoverStart};
}
