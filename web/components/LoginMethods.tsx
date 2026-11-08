"use client";

import { useActionState, useState, type ReactNode } from "react";
import { submitLoginCode } from "@/app/(auth)/codeActions";
import { initialLoginCodeState, type CodeChannel } from "@/lib/auth/loginCode";

export function LoginMethods({ children, next, emailCode, smsCode }: { children: ReactNode; next: string; emailCode: boolean; smsCode: boolean }) {
  const [method, setMethod] = useState("password");
  return <>
    {(emailCode || smsCode) && <div className="login-methods" aria-label="Sign-in method">
      <button type="button" aria-pressed={method === "password"} onClick={() => setMethod("password")}>Email &amp; password</button>
      <button type="button" aria-pressed={method === "code"} onClick={() => setMethod("code")}>One-time code</button>
    </div>}
    {method === "password" ? children : <CodeForm next={next} emailCode={emailCode} smsCode={smsCode} />}
  </>;
}

function CodeForm({ next, emailCode, smsCode }: { next: string; emailCode: boolean; smsCode: boolean }) {
  const [channel, setChannel] = useState<CodeChannel>(emailCode ? "email" : "sms");
  const [revision, setRevision] = useState(0);
  return <div>
    {emailCode && smsCode && <div className="login-code-channel" aria-label="Code delivery">
      <button type="button" aria-pressed={channel === "email"} onClick={() => { setChannel("email"); setRevision(value => value + 1); }}>Email me a code</button>
      <button type="button" aria-pressed={channel === "sms"} onClick={() => { setChannel("sms"); setRevision(value => value + 1); }}>Text me a code</button>
    </div>}
    <CodeSteps key={`${channel}-${revision}`} channel={channel} next={next} changeDestination={() => setRevision(value => value + 1)} />
  </div>;
}

function CodeSteps({ channel, next, changeDestination }: { channel: CodeChannel; next: string; changeDestination: () => void }) {
  const [state, action, pending] = useActionState(submitLoginCode, { ...initialLoginCodeState, channel });
  const verify = state.step === "verify";
  const fields = <><input type="hidden" name="channel" value={channel} /><input type="hidden" name="next" value={next} /></>;
  return <>
    <p className="auth-code-intro">Sign in or create an account with a six-digit code. No password needed.</p>
    {state.error && <p className="auth-alert error" role="alert">{state.error}</p>}
    {state.message && <p className="auth-alert success" role="status">{state.message}</p>}
    <form action={action} className="auth-form">
      {fields}
      <input type="hidden" name="operation" value={verify ? "verify" : "send"} />
      {verify ? <>
        <p className="auth-code-destination">Code sent to <strong>{state.destination}</strong></p>
        <input type="hidden" name="destination" value={state.destination} />
        <label><span className="mono">Six-digit code</span><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></label>
      </> : <label>
        <span className="mono">{channel === "email" ? "Email address" : "Mobile number"}</span>
        <input name="destination" type={channel === "email" ? "email" : "tel"} autoComplete={channel === "email" ? "email" : "tel"} placeholder={channel === "sms" ? "+1 212 555 0123" : undefined} maxLength={254} required />
      </label>}
      <button className="auth-submit" type="submit" disabled={pending}>{pending ? "Please wait…" : verify ? "Verify code & sign in" : "Send login code"}</button>
    </form>
    {verify && <div className="auth-code-tools">
      <button type="button" onClick={changeDestination} disabled={pending}>Use a different {channel === "email" ? "email" : "number"}</button>
      <form action={action}>{fields}<input type="hidden" name="operation" value="send" /><input type="hidden" name="destination" value={state.destination} /><button type="submit" disabled={pending}>Send a new code</button></form>
    </div>}
  </>;
}
