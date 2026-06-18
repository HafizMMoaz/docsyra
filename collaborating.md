# Collaborating

## Working In This Repository
This project is split into two main parts:

- `docsyra_app/` for the main Next.js application
- `docsyra-collab/` for the Cloudflare Worker that powers realtime collaboration

## Before You Edit
- Check for an existing workflow, migration, or API route before adding a new one.
- Keep changes focused and avoid broad refactors unless they are required.
- Follow the existing Cloudflare deployment model for app and worker changes.

## Common Checks
Before opening a pull request, run the relevant validation for the area you changed:

- `npm run lint`
- `npm run build`
- `npm run pages:build` for Cloudflare Pages output
- `npm run deploy` only when you intend to publish

## Commit And Review Notes
- Keep commits small and descriptive.
- Call out any database migration, env var, or Cloudflare binding changes in the review notes.
- Mention any security-sensitive changes explicitly.

## Collaboration Expectations
- Prefer direct, minimal fixes over speculative rewrites.
- Preserve existing behavior unless the task explicitly changes it.
- Update docs when you change a user-facing flow, deployment step, or operational requirement.