export type CodeChannel = "email" | "sms";
export type LoginCodeState = {
  step: "send" | "verify";
  channel: CodeChannel;
  destination: string;
  error?: string;
  message?: string;
};

export const initialLoginCodeState: LoginCodeState = {
  step: "send", channel: "email", destination: "",
};

export function normalizeCodeDestination(channel: CodeChannel, value: string): string | null {
  if (channel === "email") {
    const email = value.trim().toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }
  const phone = value.trim().replace(/[\s().-]/g, "");
  // Require an explicit country code rather than guessing the visitor's country.
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function normalizeLoginCode(value: string): string | null {
  const code = value.trim();
  return /^\d{6}$/.test(code) ? code : null;
}

export function codeChannelEnabled(channel: string, environment: Record<string, string | undefined>): boolean {
  return channel === "email" ? environment.AUTH_EMAIL_CODE_ENABLED === "true"
    : channel === "sms" && environment.AUTH_SMS_CODE_ENABLED === "true";
}
