# One repository, one development branch

Canonical repository: `https://github.com/theandyroberts/meridian_public_site`

Active branch: **`main`**

Working folder on Andrew's Mac:
`/Users/andrewroberts/Projects/platelabstudio.com/website`

All ongoing website, launch-page, viewer, ingest and review work belongs here.
The sibling `site_code_no_repo` folder is an older August export; the worktrees
under `outputs/` are historical snapshots, not development checkouts.

## October 31, 2026 consolidation

- Started from `4501a40`, the current staging image and latest GitHub `main`.
- Added the previously uncommitted composite ingest pipeline, local editorial
  review routes, standalone team-review app, deployment handoffs and tests.
- Kept the newer upstream viewer, logo and composite detail components where
  old local copies overlapped. Retained the local-review routing additions.
- Incorporated the production branch's Listmonk signup form, scrolling fix and
  production-domain routing. Preserved the later static globe choice on `main`.
- Verified that the legacy MMM import from `sky-element-1.0` is already present
  in the main baseline with newer upload and command execution support.
- Stopped tracking Python bytecode and excluded local backups, generated review
  bundles and credentials. Runtime media remains outside Git.
- Updated both Coolify web applications to source `main`, with automatic
  deployment disabled. Ingest already sources `main` with automatic deployment
  disabled. No application was deployed or restarted for this consolidation.

## Development and deployment

Use `git pull --ff-only origin main` when the working tree is clean. Make changes,
run the relevant checks, commit and push `main`. Use `npm run dev` for web work;
see [LOCAL_DEVELOPMENT.md](../../LOCAL_DEVELOPMENT.md) for setup and viewer builds.

Staging and production are separate releases of this same source tree.
The public production hostnames show only the coming-soon page; staging and
localhost show the full application. The launch page does not call Supabase.
Test credentials remain restricted to the configured local/staging environment.
The local preview uses staging accounts and data.

Deploy deliberately from a tested `main` commit. Preserve environment settings,
media mounts, the staging gate and a previous image for rollback. The running
staging image was `4501a40` and the public launch image was `659192e` at
consolidation; neither is implicitly updated by pushing code.

## Historical recovery

Old local and remote branch tips are retained as annotated tags under
`archive/2026-10-31/local/` and `archive/2026-10-31/remote/`. They are snapshots,
not alternate development branches. Do not resurrect one as the next baseline.

The original pre-update work remains in the named Git stash
`Preserve local work before updating to main 2026-10-31`. Its superseded file
versions are preserved for reference. A verified Git bundle, binary working-tree
patch and archive of untracked source are also under the ignored local directory
`.local-dev/backups/consolidation-20261031/`.

Deployment source settings were backed up before modification on the Coolify
host at `/srv/platelab-repository-consolidation/2026-10-31/`.

Verification: web production build; standalone team-review build; web, pipeline,
composite, viewer and feedback tests; launch routes with an unavailable database;
local logo, catalog, login and homepage checks.
