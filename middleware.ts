// Auth is enforced client-side in app/dashboard/page.tsx via supabase.auth.getSession().
// Middleware is intentionally left as a pass-through — adding cookie-based checks here
// requires @supabase/ssr which is not in this project's dependencies.
export function middleware() {}

export const config = { matcher: [] }
