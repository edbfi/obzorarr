import { redirect } from '@sveltejs/kit';
import { logout } from '$lib/server/auth/logout';
import type { Actions, PageServerLoad } from './$types';

// ISSUE-024: logout must be POST-only. A GET `load` side-effect made
// `<img src="/auth/logout">`/prefetch/navigation clear the session with no CSRF
// check (SvelteKit's built-in origin check is disabled via
// `csrf.trustedOrigins:['*']`, and `csrfHandle` skips GET). The `load` therefore
// MUST NOT mutate — it only redirects. Session clearing happens exclusively in
// the POST action, which is covered by `csrfHandle` + `SameSite=Lax` cookies.
export const load: PageServerLoad = async () => {
	throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ cookies, url }) => {
		await logout(cookies, url);
		throw redirect(303, '/');
	}
};
