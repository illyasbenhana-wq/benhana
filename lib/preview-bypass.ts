/**
 * Single source of truth for whether the auth-guard redirect to /login
 * should be bypassed. Every auth-guarded route (app/dashboard,
 * app/lender/dashboard, app/score/[id], and any future one) calls this
 * before pushing to /login, so the redirect never fires in the first
 * place. app/login/page.tsx also checks this as a safety net for any
 * route that forgets to — see that file for why that alone isn't the
 * full fix (it would infinite-loop against a route that unconditionally
 * re-redirects on every mount).
 *
 * As of 2026-07-17: unconditionally `true` in every environment,
 * including production. All platform data (Dashboard, case dossiers,
 * EthoScore panel) is fictional demo data — there is nothing to
 * protect, so the login gate is off everywhere. This was previously
 * scoped to Preview only via the `NEXT_PUBLIC_PREVIEW_BYPASS` env var;
 * that scoping is intentionally removed here, not just overridden, so
 * the env var no longer needs to exist for this to hold.
 *
 * Revert this to a real env/session check before real customer data is
 * connected in a future phase.
 */
export function isPreviewDeployment(): boolean {
  return true
}
