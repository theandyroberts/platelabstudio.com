import 'server-only';
import nodemailer from 'nodemailer';
import {createAdminClient} from '@/lib/supabase/admin';
import {invoicePdf} from './pdf';
import {orderEmailContent} from './emailContent';
import type {SubmittedOrder} from './types';
export async function sendOrderEmail(id:string){
 const db=createAdminClient();const {data:claimed,error:claimError}=await db.rpc('claim_order_email',{target_order:id});if(claimError||!claimed)return;
 try{
 const {data,error}=await db.from('plate_orders').select('*').eq('id',id).single();if(error||!data)throw Error('Order unavailable');
 const order=data as unknown as SubmittedOrder;
 const {ORDER_SMTP_HOST:host,ORDER_SMTP_PORT:port,ORDER_SMTP_USER:user,ORDER_SMTP_PASS:pass,ORDER_EMAIL_FROM:from,NEXT_PUBLIC_SITE_URL:siteUrl}=process.env;
 if(!host||!port||!user||!pass||!from||!siteUrl)throw Error('Email configuration unavailable');
 const url=new URL(siteUrl);if(url.protocol!=='https:')throw Error('Email needs a public HTTPS site');
 const transport=nodemailer.createTransport({host,port:Number(port),secure:Number(port)===465,requireTLS:Number(port)!==465,auth:{user,pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
 const content=orderEmailContent(order,url.origin);
 const sent=await transport.sendMail({from:{name:'Plate Lab Studio',address:from},to:order.recipient_email,...content,messageId:`<order-${order.id}@platelabstudio.com>`,attachments:[{filename:`${order.reference}-preliminary-invoice.pdf`,content:Buffer.from(await invoicePdf(order)),contentType:'application/pdf'}]});
 if(!sent.accepted?.length)throw Error('Email not accepted');
 const {error:updateError}=await db.from('plate_orders').update({email_status:'sent',email_sent_at:new Date().toISOString()}).eq('id',id);if(updateError)throw Error('Unable to record email status');
 }catch{await db.from('plate_orders').update({email_status:'failed'}).eq('id',id);console.error('Order confirmation delivery deferred; saved order remains available.');}
}
export async function retryPendingOrderEmails(){const db=createAdminClient();const {data,error}=await db.from('plate_orders').select('id').neq('email_status','sent').lt('email_attempts',10).order('created_at').limit(50);if(error)throw Error('Unable to read email queue');for(const row of data??[])await sendOrderEmail(row.id);return data?.length??0;}
