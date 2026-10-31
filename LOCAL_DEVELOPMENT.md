# Local preview of the latest staging product

Project: `/Users/andrewroberts/Projects/platelabstudio.com/website`

## Current baseline

Use this repository's **`main`** branch for all ongoing development. It contains
the full staging product, production coming-soon page, viewer, ingest pipeline
and team review. The GitHub repository is
`theandyroberts/meridian_public_site`.

The October 31 consolidation incorporated the latest staging revision plus
previously uncommitted pipeline/review work and missing launch-page features.
See [the consolidation record](docs/runbooks/repository-baseline.md).

## Start

```sh
cd /Users/andrewroberts/Projects/platelabstudio.com/website
export PATH="/Users/andrewroberts/.nvm/versions/node/v22.14.0/bin:$PATH"
npm run dev -w web -- --hostname 127.0.0.1 --port 3000
```

Open http://127.0.0.1:3000. Web edits reload automatically.
The server listens only on this Mac.

This setup uses **staging Supabase and the shared staging test accounts**, as
specified in the repository README. Changes to projects and account data affect
staging. It does not use the production database. Docker is not needed for this
configuration.

The `/login` page displays the customer and admin test accounts and one-click
sign-in buttons. Configuration is in ignored `web/.env.local`; never commit it.
The server-side publishing service key is not copied into this local setup.

Approved imported metadata snapshots and homepage showreel assets were copied
from staging into ignored `web/public/media/` directories. Other previews use
the configured staging storage URL and the existing composite-media proxy.

## Viewer and checks

```sh
npm run build --prefix viewer
npm run build:imported --prefix viewer
npm test -w web
npm test --prefix viewer
```

The viewer requires a rebuild and refresh after edits. For a full production
build, stop the dev server first, run `npm run build`, then restart it; both use
`web/.next`.

## Future updates

Work on `main` in this folder. Start a session with `git status` and, when clean,
`git pull --ff-only origin main`. Commit related changes and push `main` after
verification. Do not develop in historical worktrees or the `site_code_no_repo`
export. Deployment remains a separate, deliberate operation.

The isolated eight-demo-plate database remains available separately. Its former
environment configuration is backed up at
`.local-dev/backups/env-local-isolated-before-staging.env`, and its pre-setup
database dump is `.local-dev/backups/before-local-migrations-20261031.dump`.
Neither is required for the current staging-backed preview.
