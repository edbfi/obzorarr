import { describe, expect, it, spyOn } from 'bun:test';
import { logger } from '$lib/server/logging';
import { handleError } from '../../src/hooks.server';

// SvelteKit 3 passes every error to handleError as `{ kind, error, event }`.
// App, framework and validation errors carry their own safe status and message:
// they pass through unchanged (the hook returns nothing) and are not logged, as
// routine 404s and caller mistakes must not fill the error channel (ISSUE-009,
// ISSUE-010). Only `unknown` errors are logged at error/[ErrorHandler] and mapped
// to a generic message.

type HandleErrorArgs = Parameters<typeof handleError>[0];

function makeEvent(pathname: string, routeId: string | null): HandleErrorArgs['event'] {
	return {
		route: { id: routeId },
		url: new URL(`http://localhost${pathname}`),
		request: new Request(`http://localhost${pathname}`, { method: 'GET' })
	} as unknown as HandleErrorArgs['event'];
}

function spyLogs() {
	const spies = {
		info: spyOn(logger, 'info').mockImplementation(() => {}),
		warn: spyOn(logger, 'warn').mockImplementation(() => {}),
		error: spyOn(logger, 'error').mockImplementation(() => {})
	};
	return {
		...spies,
		restore() {
			for (const spy of Object.values(spies)) spy.mockRestore();
		}
	};
}

describe('handleError — expected errors pass through unlogged', () => {
	const cases: Array<[string, HandleErrorArgs]> = [
		[
			'framework 404 for an unmatched route (/wrapped/abc)',
			{
				kind: 'framework',
				error: { status: 404, message: 'Not Found' },
				event: makeEvent('/wrapped/abc', null)
			}
		],
		[
			'framework 405',
			{
				kind: 'framework',
				error: { status: 405, message: 'Method Not Allowed' },
				event: makeEvent('/api/sync/status/stream', '/api/sync/status/stream')
			}
		],
		...[400, 403, 404, 422, 500].map((status): [string, HandleErrorArgs] => [
			`app error ${status}`,
			{
				kind: 'app',
				error: { status, message: `app error ${status}` },
				event: makeEvent('/admin/settings', '/admin/settings')
			}
		]),
		[
			'validation error',
			{
				kind: 'validation',
				error: { status: 400, message: 'Bad Request' },
				issues: [{ message: 'expected a string' }],
				event: makeEvent('/admin', '/admin')
			}
		]
	];

	for (const [label, input] of cases) {
		it(`keeps the ${label} unchanged and does not log it`, async () => {
			const logs = spyLogs();
			try {
				expect(await handleError(input)).toBeUndefined();
				expect(logs.info).not.toHaveBeenCalled();
				expect(logs.warn).not.toHaveBeenCalled();
				expect(logs.error).not.toHaveBeenCalled();
			} finally {
				logs.restore();
			}
		});
	}
});

describe('handleError — unknown errors', () => {
	it('logs an unknown error at error/[ErrorHandler] and returns the generic message', async () => {
		const logs = spyLogs();
		try {
			const result = await handleError({
				kind: 'unknown',
				error: new Error('Not found: a record we genuinely failed to load'),
				event: makeEvent('/dashboard', '/dashboard')
			});

			expect(logs.info).not.toHaveBeenCalled();
			expect(logs.error).toHaveBeenCalledTimes(1);
			expect(logs.error.mock.calls[0]?.[1]).toBe('ErrorHandler');
			expect(logs.error.mock.calls[0]?.[2]).toEqual({ route: '/dashboard', method: 'GET' });
			expect(result).toEqual({ message: 'Something went wrong. Try again.' });
		} finally {
			logs.restore();
		}
	});

	it('never returns details of an unknown error', async () => {
		const logs = spyLogs();
		try {
			const result = await handleError({
				kind: 'unknown',
				error: new Error('database password is fake-secret-value'),
				event: makeEvent('/admin', null)
			});

			expect(JSON.stringify(result)).not.toContain('fake-secret-value');
			expect(logs.error.mock.calls[0]?.[2]).toEqual({ route: '<unmatched>', method: 'GET' });
		} finally {
			logs.restore();
		}
	});
});
