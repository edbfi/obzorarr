<script lang="ts">
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { SettingsActionBar } from '$lib/components/settings/index.js';
import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import {
	documentationForGuide,
	presentReverseProxyDiagnostic,
	REVERSE_PROXY_COPY,
	REVERSE_PROXY_PROVIDER_GUIDES
} from '$lib/copy/reverse-proxy';
import type { ReverseProxyDiagnostic } from '$lib/security/reverse-proxy';
import { toast } from '$lib/services/toast';
import { handleFormToast } from '$lib/utils/form-toast';
import { submitAction } from '$lib/utils/submit-action';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

const security = $derived(data.security);

// svelte-ignore state_referenced_locally
let csrfOriginInput = $state(security.originValue);
let csrfOriginError = $state<string | undefined>(undefined);

let isSavingCsrf = $state(false);
let isTestingCsrf = $state(false);
let isClearingCsrfSkip = $state(false);
let isResetingWarning = $state(false);
let isTogglingTrustProxy = $state(false);
let isConfirmingTrustProxy = $state(false);
let isConfirmingCsrfMismatch = $state(false);

let csrfMismatchDialogOpen = $state(false);
let pendingCsrfOrigin = $state<string | null>(null);
let pendingMismatchMessage = $state('');

let trustProxyConfirmDialogOpen = $state(false);

let diagnostic = $state<ReverseProxyDiagnostic | null>(null);
let diagnosticStatus = $state<'idle' | 'checking' | 'success' | 'failure'>('idle');
let diagnosticError = $state<string | null>(null);
let showDiagnosticDetails = $state(false);
let hasRunInitialDiagnostic = $state(false);
let diagnosticRunToken = 0;
let trustProxyVerificationPending = $state(false);
let copiedGuideId = $state<string | null>(null);

async function runDiagnostic({ userInitiated = false }: { userInitiated?: boolean } = {}) {
	if (diagnosticStatus === 'checking') return;

	const myToken = ++diagnosticRunToken;
	diagnostic = null;
	diagnosticStatus = 'checking';
	diagnosticError = null;

	const formData = new FormData();
	formData.set('browserOrigin', window.location.origin);

	try {
		const result = await submitAction<{
			reverseProxyDiagnostic?: ReverseProxyDiagnostic;
			diagnosticError?: string;
		}>('?/diagnoseReverseProxy', formData);

		if (myToken !== diagnosticRunToken) return;

		if (result.type === 'success') {
			if (result.data.reverseProxyDiagnostic) {
				diagnostic = result.data.reverseProxyDiagnostic;
				diagnosticStatus = 'success';
				if (userInitiated) toast.success('Reverse-proxy diagnostic completed');
			} else {
				diagnosticStatus = 'failure';
				diagnosticError = 'Diagnostic response was incomplete';
				if (userInitiated) toast.error(diagnosticError);
			}
		} else if (result.type === 'failure') {
			diagnosticStatus = 'failure';
			diagnosticError = result.data.diagnosticError ?? 'Diagnostic failed';
			if (userInitiated) toast.error(diagnosticError);
		} else {
			diagnosticStatus = 'failure';
			diagnosticError = 'Unexpected diagnostic response';
			if (userInitiated) toast.error(diagnosticError);
		}
	} catch {
		if (myToken !== diagnosticRunToken) return;
		diagnosticStatus = 'failure';
		diagnosticError = 'Network error while running the diagnostic.';
		if (userInitiated) toast.error(diagnosticError);
	}
}
async function refreshDiagnosticAfterTrustProxyWrite() {
	diagnostic = null;
	diagnosticError = null;
	diagnosticStatus = 'idle';
	trustProxyVerificationPending = true;
	try {
		await invalidateAll();
		await runDiagnostic();
	} catch {
		diagnosticStatus = 'failure';
		diagnosticError = REVERSE_PROXY_COPY.savedUnverified;
	} finally {
		trustProxyVerificationPending = false;
	}
	if (!diagnostic) {
		diagnosticStatus = 'failure';
		diagnosticError = REVERSE_PROXY_COPY.savedUnverified;
	}
}

