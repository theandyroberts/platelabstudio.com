import {NextRequest,NextResponse} from 'next/server';
export async function POST(request:NextRequest){
  if(request.headers.get('origin')!==`${request.nextUrl.protocol}//${request.headers.get('host')}`)return NextResponse.json({error:'Please submit from the review page.'},{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'JSON required.'},{status:415});
  const reader=request.body?.getReader();
  if(!reader)return NextResponse.json({error:'Feedback is required.'},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();return NextResponse.json({error:'Feedback is too long.'},{status:413});}chunks.push(value);}
  try{
    const response=await fetch('https://theplatelab.studio/composite-review/api/feedback',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://theplatelab.studio'},body:Buffer.concat(chunks),signal:AbortSignal.timeout(20000)});
    const body=await response.json().catch(()=>({error:'Email sending could not be confirmed. Please retry.'}));
    return NextResponse.json(body,{status:response.status,headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Email sending could not be confirmed. Please retry or email andy@note15.com.'},{status:502});}
}
