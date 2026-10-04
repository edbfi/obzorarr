import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	inlineOccCheck,
	OCC_CONFLICT_MESSAGE,
	settingsVersionISO
} from '$lib/server/admin/occ-helpers';
import {
	AppSettingsKey,
	CSRF_ORIGIN_SETTINGS_KEYS,
	deleteAppSetting,
	getAppSetting,
	getAppSettingsUpdatedAt,
	getCsrfConfigWithSource,
	isCsrfWarningDismissed,
	resetCsrfWarningDismissal,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import { logger } from '$lib/server/logging';
import { env } from '$lib/server/private-env';
import { getOriginFromRequest } from '$lib/server/security/csrf-handle';
import { createReverseProxyDiagnostic } from '$lib/server/security/reverse-proxy-diagnostic';
import type { Actions, PageServerLoad } from './$types';

const MAX_BROWSER_ORIGIN_LENGTH = 2048;

const BrowserOriginSchema = z.object({
	browserOrigin: z
		.string()
		.min(1, 'Browser origin is required')
		.max(MAX_BROWSER_ORIGIN_LENGTH, 'browserOrigin is too long')
		.url('Browser origin is invalid')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Browser origin must start with http:// or https://'
		})
		.transform((url) => new URL(url).origin)
});

function adminRequestOriginMatches(request: Request, browserOrigin: string): boolean {
	const requestOrigin = getOriginFromRequest(request);
	if (!requestOrigin) return false;
	try {
		return new URL(requestOrigin).origin.toLowerCase() === browserOrigin.toLowerCase();
	} catch {
		return false;
	}
}

/**
 * OCC strategy: INLINE `settingsVersion` validated OUTSIDE the schema
 * (clear branch bypasses safeParse). The action handler extracts
 * `settingsVersion` from formData and runs `inlineOccCheck` BEFORE the
 * set/clear branching so blank/stale versions hit the shared 409 path
 * regardless of whether the user is setting or clearing the origin.
 * The actual settingsVersion field is NOT part of this schema.
 */
const CsrfOriginSchema = z.object({
	csrfOrigin: z
		.string()
		.url('Invalid URL format')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Origin must start with http:// or https://'
		})
		.transform((url) => {
			try {
				const parsed = new URL(url);
				return parsed.origin;
			} catch {
				return url;
			}
		})
});

export const load: PageServerLoad = async () => {
	const [csrfConfig, csrfWarningDismissed, csrfOriginSkippedRaw, csrfOriginSettingsUpdatedAt] =
		await Promise.all([
			getCsrfConfigWithSource(),
			isCsrfWarningDismissed(),
			getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED),
			getAppSettingsUpdatedAt(CSRF_ORIGIN_SETTINGS_KEYS)
		]);

	return {
		security: {
			originValue: csrfConfig.origin.value,
			csrfEnabled: !!csrfConfig.origin.value,
			originSource: csrfConfig.origin.source,
			originLocked: csrfConfig.origin.isLocked,
			warningDismissed: csrfWarningDismissed,
			csrfOriginSkipped: csrfOriginSkippedRaw === 'true' && !csrfConfig.origin.value
		},
		csrfOriginVersion: settingsVersionISO(csrfOriginSettingsUpdatedAt)
	};
};

