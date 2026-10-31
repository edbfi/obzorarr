import type { ServerInit } from "@sveltejs/kit/hooks";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";
import { building } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await loadKeyring(env);
};
