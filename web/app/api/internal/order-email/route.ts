import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {retryPendingOrderEmails} from '@/lib/checkout/email';
export const dynamic='force-dynamic';
export async function POST(request:Request){const expected=process.env.ORDER_EMAIL_JOB_SECRET,provided=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!expected||!provided||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return NextResponse.json({error:'Unauthorized'},{status:401});return NextResponse.json({checked:await retryPendingOrderEmails()});}