export const actions: Actions = requireAdminActions({
	testCsrfProtection: async () => {
		const csrfConfig = await getCsrfConfigWithSource();
		const originValue = csrfConfig.origin.value;
		if (!originValue) {
			return fail(400, {
				error:
					'CSRF ORIGIN is not configured. Set it via the field above or the ORIGIN environment variable.'
			});
		}
		const sourceLabel = csrfConfig.origin.source === 'db' ? 'database' : 'environment variable';
		return {
			success: true,
			message: `CSRF protection is active. Origin: ${originValue} (from ${sourceLabel})`
		};
	},

	updateCsrfOrigin: async ({ request, url }) => {
		const csrfConfig = await getCsrfConfigWithSource();
		if (csrfConfig.origin.isLocked) {
			return fail(400, {
				error: 'CSRF origin is set via environment variable and cannot be changed here'
			});
		}

		const formData = await request.formData();
		const csrfOrigin = (formData.get('csrfOrigin')?.toString() ?? '').trim();
		const confirmMismatch = formData.get('confirmMismatch')?.toString() === 'true';
		const submittedVersion = formData.get('settingsVersion')?.toString() ?? '';

		// Inline OCC, before the set/clear branching so blank `submittedVersion`
		// (no-cookie / stale tab) still triggers 409 here.
		if ((await inlineOccCheck(submittedVersion, CSRF_ORIGIN_SETTINGS_KEYS)).status === 'conflict') {
			return fail(409, {
				conflict: true,
				error: OCC_CONFLICT_MESSAGE
			});
		}

		if (csrfOrigin) {
			const parsed = CsrfOriginSchema.safeParse({ csrfOrigin });
			if (!parsed.success) {
				return fail(400, {
					error: 'Invalid origin URL',
					fieldErrors: parsed.error.flatten().fieldErrors
				});
			}

			const normalizedOrigin = parsed.data.csrfOrigin;
			const requestOrigin = getOriginFromRequest(request) ?? url.origin;
			const isMismatch = normalizedOrigin.toLowerCase() !== requestOrigin.toLowerCase();

			if (isMismatch && !confirmMismatch) {
				return fail(409, {
					requireConfirmation: true,
					attemptedOrigin: normalizedOrigin,
					requestOrigin,
					csrfMismatchMessage: `Saving "${normalizedOrigin}" while loaded from "${requestOrigin}" will lock THIS browser out of admin POST operations until you reload the admin from "${normalizedOrigin}". To recover, open the admin at "${normalizedOrigin}" and update the CSRF origin again from this same page. No server restart or database edit is required. Confirm to proceed anyway.`
				});
			}

			try {
				await setAppSetting(AppSettingsKey.CSRF_ORIGIN, normalizedOrigin);
				if (isMismatch) {
					return {
						success: true,
						warning: true,
						message: `CSRF origin saved to "${normalizedOrigin}". Your current browser origin is "${requestOrigin}", so you may now be locked out.`
					};
				}
				return { success: true, message: 'CSRF origin updated' };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to update CSRF origin';
				return fail(500, { error: message });
			}
		}

		const csrfSkipFlag = await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
		if (!env.ORIGIN && csrfSkipFlag !== 'true') {
			return fail(400, {
				error:
					'Cannot clear CSRF origin: no ORIGIN environment variable is set and the CSRF skip flag is not enabled. Clearing would lock all admin POST requests (403). Set ORIGIN in your environment or enable the CSRF skip flag first.'
			});
		}
		try {
			await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN);
			const message = env.ORIGIN
				? 'CSRF origin cleared. Obzorarr now uses the ORIGIN environment variable.'
				: 'CSRF origin cleared. CSRF protection is now off. Set the ORIGIN environment variable or add an origin again.';
			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear CSRF origin';
			return fail(500, { error: message });
		}
	},

	toggleCsrfSkip: async ({ request }) => {
		const formData = await request.formData();
		const enabled = formData.get('enabled') === 'true';
		try {
			if (enabled) {
				const csrfConfig = await getCsrfConfigWithSource();
				if (csrfConfig.origin.value) {
					return fail(400, {
						error:
							'CSRF is already enforced by the configured origin; skipping is not needed. Remove the origin first if you truly intend to skip.'
					});
				}
				await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');
				logger.warn('CSRF origin-skip flag enabled by admin', 'Security');
				return {
					success: true,
					message:
						'CSRF origin skip enabled. Origin validation is now relaxed. Set a real ORIGIN when you can.'
				};
			}
			const csrfConfig = await getCsrfConfigWithSource();
			if (!csrfConfig.origin.value) {
				return fail(400, {
					error:
						'Cannot disable CSRF skip while no ORIGIN is configured. Set a CSRF origin first, then disable the skip.'
				});
			}
			await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
			logger.info('CSRF origin-skip flag disabled by admin', 'Security');
			return {
				success: true,
				message: 'CSRF origin skip disabled. Normal origin validation is restored.'
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update CSRF skip setting';
			logger.error(`Failed to toggle CSRF skip: ${message}`, 'Security');
			return fail(500, { error: message });
		}
	},

	resetCsrfWarning: async () => {
		try {
			await resetCsrfWarningDismissal();
			logger.info('CSRF warning re-enabled by admin', 'Security');
			return { success: true, message: 'CSRF warning re-enabled for this user' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to reset CSRF warning';
			logger.error(`Failed to reset CSRF warning: ${message}`, 'Security');
			return fail(500, { error: message });
		}
	},

	diagnoseReverseProxy: async ({ request, url, getClientAddress, setHeaders }) => {
		setHeaders?.({ 'Cache-Control': 'no-store' });
		const formData = await request.formData();
		const parsed = BrowserOriginSchema.safeParse({
			browserOrigin: formData.get('browserOrigin')
		});
		if (!parsed.success) {
			return fail(400, {
				diagnosticError:
					parsed.error.issues[0]?.message ?? 'Could not read the browser origin safely'
			});
		}

		if (!adminRequestOriginMatches(request, parsed.data.browserOrigin)) {
			return fail(403, {
				diagnosticError: 'Reverse-proxy diagnostic must be submitted from this browser origin'
			});
		}

		try {
			const diagnostic = await createReverseProxyDiagnostic({
				request,
				effectiveAppUrl: url,
				browserOrigin: parsed.data.browserOrigin,
				sourceAddress: getClientAddress()
			});
			return { reverseProxyDiagnostic: diagnostic };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown diagnostic error';
			logger.error(`Admin reverse proxy diagnostic failed: ${message}`, 'Security');
			return fail(500, { diagnosticError: 'Could not run reverse proxy diagnostic' });
		}
	}
});
