import {PDFDocument, rgb, type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {LICENSE_TITLE,LICENSE_NOTICE,LICENSE_VERSION,LICENSE_SECTIONS,FULFILLMENT_STEPS} from './license';
import type {SubmittedOrder} from './types';
import {money,rangeLabel} from './format';
import {describeStage,UPPER_LABELS} from './schema';
async function document(title:string,subtitle:string){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);pdf.setTitle(title);pdf.setAuthor('Plate Lab Studio');
 const fontPath=path.join(process.cwd(),process.cwd().endsWith('/web')?'lib/checkout/fonts/NotoSans-Regular.ttf':'web/lib/checkout/fonts/NotoSans-Regular.ttf');
 const font=await pdf.embedFont(await readFile(fontPath),{subset:true});
 let page:PDFPage,y=0;
 function newPage(){page=pdf.addPage([612,792]);page.drawText('PLATE LAB',{x:44,y:747,size:18,font,color:rgb(.12,.16,.12)});page.drawLine({start:{x:44,y:730},end:{x:568,y:730},thickness:2,color:rgb(.74,.32,.14)});y=706;}
 newPage();
 function paragraph(text:string,size=10,color=rgb(.18,.21,.17),space=9){
  const max=524;const lines:string[]=[];
  for(const section of text.split('\n')){let line='';for(const word of section.split(/\s+/)){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)<=max)line=next;else{if(line)lines.push(line);line='';for(const char of word){if(font.widthOfTextAtSize(line+char,size)>max){lines.push(line);line='';}line+=char;}}}lines.push(line);}
  for(const line of lines){if(y<64)newPage();page.drawText(line,{x:44,y,size,font,color});y-=size*1.5;}y-=space;
 }
 function heading(text:string){if(y<115)newPage();paragraph(text,13,rgb(.39,.23,.14),5);}
 paragraph(title,23);paragraph(subtitle,10,rgb(.43,.46,.40),18);
 async function save(){pdf.getPages().forEach((p,i)=>{p.drawLine({start:{x:44,y:45},end:{x:568,y:45},thickness:.5,color:rgb(.75,.77,.71)});p.drawText(`Plate Lab Studio | ${i+1} / ${pdf.getPageCount()}`,{x:44,y:28,size:8,font,color:rgb(.45,.48,.42)});});return pdf.save();}
 return {paragraph,heading,save};
}
export async function licensePdf(){const doc=await document(LICENSE_TITLE,`${LICENSE_VERSION} | Prepared for discussion with counsel`);doc.paragraph(LICENSE_NOTICE,11);for(const s of LICENSE_SECTIONS){doc.heading(s.title);doc.paragraph(s.text);}doc.heading('Research and drafting note');doc.paragraph('Original proposed terms informed by the licensing structures published by Pond5 (https://www.pond5.com/legal/license) and Getty Images (https://www.gettyimages.co.uk/eula), reviewed November 18, 2026. Neither provider endorses this draft. Commercial choices remain proposals for Plate Lab and its lawyers.');return doc.save();}
export async function invoicePdf(order:SubmittedOrder){
 const doc=await document('Preliminary invoice',`${order.reference} | ${new Date(order.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})}`);
 doc.paragraph('PRO FORMA — PRICING SUBJECT TO CONFIRMATION',11);doc.paragraph('Not a final tax invoice or payment request. No payment has been collected. Final scope, licensing, seller legal identity, taxes and payment terms will be confirmed before work starts.');
 const c=order.details.contact;doc.heading('Prepared for');doc.paragraph([c.company,c.name,c.address1,c.address2,`${c.city}${c.region?`, ${c.region}`:''} ${c.postalCode}`,c.country,c.email,c.phone].filter(Boolean).join('\n'));
 doc.heading('Selected footage');for(const item of order.items){doc.paragraph(`${item.sku} | ${money(item.estimateUsd)}`,11);doc.paragraph(`${item.title}\n${item.projectName} / ${item.sceneName}\n${rangeLabel(item)}`,10);}
 doc.heading(`Estimated footage subtotal: ${money(order.estimate_usd)} USD`);doc.paragraph('Stage customization and applicable taxes: to be confirmed. Amount payable now: none. Final pricing may change after scope and availability review.');
 doc.heading('Stage customization');for(const stage of order.details.stages){const project=order.items.find(i=>i.projectId===stage.projectId);doc.paragraph(`${project?.projectName??'Project'}\n${describeStage(stage)}\nUpper display: ${UPPER_LABELS[stage.upper]}${stage.upperNotes?` — ${stage.upperNotes}`:''}${stage.notes?`\n${stage.notes}`:''}`);}
 const d=order.details.delivery;doc.heading('Production & delivery brief');doc.paragraph([`Intended use: ${d.purpose}`,`Requested delivery: ${d.neededBy||'To be confirmed'}`,`Format: ${d.format||'To be confirmed'}`,`Color: ${d.color||'To be confirmed'}`,d.notes].filter(Boolean).join('\n'));
 doc.heading('What happens next');for(const s of FULFILLMENT_STEPS.slice(1))doc.paragraph(`${s.title}: ${s.text}`);
 doc.heading('License status');doc.paragraph(`${order.license_version}. Discussion draft only, not an executed license. Submission records acknowledgment of the review process; approved terms must be accepted before production use.`);
 return doc.save();
}
