import { error, fail, redirect } from "@sveltejs/kit";
import { type ClaimResult, claimInstance } from "#lib/server/services/setup/claim.ts";
import { isFirstRunComplete } from "#lib/server/services/setup/first-run.ts";
import { currentDatabase } from "#lib/server/services/setup/startup.ts";
import type { Actions, PageServerLoad } from "./$types";

type Invalid = Extract<ClaimResult, { status: "invalid" }>;

/** What a failed claim sends back: the typed username and what went wrong, nothing else. */
export type ClaimFailure = {
	username: string;
	usernameError?: Invalid["username"];
	passwordError?: Invalid["password"];
	tokenRefused?: boolean;
	failed?: boolean;
	/** Too many attempts from this address: how long to wait before trying again. */
	retryAfterSeconds?: number;
	/** Every hash slot was busy: try again in a few seconds. */
	busy?: boolean;
};

// The claim is first run's first step; once first run is complete it no longer exists (D20).
export const load: PageServerLoad = () => {
	if (isFirstRunComplete()) error(404);
};

export const actions: Actions = {
	default: async ({ request, locals, setHeaders }) => {
		const form = await request.formData();
		// Form fields are external input: anything but text counts as empty.
		const field = (name: string) => {
			const value = form.get(name);
			return typeof value === "string" ? value : "";
		};
		const username = field("username");
		const result = await claimInstance(currentDatabase(), {
			token: field("token"),
			username,
			password: field("password"),
			clientAddress: locals.clientAddress,
		});
		// A failed claim sends back only the typed username: never the token or the password.
		const failure = (status: number, problem: Omit<ClaimFailure, "username">) =>
			fail<ClaimFailure>(status, { username, ...problem });
		switch (result.status) {
			case "claimed":
				return redirect(303, "/");
			case "not-found":
				return error(404);
			case "invalid":
				return failure(400, { usernameError: result.username, passwordError: result.password });
			case "token":
				return failure(400, { tokenRefused: true });
			case "failed":
				return failure(500, { failed: true });
			case "too-many":
				setHeaders(result.headers);
				return failure(
					429,
					result.reason === "busy"
						? { busy: true }
						: { retryAfterSeconds: result.retryAfterSeconds },
				);
		}
	},
};
