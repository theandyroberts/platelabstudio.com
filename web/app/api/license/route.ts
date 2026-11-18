import {licensePdf} from '@/lib/checkout/pdf';
export const runtime='nodejs';
export async function GET(){return new Response(Buffer.from(await licensePdf()),{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="Plate-Lab-license-discussion-draft.pdf"','cache-control':'public, max-age=3600'}});}
