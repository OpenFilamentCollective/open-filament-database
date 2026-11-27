# Fake GitHub (+ SimplyPrint + mail outbox) for local testing

A stateful, in-memory stand-in for the parts of GitHub the web editor uses, so the whole
submission → review → feedback → fix loop can be driven locally without touching the real repo.

```bash
# optional: a dataset API for cloud mode
uv run -m ofd build -o /tmp/ofd-dist --skip-sqlite --skip-csv

node scripts/fake-github/dev.mjs --work /tmp/ofd-fake --dataset-dir /tmp/ofd-dist
#   app          http://localhost:5173   (vite dev, PUBLIC_APP_MODE=cloud)
#   fake GitHub  http://localhost:4010   (maintainer UI, outbox, control API)
```

`dev.mjs` writes an isolated `.env` into `--work` and points SvelteKit at it (`OFD_ENV_DIR`), so
`webui/.env` and its real credentials are never loaded. It generates a throwaway GitHub App key.

## What it emulates
- Git data API with real git SHA-1 hashing (seeded lazily from this checkout's `HEAD`), refs,
  forks, pulls (create/list/get/patch/files/merge), compare, contents, reviews, issue comments,
  collaborator permissions, check runs / statuses, `/user`, App installation tokens.
- GraphQL `PrFeedback` with GitHub's shapes (Bot vs User, review states, resolved / outdated threads,
  file-level comments, replies). Threads become outdated automatically when their line changes.
- Write permissions: own fork, upstream with write access, forks whose open PR allows maintainer edits.
- GitHub and SimplyPrint OAuth with a "sign in as…" picker
  (GitHub: `maint`, `maint2`, `contrib-gh`, `outsider`; SimplyPrint: Alice, Bob, Nina-without-email).
- Signed webhooks back to the app (`pull_request` opened/closed/reopened, `pull_request_review`).
- Outbox: emails (`EMAIL_OUTBOX_URL`) and the editor's outgoing OFD webhooks (`WEBHOOK_URL_*`).

## Acting as a maintainer
Open http://localhost:4010/ : PR list, PR pages with comment / inline comment / review /
request changes / dismiss / resolve / mark outdated / inject an AI review run / close / reopen /
merge (as any user), "commit directly to main", and the Outbox.
Everything is also available as JSON under `POST /__control/...` (see `server.js`), e.g.

```bash
curl -XPOST -H content-type:application/json localhost:4010/__control/pr/1000/close -d '{"as":"maint","comment":"Rejected: duplicate of #800"}'
curl -XPOST localhost:4010/__control/reset
```
