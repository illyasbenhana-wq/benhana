/**
 * Single source of truth for whether this build should bypass the
 * auth-guard redirect to /login, so an anonymous visitor can see
 * restyled screens with demo data instead of the still-dark, unrestyled
 * login form during design review.
 *
 * Deliberately NOT `process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'`:
 * confirmed via `vercel pull --environment=preview` that this project
 * does not have Vercel's "Automatically expose System Environment
 * Variables" enabled — `NEXT_PUBLIC_VERCEL_ENV` (and even the
 * server-only `VERCEL_ENV`) is absent from the exact env vars Vercel
 * injects into this project's Preview builds. Every earlier version of
 * this check depended on that unset variable and was dead code.
 *
 * Instead, `NEXT_PUBLIC_PREVIEW_BYPASS` is our own explicit, user-defined
 * env var, added via `vercel env add NEXT_PUBLIC_PREVIEW_BYPASS preview
 * <branch> --value true`, scoped to Preview builds of this branch only.
 * Confirmed present via `vercel env ls preview` and absent via
 * `vercel env ls production` before relying on it — verify the same way
 * if this is ever re-scoped to more branches or removed.
 *
 * Every auth-guarded route (app/dashboard, app/lender/dashboard, and any
 * future one) should call this before pushing to /login, so the redirect
 * never fires in the first place. app/login/page.tsx also checks this as
 * a safety net for any route that forgets to — see that file for why
 * that alone isn't the full fix (it would infinite-loop against a route
 * that unconditionally re-redirects on every mount).
 */
export function isPreviewDeployment(): boolean {
  return process.env.NEXT_PUBLIC_PREVIEW_BYPASS === 'true'
}
