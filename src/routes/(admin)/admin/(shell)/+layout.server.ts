import type { LayoutServerLoad } from "./$types";

/** The signed-in owner's username for the shell's footer; the owner check let only them in. */
export const load: LayoutServerLoad = ({ locals }) => ({ username: locals.owner?.username ?? "" });
