import {NextResponse,after} from 'next/server';
import {getSubmittedOrder,sameOrigin} from '@/lib/checkout/server';
import {sendOrderEmail} from '@/lib/checkout/email';
export async function POST(request:Request,{params}:{params:Promise<{orderId:string}>}){if(!sameOrigin(request))return NextResponse.json({error:'Cross-origin request denied.'},{status:403});const {orderId}=await params;const order=await getSubmittedOrder(orderId);if(!order)return NextResponse.json({error:'Order not found.'},{status:404});if(order.email_status==='sent')return NextResponse.json({status:'sent'});after(()=>sendOrderEmail(order.id));return NextResponse.json({status:'pending'});}
