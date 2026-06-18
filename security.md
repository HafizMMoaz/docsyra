# Security Policy

## Supported Areas
This project includes a Next.js app deployed on Cloudflare Pages and a separate Cloudflare Worker for collaboration.

## Reporting a Security Issue
If you discover a security issue, do not open a public issue. Report it privately to the project maintainers with:

- A short summary of the issue
- The affected page, route, worker, or workflow
- Steps to reproduce
- Any proof of concept or request/response examples
- The expected impact

## What To Include
Please include as much detail as possible so the issue can be verified quickly.

## Safe Handling
Until the issue is fixed:

- Do not share exploit details publicly
- Do not test against production data or other users' content
- Minimize any reproduction against real accounts or records

## Common Security Areas
Please pay extra attention to:

- Authentication and session handling
- OAuth, passkeys, OTP, and password reset flows
- Access control for documents, comments, and invitations
- Upload handling and R2 asset access
- Environment variables, secrets, and Wrangler deployment settings
- Collaboration websocket and Durable Object message handling

## Response
Security reports should be triaged as soon as practical, and fixes should be prioritized based on impact and exploitability.