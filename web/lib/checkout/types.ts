import type {CheckoutDetails} from './schema';
import type {OrderItem} from '../order';
export type SubmittedOrder={id:string;reference:string;created_at:string;user_id:string;recipient_email:string;status:'submitted';details:CheckoutDetails;items:OrderItem[];estimate_usd:number|null;license_version:string;email_status:'pending'|'sending'|'sent'|'failed';email_sent_at:string|null;email_attempts:number;email_attempted_at:string|null;};
