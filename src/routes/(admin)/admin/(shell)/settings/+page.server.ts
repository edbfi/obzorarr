import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** `/admin/settings` opens its first tab, Security (SPEC-sign-in.md). */
export const load: PageServerLoad = () => redirect(307, "/admin/settings/security");
