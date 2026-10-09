# Copilot instructions — Liffan All-School Platform

- This is a multi-school management platform built with React, Vite, Cloudflare Pages Functions and Cloudflare D1.
- Keep school records isolated by school_id. Never trust a school_id sent by the browser as proof of authorization.
- Do not implement public access to student marks, attendance, parent links, fees or staff data.
- Do not store plaintext passwords or secrets in source control.
- Before production, implement and test authentication, session validation, role-based authorization and server-side school membership checks on every private API route.
- School registration must be restricted to authenticated platform administrators.
- Preserve existing features unless a change is requested.
- Run npm run build after code changes.
- Do not add paid services without approval.
