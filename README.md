# Liffan All-School Platform — starter

This is a starter foundation for a multi-school management platform using React, Vite, Cloudflare Pages Functions and D1.

## Important safety note

This is **not production-ready for real student data**. The interface currently runs with illustrative preview records. The school registry API deliberately fails closed until authentication and server-side authorization are implemented. Before public use, add session validation, role checks, platform administrator authorization, school-level access enforcement on every private API route, audit logging, backups and appropriate privacy controls.

## 1. Install and run locally

Requirements: a current Node.js LTS release and Git.

```bash
npm install
npm run dev
```

The Vite preview displays the management workspace with sample records. The `/api/schools` endpoints return `503` until authentication and authorization are implemented; connecting D1 alone does not enable registry access. Use Wrangler Pages dev for local Cloudflare bindings after configuring D1.

## 2. Connect Cloudflare D1

1. Create or select a D1 database in Cloudflare.
2. Copy its database name and ID into `wrangler.jsonc`.
3. Confirm the Pages project has a D1 binding named `DB` pointing to that database.
4. Apply the migration to a **new/test database first**:

```bash
npx wrangler d1 migrations apply REPLACE_WITH_YOUR_D1_DATABASE_NAME --remote
```

If you use an existing database, back it up and inspect its current schema before applying any migration. Do not apply this starter schema blindly to the existing Mulala database.

## 3. Build

```bash
npm run build
```

The output folder is `dist`, suitable for Cloudflare Pages.

## 4. Deploy with the existing GitHub workflow

Do not replace your existing school portal until this starter is reviewed and tested. If you decide to use it as a new repository, create a new GitHub repo and push the project there. For your existing repo, merge files deliberately and keep a backup/branch first.

## Current scope

- Multi-school preview dashboard with a school-scope selector
- Preview workspaces for schools, students, attendance, academics and fees
- Illustrative in-memory sample records only; changes are not persisted
- D1 schema for schools, users, students, parent/student links, subjects, marks, attendance and fee accounts, with tenant-consistency triggers
- School registry API is disabled until verified authentication and role checks are added
- Copilot instructions for future development

## Not yet implemented

- Real login, password/session management, account recovery and invitation flow
- Secure platform admin / school admin / secretary / teacher / parent authorization
- School registry and student, marks, attendance, fees and reports APIs with per-request school scoping
- Parent access linking and verification
- Production security review, audit logs, backup/restore and automated tests
