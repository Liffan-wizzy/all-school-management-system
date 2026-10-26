import { getAuthenticatedUser, json } from './_lib/auth.js';

const privateImplementedPaths = new Set([
  '/api/auth/me','/api/schools/delete', '/api/auth/requests', '/api/auth/admin-reset-password',
  '/api/schools', '/api/schools/approve', '/api/students', '/api/parent/children',
  '/api/subjects', '/api/teacher-assignments', '/api/marks', '/api/attendance',
  '/api/fees', '/api/announcements', '/api/reports', '/api/audit-events', '/api/invitations', '/api/users',
]);

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return context.next();
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const publicMethod =
    (path === '/api/auth/login' && method === 'POST') ||
    (path === '/api/auth/logout' && method === 'POST') ||
    (path === '/api/auth/register' && method === 'POST') ||
    (path === '/api/auth/accept-invite' && method === 'POST') ||
    (path === '/api/platform/bootstrap' && method === 'POST') ||
    (path === '/api/schools' && method === 'POST') ||
    (path === '/api/public/schools' && method === 'GET') ||
    (path === '/api/health' && method === 'GET') ||
    (path === '/api/public-settings' && method === 'GET') ||
    (path === '/api/enquiries' && method === 'POST') ||
    (path.startsWith('/api/shared-reports/') && method === 'GET');
  if (publicMethod) return context.next();
  if (!privateImplementedPaths.has(path)) return json({ error: 'This API endpoint is not enabled yet. No demo or unscoped API access is allowed.' }, 501);
  const auth = await getAuthenticatedUser(request, context.env);
  if (!auth.user) return auth.response;
  return context.next();
}
