// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * The rate limits' key for the request's client address, which the rate-limit stage sets;
			 * undefined when the request has no known address, or skipped that stage.
			 */
			clientAddress?: string;
			/** The owner the request's session signs in, which the session stage sets. */
			owner?: { username: string };
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
