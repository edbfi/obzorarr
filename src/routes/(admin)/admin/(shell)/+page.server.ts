import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** `/admin` opens the Security tab until `overview` builds the dashboard (SPEC-sign-in.md). */
export const load: PageServerLoad = () => redirect(307, "/admin/settings/security");
