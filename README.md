# Liffan All-School — role registration addition

This is an **add-on** for the existing Liffan JavaScript/Vite + Cloudflare Pages + D1 project. It does not replace the React dashboard or project configuration. It adds a registration-request flow for secretaries, teachers, and parents, plus per-role landing pages.

## What it adds

- `/register-school.html`: public school application form.
- `/platform-schools.html`: platform-admin screen to approve a school, set paid-through date, and create its first school administrator.
- `/role-register.html`: a school selector and registration form.
- `/api/auth/register`: stores a PENDING account request; it does not grant access immediately.
- `/role-review.html` and `/api/auth/requests`: school administrators review requests for their own school; platform administrators can review all schools.
- `POST /api/auth/requests`: approve/reject. Approval creates an account. Parent approval checks the child's admission number inside the same school and links only that student.
- `/role-dashboard.html`: redirects signed-in users to role-specific choices.
- `/students.html`: school-scoped student list; school administrators and secretaries can add a student, teachers can view.
- `/parent-children.html` and `/api/parent/children`: returns only students that were verified and linked to the signed-in parent.
- `migrations/0004_ROLE_REGISTRATION.sql`: request queue and parent link table.

## Before you copy

1. Confirm the original authentication patch is in place: `functions/_lib/auth.js`, `functions/api/auth/login.js`, `functions/api/auth/me.js`, `functions/api/schools.js`, `functions/api/schools/approve.js`, `functions/api/students.js`, and `migrations/0003_AUTH_AND_ACCESS.sql`.
2. Back up/commit your current project.
3. Extract this ZIP into the project root and merge folders. It adds files and updates `public/school-login.html` and `functions/_middleware.js` so the new endpoints are reachable. If asked about replacing either of those two files, select **Replace** only if it is the same auth patch version described in step 1; otherwise stop and inspect the difference first.

## Apply the migration

Run from the project root:

```powershell
npx wrangler d1 migrations apply all-school-test-db --remote
```

Confirm that it applies `0004_ROLE_REGISTRATION.sql` successfully. If the migration list reports a numbering conflict or says a previous auth migration is missing, stop rather than editing migration history.

## Build and deploy

```powershell
npm run build
npx wrangler pages deploy dist --project-name=all-school-management-system --branch=main
```

Then open:
- `https://all-school-management-system.pages.dev/register-school.html` for school applications.
- `https://all-school-management-system.pages.dev/platform-schools.html` after a platform admin signs in, to approve a school and create its first school administrator.
- `https://all-school-management-system.pages.dev/role-register.html`
- `https://all-school-management-system.pages.dev/school-login.html`

## Rules

- Public registration cannot create `PLATFORM_ADMIN` or `SCHOOL_ADMIN`; the platform administrator must appoint the initial school administrator through the existing approval workflow.
- New accounts remain pending and cannot sign in until approved.
- A parent must supply an admission number. The school approval API verifies the number against students in that same school before linking the parent.
- An active school subscription is required for registration/login. Expired or suspended school access blocks sign-in.
- This adds the registration, approval, student-list and parent-child-link flows. **It does not yet implement attendance, marks entry, fees/payment processing, reports, password reset, invitations, or audit logs.** Keep using sample data until those modules are implemented and tested; do not claim the complete platform is production-ready solely because this patch deploys.
