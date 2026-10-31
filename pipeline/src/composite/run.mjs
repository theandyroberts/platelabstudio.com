import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
const args=process.argv.slice(2);
for(const phase of ['prepare','enrich','localize','publish']) {
  console.log(`\nComposite ingest: ${phase}`);
  const status=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,phase,...args],{stdio:'inherit'});
    child.on('error',reject);
    child.on('exit',(code,signal)=>resolve(signal?1:code??1));
  });
  if(status!==0){console.error(`Stopped during ${phase}. Rerun the same command to reuse completed work and resume pending analysis.`);process.exit(status);}
}
