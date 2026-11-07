import type { Handle, ServerInit } from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";
import { building } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await loadKeyring(env);
};

export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace("%lang%", locale) },
		),
	);
