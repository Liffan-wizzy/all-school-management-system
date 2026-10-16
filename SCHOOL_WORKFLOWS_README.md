# Liffan School Workflows Add-on — API + workspace

This patch extends the previously installed combined authentication/role-registration package. It is additive: do not replace `src/`, `package.json`, `vite.config.*`, `wrangler.toml` or `wrangler.jsonc`.

## New capabilities

- School-scoped subjects and teacher/class assignments.
- Marks listing and entry; teachers can enter/view marks only for assigned subject/class.
- Attendance listing and entry; teachers are restricted to assigned classes.
- Fee charges, payments and adjustments; school admins/secretaries can post records, and parents see linked-child transactions only.
- School announcements filtered by audience.
- Aggregate reports; parent summaries are filtered to linked children.
- Audit event records for key write operations.
- One-time school invitations for secretary, teacher and parent accounts. Parent invitations validate the child admission number at acceptance.
- School admin password reset for non-admin accounts.
- New `/school-workspace.html` page to operate the new modules from a browser, linked from the role dashboard.

## Install carefully

1. Back up or commit your current project first.
2. Extract this ZIP into the root of `liffan-all-school-platform-starter` and merge its folders. The archive contains `functions/`, `migrations/`, and `public/` at the root.
3. Replace `functions/_middleware.js`, `public/role-dashboard.html`, and `public/school-login.html` with the provided versions. Keep the original React/Vite dashboard and config files unchanged.
4. The migration assumes `students` has `id` and `school_id` columns and that prior additions created `auth_users`, `auth_sessions`, `school_access`, and `auth_parent_students`.
5. Check the remote migration list before applying:

   ```powershell
   npx wrangler d1 migrations list all-school-test-db --remote
   ```

   It should show only `0005_SCHOOL_WORKFLOWS.sql` pending. If another migration is shown or any number/name differs, stop and inspect before applying.

6. Apply the migration:

   ```powershell
   npx wrangler d1 migrations apply all-school-test-db --remote
   ```

7. Build and, only if the build succeeds, deploy to the existing site:

   ```powershell
   npm run build
   npx wrangler pages deploy dist --project-name=all-school-management-system --branch=main
   ```

## Open

- Login: `/school-login.html`
- Role workspace: `/role-dashboard.html`
- Operational modules: `/school-workspace.html`
- Claim one-time invitation: `/accept-invite.html`

## API endpoints added

- `GET/POST /api/subjects`
- `GET/POST /api/teacher-assignments`
- `GET/POST /api/marks`
- `GET/POST /api/attendance`
- `GET/POST /api/fees`
- `GET/POST /api/announcements`
- `GET /api/reports`
- `GET /api/audit-events`
- `GET/POST /api/invitations`
- `POST /api/auth/accept-invite`
- `POST /api/auth/admin-reset-password`
- `GET /api/users`

## Still outstanding

This patch does not include email delivery for self-service password resets or email invitations; invitation codes must be passed to the intended recipient through a trusted channel. It does not implement backup/restore automation, full production security review, independent penetration testing, or automated end-to-end tests. The old preview cards in the main React dashboard may still need to be wired to these pages. Use sample records until the exact D1 schema is verified and all routes are tested in the deployed environment.
