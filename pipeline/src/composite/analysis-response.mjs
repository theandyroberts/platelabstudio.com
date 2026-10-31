import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {json,writeJSON} from './core.mjs';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const billingCodes=new Set(['credit_balance_exhausted','insufficient_quota']);
export const isBillingError=error=>billingCodes.has(error?.code);
async function optional(file){try{return await json(file);}catch(e){if(e.code!=='ENOENT')throw e;return null;}}

// Preserve completed work, resume active responses, and never resume a terminal failure forever.
export async function analysisResponse({name,request,work,fetchImpl=fetch,pollMs=15000,timeoutMs=1800000}){
  const baseRequestHash=hash(request),dest=path.join(work,`ai-${name}.json`),pending=path.join(work,`ai-${name}-pending.json`),retryFile=path.join(work,`ai-${name}-retry.json`);
  const cached=await optional(dest);
  if(cached&&(cached.baseRequestHash??cached.requestHash)===baseRequestHash)return cached;
  const savedRetry=await optional(retryFile);
  let budget=savedRetry?.baseRequestHash===baseRequestHash?savedRetry.maxOutputTokens:request.max_output_tokens;
  const headers={Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'};
  const started=Date.now();
  async function fail(body,httpStatus){
    const code=body.error?.code??(body.incomplete_details?.reason==='max_output_tokens'?'max_output_tokens':`response_${body.status??httpStatus}`);
    const message=body.error?.message??body.incomplete_details?.reason??'Provider returned no complete analysis';
    const error=Object.assign(new Error(`${name}: ${code}: ${message}`),{code});
    await writeJSON(path.join(work,'ai-provider-error.json'),{at:new Date().toISOString(),name,code,message,responseStatus:body.status,httpStatus});
    throw error;
  }
  for(;;){
    const actual={...request,max_output_tokens:budget},requestHash=hash(actual);
    const saved=await optional(pending);
    let body;
    if(saved?.requestHash===requestHash){
      const response=await fetchImpl(`https://api.openai.com/v1/responses/${saved.responseId}`,{headers,signal:AbortSignal.timeout(45000)});
      if(response.status===404){
        await writeJSON(path.join(work,`ai-${name}-expired-${Date.now()}.json`),saved);
        await fs.rm(pending,{force:true});
      }else{body=await response.json();if(!response.ok)await fail(body,response.status);}
    }
    if(!body){
      const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers,body:JSON.stringify(actual),signal:AbortSignal.timeout(120000)});
      body=await response.json();if(!response.ok)await fail(body,response.status);
      await writeJSON(pending,{baseRequestHash,requestHash,responseId:body.id,maxOutputTokens:budget,startedAt:new Date().toISOString()});
    }
    let polls=0;
    while(['queued','in_progress'].includes(body.status)){
      if(Date.now()-started>timeoutMs)throw new Error(`Background ${name} still running; retry resumes the existing request`);
      await new Promise(r=>setTimeout(r,pollMs));
      let response;
      try{response=await fetchImpl(`https://api.openai.com/v1/responses/${body.id}`,{headers,signal:AbortSignal.timeout(45000)});}catch(e){console.log(`${name}: reconnecting (${e.message})`);continue;}
      if(response.status>=500||response.status===429){
        const problem=await response.json();if(isBillingError(problem.error))await fail(problem,response.status);
        console.log(`${name}: temporary provider HTTP ${response.status}`);continue;
      }
      const next=await response.json();if(!response.ok)await fail(next,response.status);body=next;
      if(++polls%4===0)console.log(`${name}: ${body.status}`);
    }
    if(body.status!=='completed'){
      await writeJSON(path.join(work,`ai-${name}-terminal-${Date.now()}.json`),{baseRequestHash,requestHash,maxOutputTokens:budget,response:body});
      await fs.rm(pending,{force:true});
      if(body.status==='incomplete'&&body.incomplete_details?.reason==='max_output_tokens'&&budget<80000){
        budget=80000;
        await writeJSON(retryFile,{baseRequestHash,maxOutputTokens:budget,reason:'max_output_tokens'});
        console.log(`${name}: retrying truncated report with room for reasoning and complete labels`);continue;
      }
      await fail(body);
    }
    const text=body.output?.flatMap(o=>o.content??[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
    let report;
    try{report=JSON.parse(text);}catch{
      await writeJSON(path.join(work,`ai-${name}-invalid-${Date.now()}.json`),{baseRequestHash,requestHash,response:body});
      await fs.rm(pending,{force:true});
      await fail({status:'invalid_json',error:{code:'invalid_structured_output',message:'No valid structured labeling JSON returned'}});
    }
    const result={name,baseRequestHash,requestHash,responseId:body.id,model:body.model,effort:request.reasoning.effort,maxOutputTokens:budget,usage:body.usage,elapsedMs:Date.now()-started,createdAt:new Date().toISOString(),report};
    await writeJSON(dest,result);
    await fs.rm(pending,{force:true});
    return result;
  }
}