async function copyGuide(id: string, config: string) {
	try {
		await navigator.clipboard.writeText(config);
		copiedGuideId = id;
	} catch {
		copiedGuideId = `error:${id}`;
	}
}

$effect(() => {
	if (hasRunInitialDiagnostic) return;
	hasRunInitialDiagnostic = true;
	void runDiagnostic();
});

const presentation = $derived(diagnostic ? presentReverseProxyDiagnostic(diagnostic) : null);
const applicableProviderGuides = $derived(
	presentation && presentation.documentationIds.length > 1
		? REVERSE_PROXY_PROVIDER_GUIDES.filter((guide) =>
				presentation.documentationIds.includes(guide.documentationId)
			)
		: []
);
</script>

<svelte:head>
	<title>Security - Settings - Obzorarr</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>CSRF protection</CardTitle>
			<CardDescription>
				Origin check applied to all state-changing requests. Mismatches between this value and the
				browser's Origin header are rejected with 403. Source:
				<strong>{security.originSource}</strong>
				{#if security.originLocked}
					(locked by env)
				{/if}
				.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if !security.originLocked}
				<!-- novalidate defers URL validation to the server so an invalid origin
				     reaches the `?/updateCsrfOrigin` action and `csrfOriginError` can render
				     the field error, instead of the browser silently blocking submit on the
				     type="url" input. Mirrors `openai-settings-form` (connections/+page.svelte:264). -->
				<form
					id="csrf-origin-form"
					novalidate
					method="POST"
					action="?/updateCsrfOrigin"
					use:enhance={({ cancel }) => {
	if (isSavingCsrf) {
		cancel();
		return;
	}
	isSavingCsrf = true;
	csrfOriginError = undefined;
	return async ({ result, update }) => {
		try {
			if (
				result.type === 'failure' &&
				result.data &&
				(result.data as Record<string, unknown>).requireConfirmation
			) {
				const d = result.data as Record<string, unknown>;
				pendingCsrfOrigin = String(d.attemptedOrigin ?? '');
				pendingMismatchMessage = String(d.csrfMismatchMessage ?? '');
				csrfMismatchDialogOpen = true;
				csrfOriginError = undefined;
			} else if (result.type === 'success' || result.type === 'failure') {
				csrfOriginError =
					result.type === 'failure'
						? (result.data as { fieldErrors?: Record<string, string[] | undefined> })?.fieldErrors
								?.csrfOrigin?.[0]
						: undefined;
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') await invalidateAll();
		} finally {
			isSavingCsrf = false;
		}
	};
}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<Label for="csrfOrigin">CSRF origin</Label>
						<Input
							id="csrfOrigin"
							name="csrfOrigin"
							type="url"
							placeholder="https://obzorarr.example.com"
							bind:value={csrfOriginInput}
						/>
						<p class="text-xs text-muted-foreground">
							Leave blank to clear (only allowed when ORIGIN env is set or the skip flag is on).
						</p>
						{#if csrfOriginError}
							<p class="text-xs text-destructive">{csrfOriginError}</p>
						{/if}
					</div>

					<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion}>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">
					The <code>ORIGIN</code> environment variable sets the CSRF origin, so you cannot change it
					here.
				</p>
			{/if}

			<SettingsActionBar>
				<form
					method="POST"
					action="?/testCsrfProtection"
					use:enhance={({ cancel }) => {
	if (isTestingCsrf) {
		cancel();
		return;
	}
	isTestingCsrf = true;
	return async ({ result }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
		} finally {
			isTestingCsrf = false;
		}
	};
}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isTestingCsrf}>
						{isTestingCsrf ? 'Testing…' : 'Test CSRF protection'}
					</Button>
				</form>

				{#if !security.csrfEnabled && !security.originLocked}
					<form
						method="POST"
						action="?/toggleCsrfSkip"
						use:enhance={({ cancel, formData }) => {
	if (isClearingCsrfSkip) {
		cancel();
		return;
	}
	isClearingCsrfSkip = true;
	formData.set('enabled', security.csrfOriginSkipped ? 'false' : 'true');
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') await invalidateAll();
		} finally {
			isClearingCsrfSkip = false;
		}
	};
}}
					>
						<Button
							type="submit"
							variant="outline"
							class="tap-target"
							disabled={isClearingCsrfSkip}
						>
							{security.csrfOriginSkipped ? 'Disable CSRF skip flag' : 'Enable CSRF skip flag'}
						</Button>
					</form>
				{/if}

				{#if security.warningDismissed}
					<form
						method="POST"
						action="?/resetCsrfWarning"
						use:enhance={({ cancel }) => {
	if (isResetingWarning) {
		cancel();
		return;
	}
	isResetingWarning = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') await invalidateAll();
		} finally {
			isResetingWarning = false;
		}
	};
}}
					>
						<Button type="submit" variant="outline" class="tap-target" disabled={isResetingWarning}>
							{isResetingWarning ? 'Resetting…' : 'Re-enable CSRF warning banner'}
						</Button>
					</form>
				{/if}

				{#if !security.originLocked}
					<Button type="submit" form="csrf-origin-form" class="tap-target" disabled={isSavingCsrf}>
						{isSavingCsrf ? 'Saving…' : 'Save CSRF origin'}
					</Button>
				{/if}
			</SettingsActionBar>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>{REVERSE_PROXY_COPY.panelTitle}</CardTitle>
			<CardDescription>
				Controls whether Obzorarr trusts <code>x-forwarded-*</code> headers from your reverse proxy.
				Source:
				<strong>{security.trustProxySource}</strong>
				{#if security.trustProxyLocked}
					(locked by env)
				{/if}
				.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if diagnosticStatus === 'checking' && !diagnostic}
				<div class="status-card neutral" role="status" aria-live="polite" aria-busy="true">
					<LoaderCircleIcon class="size-5 animate-spin status-icon" aria-hidden="true" />
					<div class="status-text">
						<span class="status-headline"
							>{trustProxyVerificationPending ? 'Saved. Verifying…' : 'Checking your connection…'}</span
						>
						<span class="status-body"
							>Comparing what your browser sees with what Obzorarr receives.</span
						>
					</div>
				</div>
			{:else if diagnosticStatus === 'failure' && !diagnostic}
				<div class="status-card warning" role="alert">
					<div class="status-text">
						<span class="status-headline">Could not run the diagnostic</span>
						<span class="status-body">{diagnosticError ?? 'Diagnostic failed'}</span>
					</div>
					<Button
						type="button"
						variant="outline"
						class="tap-target"
						onclick={() => void runDiagnostic({ userInitiated: true })}
					>
						{REVERSE_PROXY_COPY.rerunButton}
					</Button>
				</div>
			{:else if presentation && diagnostic}
				<div
					class="status-card {presentation.tone}"
					role="status"
					aria-live="polite"
					aria-busy="false"
				>
					<div class="status-text">
						<span class="status-headline">{presentation.headline}</span>
						<span class="status-body">{presentation.diagnosis}</span>
						<span class="status-body"><strong>Next action:</strong> {presentation.nextAction}</span>
					</div>
				</div>

				<button
					type="button"
					class="details-toggle"
					onclick={() => (showDiagnosticDetails = !showDiagnosticDetails)}
					aria-expanded={showDiagnosticDetails}
					aria-controls="reverse-proxy-diagnostic-details"
				>
					<span
						>{showDiagnosticDetails ? 'Hide technical details' : 'Show technical details and proxy setup'}</span
					>
					<ChevronDownIcon
						class="size-4 chevron"
						data-open={showDiagnosticDetails}
						aria-hidden="true"
					/>
				</button>

				{#if showDiagnosticDetails}
					<div id="reverse-proxy-diagnostic-details" class="details-panel">
						<div class="diagnostic-facts">
							<div>
								<span class="fact-label">Present headers</span
								><span class="fact-value"
									>{diagnostic.facts.forwardedHeaders.present.length
	? diagnostic.facts.forwardedHeaders.present.join(', ')
	: 'None'}</span
								>
							</div>
							<div>
								<span class="fact-label">Forwarded pair</span
								><span class="fact-value">{presentation.pairLabel}</span>
							</div>
							<div>
								<span class="fact-label">Browser origin</span
								><span class="fact-value"
									>{diagnostic.facts.browserOrigin.origin ?? 'not available'}</span
								>
							</div>
							<div>
								<span class="fact-label">Effective app origin</span
								><span class="fact-value"
									>{diagnostic.facts.origins.effectiveApp ?? 'not available'}</span
								>
							</div>
							<div>
								<span class="fact-label">Forwarded origin</span
								><span class="fact-value"
									>{diagnostic.facts.origins.forwardedPair ?? 'not available'}</span
								>
							</div>
							<div>
								<span class="fact-label">TRUST_PROXY</span
								><span class="fact-value"
									>{diagnostic.facts.trustProxy.enabled ? 'Enabled' : 'Disabled'},
									{diagnostic.facts.trustProxy.source}
									{#if diagnostic.facts.trustProxy.isLocked}
										(locked)
									{/if}</span
								>
							</div>
						</div>
						<p class="safety-note">{presentation.safetyNotice}</p>
						{#if applicableProviderGuides.length > 0}
							<div class="provider-guides">
								<span class="reasons-label">Repair steps by proxy</span>
								{#each applicableProviderGuides as guide}
									<details class="provider-guide">
										<summary>{guide.label}</summary>
										<div class="provider-guide-content">
											<ol>
												{#each guide.steps as step}
													<li>{step}</li>
												{/each}
											</ol>
											{#if guide.config}
												<div class="provider-config">
													<pre><code>{guide.config}</code></pre>
													<Button
														type="button"
														variant="outline"
														class="tap-target"
														onclick={() => void copyGuide(guide.id, guide.config ?? '')}
													>
														Copy configuration
													</Button>
												</div>
												<span class="copy-status" role="status" aria-live="polite">
													{copiedGuideId === guide.id
	? `${guide.label} configuration copied`
	: copiedGuideId === `error:${guide.id}`
		? `Could not copy the ${guide.label} configuration`
		: ''}
												</span>
											{/if}
											<a href={documentationForGuide(guide).url} target="_blank" rel="noreferrer">
												{guide.id === 'other'
	? 'Open Obzorarr configuration guidance'
	: `Open official ${guide.label} documentation`}
											</a>
										</div>
									</details>
								{/each}
							</div>
						{/if}
						<p class="safety-note">
							{presentation.consequence}
							Restart Obzorarr after changing an environment-controlled TRUST_PROXY setting, then
							rerun this diagnostic.
						</p>
						<div class="re-check">
							<Button
								type="button"
								variant="outline"
								class="tap-target"
								onclick={() => void runDiagnostic({ userInitiated: true })}
								disabled={diagnosticStatus === 'checking'}
								aria-busy={diagnosticStatus === 'checking'}
							>
								{diagnosticStatus === 'checking'
	? REVERSE_PROXY_COPY.rerunButtonInProgress
	: REVERSE_PROXY_COPY.rerunButton}
							</Button>
						</div>
					</div>
				{/if}
			{/if}

			{#if security.trustProxyLocked}
				<p class="text-sm text-muted-foreground">
					The <code>TRUST_PROXY</code> environment variable controls header trust, so you cannot
					change it here.
				</p>
			{:else if security.trustProxyValue}
				<form
					method="POST"
					action="?/updateTrustProxy"
					use:enhance={({ cancel }) => {
	if (isTogglingTrustProxy) {
		cancel();
		return;
	}
	isTogglingTrustProxy = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') await refreshDiagnosticAfterTrustProxyWrite();
		} finally {
			isTogglingTrustProxy = false;
		}
	};
}}
				>
					<input type="hidden" name="enabled" value="false">
					<input type="hidden" name="settingsVersion" value={data.trustProxyVersion}>
					<SettingsActionBar>
						<Button
							type="submit"
							variant="destructive"
							class="tap-target"
							disabled={isTogglingTrustProxy}
						>
							{isTogglingTrustProxy ? 'Disabling…' : 'Disable header trust'}
						</Button>
					</SettingsActionBar>
				</form>
			{:else if diagnostic?.action === 'confirm-trust-boundary'}
				<SettingsActionBar>
					<button
						type="button"
						class="enable-header-trust-button tap-target"
						data-testid="enable-header-trust"
						onclick={() => (trustProxyConfirmDialogOpen = true)}
						disabled={isConfirmingTrustProxy}
					>
						Enable header trust
					</button>
				</SettingsActionBar>
			{/if}
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={csrfMismatchDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Save mismatched CSRF origin?</AlertDialog.Title>
			<AlertDialog.Description>
				{pendingMismatchMessage}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isConfirmingCsrfMismatch}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateCsrfOrigin"
				use:enhance={() => {
	isConfirmingCsrfMismatch = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') await invalidateAll();
		} finally {
			isConfirmingCsrfMismatch = false;
			csrfMismatchDialogOpen = false;
			pendingCsrfOrigin = null;
		}
	};
}}
				style="display: contents;"
			>
				<input type="hidden" name="csrfOrigin" value={pendingCsrfOrigin ?? ''}>
				<input type="hidden" name="confirmMismatch" value="true">
				<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion}>
				<AlertDialog.Action type="submit" class="tap-target" disabled={isConfirmingCsrfMismatch}>
					{isConfirmingCsrfMismatch ? 'Saving…' : 'Save anyway'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={trustProxyConfirmDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Enable reverse-proxy header trust?</AlertDialog.Title>
			<AlertDialog.Description>
				Obzorarr will use the upstream proxy's X-Forwarded-Host and X-Forwarded-Proto values for
				effective public URLs. Enable this only when the proxy removes or overwrites
				visitor-supplied forwarding headers; otherwise attackers could spoof the host or protocol
				used for security decisions and generated URLs. Client-IP handling is configured separately
				by the runtime or adapter.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isConfirmingTrustProxy}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateTrustProxy"
				use:enhance={() => {
	isConfirmingTrustProxy = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') await refreshDiagnosticAfterTrustProxyWrite();
		} finally {
			isConfirmingTrustProxy = false;
			trustProxyConfirmDialogOpen = false;
		}
	};
}}
				style="display: contents;"
			>
				<input type="hidden" name="enabled" value="true">
				<input type="hidden" name="confirmRisk" value="true">
				<input type="hidden" name="settingsVersion" value={data.trustProxyVersion}>
				<input
					type="hidden"
					name="browserOrigin"
					value={typeof window !== 'undefined' ? window.location.origin : ''}
				>
				<AlertDialog.Action type="submit" class="tap-target" disabled={isConfirmingTrustProxy}>
					{isConfirmingTrustProxy ? 'Enabling…' : 'Enable header trust'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
/* Plain-button styling for the "Enable header trust" CTA. Uses a
	   native <button> instead of the shadcn Button wrapper so the
	   onclick handler attaches reliably (the wrapper's restProps
	   spread under tailwind-variants composition was dropping clicks
	   on dialog-opener buttons during the ui-overhaul branch). */
.enable-header-trust-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: var(--min-tap-size);
	padding: 0.5rem 1rem;
	font-size: 0.875rem;
	font-weight: 500;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border: 1px solid transparent;
	border-radius: var(--radius);
	cursor: pointer;
	transition: opacity 0.15s ease;
}

.enable-header-trust-button:hover:not(:disabled) {
	opacity: 0.9;
}

.enable-header-trust-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.status-card {
	display: flex;
	align-items: flex-start;
	gap: 0.875rem;
	padding: 0.875rem 1rem;
	border-radius: 10px;
	border: 1px solid oklch(var(--border));
	background: oklch(var(--muted) / 0.4);
}

.status-card.success {
	background: oklch(0.7205 0.192 149.49 / 0.08);
	border-color: oklch(0.7205 0.192 149.49 / 0.25);
}

.status-card.warning {
	background: oklch(0.79 0.1606 79.6 / 0.08);
	border-color: oklch(0.79 0.1606 79.6 / 0.25);
}

.status-card.danger {
	background: oklch(var(--destructive) / 0.08);
	border-color: oklch(var(--destructive) / 0.25);
}

.status-card.neutral {
	background: oklch(var(--muted) / 0.4);
}

:global(.status-icon) {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	margin-top: 0.1rem;
}

.status-card.success :global(.status-icon) {
	color: oklch(0.7205 0.192 149.49);
}

.status-card.warning :global(.status-icon) {
	color: oklch(0.79 0.1606 79.6);
}

.status-card.neutral :global(.status-icon) {
	color: oklch(var(--muted-foreground));
}

.status-text {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	min-width: 0;
}

.status-headline {
	font-size: 0.9rem;
	font-weight: 600;
	color: oklch(var(--foreground));
}

.status-body {
	font-size: 0.825rem;
	line-height: 1.5;
	color: oklch(var(--muted-foreground));
}

.details-toggle {
	align-self: flex-start;
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	background: oklch(var(--background) / 0.3);
	border: 1px solid oklch(var(--border));
	padding: 0.42rem 0.6rem;
	margin: 0;
	font-size: 0.78rem;
	font-weight: 600;
	color: oklch(var(--foreground) / 0.82);
	cursor: pointer;
	border-radius: 999px;
	transition:
		color 0.2s,
		background 0.2s,
		border-color 0.2s;
}

.details-toggle:hover {
	color: oklch(var(--foreground));
	background: oklch(var(--muted) / 0.5);
	border-color: oklch(var(--primary) / 0.4);
}

.details-toggle:focus-visible {
	outline: 2px solid oklch(var(--ring));
	outline-offset: 2px;
}

.details-toggle :global(.chevron) {
	transition: transform 0.2s ease;
}

.details-toggle :global(.chevron[data-open="true"]) {
	transform: rotate(180deg);
}

.details-panel {
	display: flex;
	flex-direction: column;
	gap: 0.875rem;
	padding: 0.875rem 1rem;
	background: oklch(var(--muted) / 0.3);
	border: 1px solid oklch(var(--border));
	border-radius: 10px;
}

.diagnostic-facts {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.6rem;
}

.diagnostic-facts > div {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	min-width: 0;
	padding: 0.6rem 0.7rem;
	background: oklch(var(--background) / 0.6);
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
}

.fact-label {
	font-size: 0.65rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: oklch(var(--muted-foreground));
}

.fact-value {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	min-width: 0;
	font-size: 0.78rem;
	line-height: 1.35;
	color: oklch(var(--foreground));
	overflow-wrap: anywhere;
}

.inline-badge {
	display: inline-flex;
	align-items: center;
	padding: 0.05rem 0.35rem;
	border-radius: 4px;
	background: oklch(0.7205 0.192 149.49 / 0.16);
	border: 1px solid oklch(0.7205 0.192 149.49 / 0.3);
	color: oklch(0.7205 0.192 149.49);
	font-size: 0.6rem;
	font-weight: 700;
	letter-spacing: 0.05em;
}

.reasons-label {
	font-size: 0.7rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: oklch(var(--muted-foreground));
}

.provider-guides {
	display: grid;
	gap: 0.75rem;
}

.provider-guide {
	min-width: 0;
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
}

.provider-guide summary {
	cursor: pointer;
	padding: 0.65rem 0.75rem;
	font-weight: 600;
}

.provider-guide-content {
	display: grid;
	gap: 0.65rem;
	padding: 0 0.75rem 0.75rem;
}

.provider-guides ol {
	margin: 0;
	padding-left: 1.25rem;
	font-size: 0.8rem;
	line-height: 1.5;
}

.provider-config {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.5rem;
	align-items: start;
}

.provider-config pre {
	min-width: 0;
	margin: 0;
	overflow-x: auto;
	padding: 0.6rem;
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
	font-size: 0.75rem;
}

.copy-status {
	min-height: 1.25rem;
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.safety-note {
	margin: 0;
	font-size: 0.78rem;
	line-height: 1.5;
	color: oklch(var(--muted-foreground));
}

.re-check {
	display: flex;
	justify-content: flex-end;
}

@media (max-width: 640px) {
	.diagnostic-facts {
		grid-template-columns: 1fr;
	}
	.provider-config {
		grid-template-columns: 1fr;
	}
}
</style>
