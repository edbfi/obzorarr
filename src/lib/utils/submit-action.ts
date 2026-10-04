import { type ActionResult, deserialize } from '$app/forms';

export type SubmitOutcome<T> =
	| { type: 'success'; data: T }
	| { type: 'failure'; data: { error?: string } & Partial<T> }
	| { type: 'error'; error: { message?: string } }
	| { type: 'redirect'; location: string };

/**
 * Submit a SvelteKit form action programmatically and return the parsed result.
 *
 * SvelteKit only returns the action wire format (parseable by `deserialize`) when
 * the request carries the `x-sveltekit-action: true` header. Without it the server
 * responds with an HTML page and `deserialize()` throws. This helper guarantees the
 * header is set and normalizes the response shape for callers.
 */
export async function submitAction<T = unknown>(
	action: string,
	body?: FormData
): Promise<SubmitOutcome<T>> {
	const response = await fetch(action, {
		method: 'POST',
		headers: { 'x-sveltekit-action': 'true' },
		body: body ?? new FormData()
	});

	let result: ActionResult;
	try {
		result = deserialize(await response.text()) as ActionResult;
	} catch (err) {
		// `deserialize` throws when the response body is not the SvelteKit action
		// wire format (e.g. a proxy/WAF returned HTML, a rate limiter returned
		// plain text, or the body was truncated). Map this to a typed error
		// outcome so callers can rely on the `SubmitOutcome<T>` contract.
		console.error('[submitAction] deserialize failed:', err);
		return { type: 'error', error: { message: 'Something went wrong. Try again.' } };
	}

	if (result.type === 'success') {
		return { type: 'success', data: (result.data ?? {}) as T };
	}
	if (result.type === 'failure') {
		return { type: 'failure', data: (result.data ?? {}) as { error?: string } & Partial<T> };
	}
	if (result.type === 'redirect') {
		return { type: 'redirect', location: result.location };
	}
	return { type: 'error', error: { message: result.error?.message } };
}
