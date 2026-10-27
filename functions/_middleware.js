import {
  getAuthenticatedUser,
  json
} from './_lib/auth.js';

const privateImplementedPaths = new Set([
  '/api/school-profile',

  '/api/schools',
  '/api/schools/approve',
  '/api/schools/delete',

  '/api/auth/requests',
  '/api/auth/admin-reset-password',

  '/api/students',
  '/api/parent/children',
  '/api/subjects',
  '/api/teacher-assignments',
  '/api/marks',
  '/api/attendance',
  '/api/fees',
  '/api/announcements',
  '/api/reports',
  '/api/audit-events',
  '/api/invitations',
  '/api/users'
]);

export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);

  /*
   * Middleware only controls API routes.
   */
  if (!url.pathname.startsWith('/api/')) {
    return context.next();
  }

  const path =
    url.pathname.replace(/\/+$/, '') || '/';

  const method =
    request.method.toUpperCase();


  /*
   * Authentication endpoints handle
   * authentication themselves.
   *
   * IMPORTANT:
   * /api/auth/me must reach me.js directly.
   */
  const authEndpoint =
    path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path === '/api/auth/me';

  if (authEndpoint) {
    return context.next();
  }


  /*
   * Public endpoints.
   */
  const publicMethod =
    (
      path === '/api/auth/register' &&
      method === 'POST'
    ) ||
    (
      path === '/api/auth/accept-invite' &&
      method === 'POST'
    ) ||
    (
      path === '/api/platform/bootstrap' &&
      method === 'POST'
    ) ||
    (
      path === '/api/schools' &&
      method === 'POST'
    ) ||
    (
      path === '/api/public/schools' &&
      method === 'GET'
    ) ||
    (
      path === '/api/health' &&
      method === 'GET'
    ) ||
    (
      path === '/api/public-settings' &&
      method === 'GET'
    ) ||
    (
      path === '/api/enquiries' &&
      method === 'POST'
    ) ||
    (
      path.startsWith('/api/shared-reports/') &&
      method === 'GET'
    );

  if (publicMethod) {
    return context.next();
  }


  /*
   * Reject APIs that are not explicitly
   * implemented.
   */
  if (!privateImplementedPaths.has(path)) {
    return json(
      {
        error:
          'This API endpoint is not enabled yet. No demo or unscoped API access is allowed.'
      },
      501
    );
  }


  /*
   * Protect implemented private APIs.
   */
  const auth =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!auth.user) {
    return auth.response;
  }


  /*
   * The endpoint itself performs its
   * role and school-specific checks.
   */
  return context.next();
}