import fs from 'node:fs/promises';
import path from 'node:path';
import {json,writeJSON} from './core.mjs';
export const BILLING_RECHECK_MS=15*60*1000;
export async function billingHoldActive(root,{fetchImpl=fetch,now=Date.now()}={}){
 const file=path.join(root,'queue-hold.json');let hold;
 try{hold=await json(file);}catch(e){if(e.code==='ENOENT')return false;throw e;}
 if(hold.reason!=='api_billing'||now<Date.parse(hold.nextCheckAt??hold.at)+(!hold.nextCheckAt?BILLING_RECHECK_MS:0))return true;
 // Store cooldown before network I/O, so process restarts do not create a polling loop.
 const next={...hold,lastCheckAt:new Date(now).toISOString(),nextCheckAt:new Date(now+BILLING_RECHECK_MS).toISOString()};
 await writeJSON(file,next);
 try{
  if(!process.env.OPENAI_API_KEY)return true;
  const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_COMPOSITE_MODEL||'gpt-6-astra',reasoning:{effort:'low'},input:'Reply OK.',max_output_tokens:16,store:false}),signal:AbortSignal.timeout(60000)});
  const body=await response.json();
  if(response.ok&&['completed','incomplete'].includes(body.status)&&!body.error){
   await fs.rename(file,path.join(root,`queue-hold-resolved-${now}.json`));
   console.log('API billing check succeeded; resuming queued clip labeling.');return false;
  }
  await writeJSON(file,{...next,lastCheckError:body.error?.code??`HTTP ${response.status}`});
 }catch(error){await writeJSON(file,{...next,lastCheckError:error.name??'network_error'});}
 return true;
}
