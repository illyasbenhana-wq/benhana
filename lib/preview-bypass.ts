/**
 * Single source of truth for whether this build is running as a Vercel
 * preview deployment. Used to bypass the auth-guard redirect to /login
 * during design review, so an anonymous visitor can see restyled screens
 * with demo data instead of the still-dark, unrestyled login form.
 *
 * `NEXT_PUBLIC_VERCEL_ENV` is a Vercel system env var, automatically
 * exposed to the client on Vercel deployments — never true in local dev
 * or production. Every auth-guarded route (app/dashboard,
 * app/lender/dashboard, and any future one) should call this before
 * pushing to /login, so the redirect never fires in the first place.
 * app/login/page.tsx also checks this as a safety net for any route
 * that forgets to — see that file for why that alone isn't the full fix
 * (it would infinite-loop against a route that unconditionally
 * re-redirects on every mount).
 */
export function isPreviewDeployment(): boolean {
  return process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
}
