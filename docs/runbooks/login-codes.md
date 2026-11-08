# Email login codes and launch accounts

The login screen supports email/password and a six-digit email code. Both use
Supabase Auth and the same user identity. A first code request can create an
account. Codes are verified by Auth, never in client code. Passwords preserve
whitespace. Successful password, code, and OAuth/link logins clear the legacy
shared-admin cookie.

## Website configuration

Set `AUTH_EMAIL_CODE_ENABLED=true` only after both Auth email templates are
provisioned. `AUTH_ACCOUNTS_ENABLED=true` opens `/login`, `/account`, password
recovery, and Auth callbacks on production while the homepage and catalog stay
in coming-soon mode. Production login redirects to `/account`; staging preserves
its project/scene return path. Shared test logins remain staging-only.

Production must use its own Supabase URL and anon key, not the staging database.
The account page only needs Auth and does not depend on catalog/project tables.

## Email service configuration

Templates are versioned in `web/public/auth-emails/`. The Auth service must fetch
HTML containing `{{ .Token }}` for **both** `MAGIC_LINK` and `CONFIRMATION`; new
OTP users use the confirmation template. The confirmation template also retains
a `/auth/confirm` link for password signups. Keep password-recovery templates.

The deployed templates are served independently of the Next.js login page at:

- `https://platelabstudio.com/composite-review/media/composite/auth-emails/magic-code.html`
- `https://platelabstudio.com/composite-review/media/composite/auth-emails/confirmation-code.html`

Their runtime directory is
`/home/ubuntu/platelab-composite-ingest/data/public/media/composite/auth-emails`.
Update it from the tracked templates when changing email copy.

Configure each self-hosted Auth service with its existing verified SMTP service:

```text
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=<magic-code URL>
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=<confirmation-code URL>
GOTRUE_MAILER_OTP_EXP=600
GOTRUE_MAILER_OTP_LENGTH=6
GOTRUE_SMTP_MAX_FREQUENCY=60s
GOTRUE_MAILER_AUTOCONFIRM=false
GOTRUE_EXTERNAL_PHONE_ENABLED=false
GOTRUE_SMS_AUTOCONFIRM=false
```

The OTP expiry also applies to other email authentication links. Never enable
email or phone autoconfirm to make login tests pass. Keep SMTP credentials in
Coolify/server configuration. Google credentials belong only in Auth; see
`google-auth.md`.

Production account access needs its existing Postgres, Auth, and Kong services.
Other production services can remain stopped during the coming-soon period.
Preserve the existing named database volumes when recreating containers, and
connect the reverse proxy to the production service network. Persist changes in
Coolify as well as its generated Compose configuration.

## Verification

- Password sign-in and sign-out still work; wrong credentials are rejected.
- A new email account receives a numeric code, signs in, and can sign out.
- An existing account receives a code and retains its original user ID.
- Invalid, expired, and already-used codes are rejected.
- Resend is rate-limited by Auth; private codes never enter URLs or logs.
- Production `/account` requires login; `/` and `/browse` remain coming soon.
- Staging preserves `next=/projects/...`; external return URLs are rejected.
- Verify real inbox delivery in addition to API acceptance.

## To do: SMS / Twilio

SMS is deliberately disabled and absent from the login UI. A provider account
has not been created. Before exposing it, connect a provider, configure real SMS
delivery and abuse controls, test delivery/verification, and add verified phone
linking for existing email/Google accounts. Do not enable `AUTH_SMS_CODE_ENABLED`
or expose the SMS UI until those steps are complete.
