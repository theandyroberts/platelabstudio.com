import {getSubmittedOrder} from '@/lib/checkout/server';
import {invoicePdf} from '@/lib/checkout/pdf';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{orderId:string}>}){const {orderId}=await params;const order=await getSubmittedOrder(orderId);if(!order)return new Response('Order not found',{status:404});return new Response(Buffer.from(await invoicePdf(order)),{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="${order.reference}-preliminary-invoice.pdf"`,'cache-control':'private, no-store'}});}
