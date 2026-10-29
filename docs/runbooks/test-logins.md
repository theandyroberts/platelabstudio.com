# Local and staging test logins

The `/login` page can show two shared test accounts below the sign-in form,
including their passwords and buttons that submit the normal password sign-in
action. These are intentionally shared testing identities, not personal accounts.

## Accounts and permissions

- Customer: `platelab-test-customer@note15.com`. A confirmed Supabase Auth user
  with no `staff_users` entry; normal project and scene RLS applies.
- Admin: `platelab-test-admin@note15.com`. A confirmed Supabase Auth user with
  `staff_users.role = 'system_admin'`. Admin pages, server actions and stitch
  report APIs check this role on the server.

Both accounts are provisioned in staging. Local development uses that same
staging backend. The existing legacy shared-password admin login is retained;
normal password sign-in and sign-out clear its cookie so it cannot carry admin
access into a customer session.

Do not store private customer data in these shared accounts. An admin test
login has real staging admin permissions, including access to existing staging
projects and administrative actions. The external staging access gate must remain
enabled. These credentials must never be reused for production identities.

## Configuration

Set these server-only variables in `web/.env.local` or the staging web service:

```dotenv
SHOW_TEST_LOGINS=true
TEST_CUSTOMER_EMAIL=platelab-test-customer@note15.com
TEST_CUSTOMER_PASSWORD=<dedicated customer password>
TEST_ADMIN_EMAIL=platelab-test-admin@note15.com
TEST_ADMIN_PASSWORD=<dedicated admin password>
```

The panel also requires both the request hostname and `NEXT_PUBLIC_SITE_URL`
to identify localhost or a recognized staging hostname. The Supabase backend
must be `supabase-staging.theplatelab.site` or localhost. Missing or malformed
configuration fails closed. Production configuration never renders the panel,
even if the request spoofs a localhost hostname.

Passwords are not in Git. Current staging provisioning credentials are stored
in the root-only `/srv/platelab-coolify/test-logins.json` on the staging host;
retrieve them only through authorized server access. Update the Auth password
and the corresponding environment variable together when rotating, then
restart the web service. Never substitute `ADMIN_PASSWORD` or a service-role
API key for a test password.

## Verification

1. On localhost or gated staging, open `/login` while signed out. Both rows
   should appear below the form outline.
2. Sign in as customer. Projects opens; `/admin` redirects away and both
   stitch report API routes deny access.
3. Log out and sign in as admin. `/admin/studio-controls` opens and stitch
   report requests pass authorization. A nonexistent report still returns 404.
4. Verify the panel is absent on production and when `SHOW_TEST_LOGINS=false`.

Server-side catalog publishing still requires its existing service-role
configuration. Creating these login accounts does not provision that key or
bypass any other administrative action prerequisites.
