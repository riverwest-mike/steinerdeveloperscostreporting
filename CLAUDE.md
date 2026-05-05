# Project notes for Claude

## Deployment policy

**Vercel preview deployments are disabled on every branch except `main`.** This
is enforced via `git.deploymentEnabled` in `vercel.json` — only commits that
land on `main` produce a Vercel build.

Workflow:
1. All work happens on a feature branch (e.g. `claude/<slug>`).
2. The branch is pushed to GitHub for review only — **no preview URL will be
   generated** and no Vercel build minutes are consumed.
3. The owner reviews and merges the PR to `main` manually on GitHub when
   ready to ship.
4. The merge to `main` is what triggers a production deployment.

Implications for Claude sessions:
- Do **not** suggest checking a preview URL after pushing — there isn't one.
- Do **not** add preview-deploy hooks, badges, or scripts that assume preview
  builds exist.
- Do **not** widen `git.deploymentEnabled` to include feature branches; the
  cost-and-noise tradeoff was deliberately chosen.
- When changes need to be tested before merge, prefer local `next dev` or a
  staging build the user runs intentionally.

## Build efficiency

Because every build that runs is a **production build that ships to users**,
keep the deploy path lean:
- Don't add dev-only tooling or sample data to runtime imports.
- Keep `dependencies` (vs. `devDependencies`) tight — anything in
  `dependencies` ships in the serverless bundle.
- Avoid heavy synchronous work at module top level in `app/` files; Next.js
  evaluates these during build.
- Use `next/font` (already configured) and `next/image` for assets — they get
  Vercel's edge optimizations for free.
- Cron and webhook routes already exist; reuse them rather than adding new
  scheduled infrastructure.
