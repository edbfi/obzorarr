<script lang="ts">
import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import PlayIcon from '@lucide/svelte/icons/play';
import { animate, stagger } from 'motion';
import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import { shouldUseRedirectAuth } from '$lib/client/auth-mode';
import {
	commitRedirectFromPopupBlocked,
	type PlexLoginController,
	startPlexLoginPopup,
	startPlexLoginRedirect
} from '$lib/client/plex-login';
import PopupBlockedModal from '$lib/components/auth/PopupBlockedModal.svelte';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import { toast } from '$lib/services/toast';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

let isOAuthLoading = $state(false);
let isRedirecting = $state(false);
let oauthError = $state<string | null>(null);
let loginController: PlexLoginController | null = null;
let confirmOwnershipChecked = $state(false);

let showPopupBlockedModal = $state(false);
let pendingPinId = $state<number | null>(null);
let pendingAuthUrl = $state<string | null>(null);

// Local optimistic auth state keeps the Plex step responsive while SvelteKit data invalidates.
let localAuthState = $state<{
	isAuthenticated: boolean;
	isAdmin: boolean;
	username: string | null;
} | null>(null);

let servers = $state<
	Array<{
		name: string;
		clientIdentifier: string;
		owned: boolean;
		bestConnectionUrl?: string;
		publicAddress?: string;
		connections?: Array<{ uri: string; local: boolean; relay: boolean }>;
	}>
>([]);
let isLoadingServers = $state(false);
let expandedServer = $state<string | null>(null);
let selectedServer = $state<string | null>(null);
let selectedConnection = $state<string | null>(null);
let isSavingServer = $state(false);
let serverSaved = $state(false);

let showCustomUrl = $state(false);
let customUrl = $state('');
let plexAllowInsecureLocalHttp = $state(false);
let isTestingCustomUrl = $state(false);
let customUrlTestResult = $state<{
	success: boolean;
	serverName?: string;
	error?: string;
} | null>(null);

let iconRef: HTMLElement | undefined = $state();
let contentRef: HTMLElement | undefined = $state();
let animatedElements = new WeakSet<Element>();

$effect(() => {
	if (!iconRef) return;
	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads that TypeScript cannot infer correctly
	const animation = (animate as any)(
		iconRef,
		{
			opacity: [0, 1],
			transform: ['scale(0.8)', 'scale(1)']
		},
		{ duration: 0.5, easing: [0.22, 1, 0.36, 1] }
	);
	return () => animation.stop?.();
});

$effect(() => {
	if (!contentRef) return;

	// Read these values solely to re-run the effect when auth/server UI branches add new items.
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	localAuthState?.isAuthenticated;
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	localAuthState?.isAdmin;
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	data.isAuthenticated;
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	isLoadingServers;
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	servers.length;

	// Wait one frame so branch-created `.animate-item` nodes are in the DOM before querying.
	const rafId = requestAnimationFrame(() => {
		if (!contentRef) return;
		const items = contentRef.querySelectorAll('.animate-item');
		const newItems = Array.from(items).filter((item) => !animatedElements.has(item));

		if (newItems.length === 0) return;

		newItems.forEach((item) => animatedElements.add(item));

		// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads that TypeScript cannot infer correctly
		(animate as any)(
			newItems,
			{ opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] },
			{ duration: 0.4, delay: stagger(0.08), easing: [0.22, 1, 0.36, 1] }
		);
	});

	return () => cancelAnimationFrame(rafId);
});

$effect(() => {
	return () => {
		loginController?.cancel();
		loginController = null;
	};
});

$effect(() => {
	if (browser && localAuthState === null && data.isAuthenticated) {
		localAuthState = {
			isAuthenticated: data.isAuthenticated,
			isAdmin: data.isAdmin,
			username: data.username ?? null
		};
	}
});

$effect(() => {
	if (!browser) return;

	const isAuth = localAuthState?.isAuthenticated ?? data.isAuthenticated;
	const isAdm = localAuthState?.isAdmin ?? data.isAdmin;

	const shouldFetch =
		!data.hasEnvConfig && isAuth && isAdm && servers.length === 0 && !isLoadingServers;

	if (shouldFetch) {
		fetchServers();
	}
});

async function fetchServers() {
	isLoadingServers = true;
	oauthError = null;
	try {
		const response = await fetch('/api/onboarding/servers');
		if (!response.ok) {
			if (response.status === 401) {
				await fetch('/auth/logout', {
					method: 'POST',
					headers: { 'x-sveltekit-action': 'true' },
					body: new FormData()
				});
				await invalidateAll();
				throw new Error('Session expired. Sign in again.');
			}
			const errorData = await response.json().catch(() => ({}));
			throw new Error((errorData as { message?: string }).message || 'Failed to fetch servers');
		}
		const result = await response.json();
		servers = result.servers;
	} catch (err) {
		oauthError = err instanceof Error ? err.message : 'Failed to load servers';
	} finally {
		isLoadingServers = false;
	}
}

async function handlePlexLogin() {
	if (!browser) return;

	oauthError = null;

	const useRedirect = shouldUseRedirectAuth(new URL(window.location.href).searchParams);

	if (useRedirect) {
		loginController?.cancel();
		loginController = null;
		isRedirecting = true;
		await startPlexLoginRedirect({
			context: 'onboarding',
			onError: (message) => {
				isRedirecting = false;
				oauthError = message;
			}
		});
		return;
	}

	isOAuthLoading = true;
	loginController?.cancel();
	loginController = startPlexLoginPopup({
		context: 'onboarding',
		onSuccess: (user) => {
			localAuthState = {
				isAuthenticated: true,
				isAdmin: user.isAdmin,
				username: user.username ?? null
			};
			invalidateAll();
			isOAuthLoading = false;
		},
		onError: (message) => {
			isOAuthLoading = false;
			oauthError = message;
		},
		onPopupBlocked: (pinId, authUrl) => {
			isOAuthLoading = false;
			pendingPinId = pinId;
			pendingAuthUrl = authUrl;
			showPopupBlockedModal = true;
		}
	});
}

function handleContinueWithRedirect(): void {
	if (!pendingPinId || !pendingAuthUrl || !browser) return;

	showPopupBlockedModal = false;
	try {
		commitRedirectFromPopupBlocked(pendingPinId, pendingAuthUrl, 'onboarding');
	} catch (err) {
		oauthError = err instanceof Error ? err.message : 'Could not start the redirect login';
	}
}

function handleCancelRedirect(): void {
	pendingPinId = null;
	pendingAuthUrl = null;
	showPopupBlockedModal = false;
	oauthError = 'Login cancelled. Try enabling popups for this site.';
}

function handleServerExpand(server: (typeof servers)[0]) {
	if (!server.owned) return;

	if (expandedServer === server.clientIdentifier) {
		expandedServer = null;
	} else {
		expandedServer = server.clientIdentifier;
		selectedConnection = null;
	}
}

async function handleConnectionSelect(
	server: (typeof servers)[0],
	connection: { uri: string; local: boolean; relay: boolean }
) {
	if (!server.owned) {
		oauthError = 'Cannot configure a server you do not own.';
		return;
	}

	selectedServer = server.clientIdentifier;
	selectedConnection = connection.uri;
	isSavingServer = true;
	oauthError = null;

	try {
		const response = await fetch('/api/onboarding/select-server', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				serverUrl: connection.uri,
				allowInsecureLocalHttp: plexAllowInsecureLocalHttp,
				clientIdentifier: server.clientIdentifier,
				serverName: server.name
			})
		});

		if (!response.ok) {
			const errData = await response.json().catch(() => ({}));
			throw new Error((errData as { message?: string }).message || 'Failed to save server');
		}

		const result = (await response.json()) as { success: boolean; error?: string };

		if (!result.success) {
			throw new Error(result.error || 'Connection test failed');
		}

		serverSaved = true;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Failed to save server';
		toast.error(errorMessage);
		oauthError = errorMessage;
		selectedServer = null;
		selectedConnection = null;
	} finally {
		isSavingServer = false;
	}
}

function getConnectionInfo(connection: { uri: string; local: boolean; relay: boolean }): {
	label: string;
	type: 'secure' | 'local' | 'remote' | 'relay';
	description: string;
	tooltip?: string;
	isSSL: boolean;
} {
	if (connection.uri.includes('.plex.direct')) {
		return {
			label: 'SSL',
			type: 'secure',
			description: 'Encrypted connection',
			tooltip:
				'This connection uses plex.direct with TLS encryption. Traffic is encrypted in transit, so nobody on the network can read or alter it.',
			isSSL: true
		};
	}
	if (connection.relay) {
		return {
			label: 'Relay',
			type: 'relay',
			description: 'Routed through Plex servers',
			tooltip:
				'Traffic is routed through Plex relay servers. May have higher latency but works when direct connections are unavailable.',
			isSSL: false
		};
	}
	if (connection.local) {
		return {
			label: 'Local',
			type: 'local',
			description: 'Internal network connection',
			tooltip:
				'Connects directly over your local network. Fast and reliable but only works when on the same network as your server.',
			isSSL: false
		};
	}
	return {
		label: 'Remote',
		type: 'remote',
		description: 'Direct external connection',
		tooltip: 'Connects directly to your server over the internet using your public IP address.',
		isSSL: false
	};
}

function sortConnections(
	connections: Array<{ uri: string; local: boolean; relay: boolean }>
): Array<{ uri: string; local: boolean; relay: boolean }> {
	return [...connections].sort((a, b) => {
		const priority = (c: { uri: string; local: boolean; relay: boolean }) => {
			if (c.uri.includes('.plex.direct')) return 0;
			if (!c.local && !c.relay) return 1;
			if (c.local && !c.relay) return 2;
			return 3;
		};
		return priority(a) - priority(b);
	});
}

async function testCustomConnection(server: (typeof servers)[0]) {
	if (!customUrl.trim()) {
		customUrlTestResult = { success: false, error: 'Enter a URL' };
		return;
	}

	try {
		new URL(customUrl);
	} catch {
		customUrlTestResult = { success: false, error: 'Enter a valid URL' };
		return;
	}

	isTestingCustomUrl = true;
	customUrlTestResult = null;
	oauthError = null;

	try {
		const response = await fetch('/api/onboarding/test-connection', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				url: customUrl,
				allowInsecureLocalHttp: plexAllowInsecureLocalHttp,
				clientIdentifier: server.clientIdentifier
			})
		});

		const result = (await response.json()) as {
			success: boolean;
			serverName?: string;
			error?: string;
		};

		customUrlTestResult = result;

		if (result.success) {
			setTimeout(async () => {
				await handleConnectionSelect(server, {
					uri: customUrl,
					local: false,
					relay: false
				});
			}, 500);
		}
	} catch (err) {
		customUrlTestResult = {
			success: false,
			error: err instanceof Error ? err.message : 'Connection test failed'
		};
	} finally {
		isTestingCustomUrl = false;
	}
}

function toggleCustomUrl() {
	showCustomUrl = !showCustomUrl;
	if (!showCustomUrl) {
		customUrl = '';
		plexAllowInsecureLocalHttp = false;
		customUrlTestResult = null;
	}
}

function isHttpUrl(url: string): boolean {
	return url.trim().toLowerCase().startsWith('http://');
}

function isValidUrl(url: string): boolean {
	if (!url.trim()) return false;
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

const effectiveIsAuthenticated = $derived(localAuthState?.isAuthenticated ?? data.isAuthenticated);
const effectiveIsAdmin = $derived(localAuthState?.isAdmin ?? data.isAdmin);
const effectiveUsername = $derived(localAuthState?.username ?? data.username);

// Reflects the explicit `?auth=redirect` opt-in so the UI can show that the
// login mode changed (Safari/iOS popup blockers, AI agents). Reactive to the
// query string so toggling the link updates the badge/button without a reload.
const redirectModeActive = $derived(page.url.searchParams.get('auth') === 'redirect');

const showLoginButton = $derived(!effectiveIsAuthenticated);
const showVerifyButton = $derived(data.hasEnvConfig && effectiveIsAuthenticated);
const showServerSelector = $derived(
	!data.hasEnvConfig && effectiveIsAuthenticated && effectiveIsAdmin
);
const isNonAdminUser = $derived(effectiveIsAuthenticated && !effectiveIsAdmin);
const ownedServers = $derived(servers.filter((s) => s.owned));
const canContinue = $derived(
	(data.hasEnvConfig && data.canProceed) || (!data.hasEnvConfig && serverSaved)
);

const continueDisabledReason = $derived.by(() => {
	if (canContinue) return null;
	if (data.hasEnvConfig) {
		return 'Sign in with Plex above to verify admin access before continuing.';
	}
	if (!effectiveIsAuthenticated) {
		return 'Sign in with Plex above to load your available servers.';
	}
	return 'Select a server connection above to continue.';
});

type MembershipFailureForm = {
	error?: string;
	membershipReason?: 'not_reachable' | 'not_in_resources';
	configuredMachineId?: string;
};
const membershipFailure = $derived<MembershipFailureForm>((form ?? {}) as MembershipFailureForm);

function formatServerUrl(url: string | null): string {
	if (!url) return '';
	try {
		const parsed = new URL(url);
		return `${parsed.hostname}:${parsed.port || '32400'}`;
	} catch {
		return url;
	}
}
</script>

<OnboardingCard
	title="Connect Your Plex Server"
	subtitle="Connect the Plex Media Server that holds your viewing history"
>
	<div class="plex-content" bind:this={contentRef}>
		<div class="plex-icon-wrapper animate-item" bind:this={iconRef}>
			<div class="plex-icon-glow"></div>
			<div class="plex-icon">
				<svg aria-hidden="true" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<linearGradient id="plex-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="#E5A00D" />
							<stop offset="100%" stop-color="#CC8400" />
						</linearGradient>
						<filter id="plex-shadow" x="-50%" y="-50%" width="200%" height="200%">
							<feDropShadow
								dx="0"
								dy="2"
								stdDeviation="3"
								flood-color="#E5A00D"
								flood-opacity="0.4"
							/>
						</filter>
					</defs>
					<rect
						x="4"
						y="4"
						width="40"
						height="40"
						rx="8"
						fill="url(#plex-gradient)"
						filter="url(#plex-shadow)"
					/>
					<path d="M18 14L34 24L18 34V14Z" fill="white" fill-opacity="0.95" />
				</svg>
			</div>
		</div>

		{#if data.hasEnvConfig}
			<div class="preconfigured-card animate-item">
				<div class="preconfigured-icon">
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="3" width="20" height="14" rx="2" />
						<line x1="8" y1="21" x2="16" y2="21" />
						<line x1="12" y1="17" x2="12" y2="21" />
					</svg>
				</div>
				<div class="preconfigured-info">
					<div class="preconfigured-header">
						<span class="preconfigured-title">Plex Media Server</span>
					</div>
					{#if data.plexServerName}
						<span class="preconfigured-server-name">{data.plexServerName}</span>
					{/if}
					{#if data.plexServerUrl || data.plexServerUrlLocked}
						<div class="preconfigured-field-row">
							<span class="preconfigured-field-label">Server URL</span>
							<span class="preconfigured-url">
								{data.plexServerUrlLocked ? '(set by environment)' : formatServerUrl(data.plexServerUrl)}
							</span>
							{#if data.plexServerUrlLocked}
								<span class="preconfigured-badge" role="img" aria-label="Set by environment variable">
									<svg
										class="lock-icon"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										aria-hidden="true"
									>
										<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
										<path d="M7 11V7a5 5 0 0 1 10 0v4" />
									</svg>
									ENV
								</span>
							{/if}
						</div>
					{/if}
					{#if data.plexTokenHasValue || data.plexTokenLocked}
						<div class="preconfigured-field-row">
							<span class="preconfigured-field-label">Token</span>
							<span class="preconfigured-url">{data.plexTokenHasValue ? '••••••••' : '(not set)'}</span>
							{#if data.plexTokenLocked}
								<span class="preconfigured-badge" role="img" aria-label="Set by environment variable">
									<svg
										class="lock-icon"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										aria-hidden="true"
									>
										<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
										<path d="M7 11V7a5 5 0 0 1 10 0v4" />
									</svg>
									ENV
								</span>
							{/if}
						</div>
					{/if}
				</div>
				<div class="preconfigured-check">
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
			</div>

			{#if !data.configuredUrlReachable}
				<div class="error-card animate-item">
					<div class="error-icon">
						<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					</div>
					<div class="error-content">
						<p class="error-title">Cannot reach configured Plex server</p>
						<p class="error-message">
							{data.configuredUrlErrorReason ||
								'Obzorarr could not reach the server at the configured URL.'}
						</p>
						<form method="POST" action="?/forceManualSelection" use:enhance class="error-action-form">
							<SubmitButton class="error-action-btn tap-target">
								{#snippet children()}
									Use a different server
								{/snippet}
							</SubmitButton>
						</form>
					</div>
				</div>
			{/if}

			{#if membershipFailure.membershipReason === 'not_in_resources' && membershipFailure.configuredMachineId}
				<div class="error-card animate-item">
					<div class="error-icon">
						<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					</div>
					<div class="error-content">
						<p class="error-title">Server not listed under your Plex.tv account</p>
						<p class="error-message">
							Obzorarr reached the configured server (machineIdentifier <code
								>{membershipFailure.configuredMachineId}</code
							>), but Plex.tv does not list it under your account's accessible servers.
						</p>
						<label class="override-checkbox">
							<input type="checkbox" bind:checked={confirmOwnershipChecked} />
							<span>I confirm I am the owner of this server (bypasses Plex.tv verification)</span>
						</label>
						<div class="override-actions">
							<form method="POST" action="?/confirmOwnershipOverride" use:enhance>
								<SubmitButton
									class="error-action-btn tap-target"
									disabled={!confirmOwnershipChecked}
								>
									{#snippet children()}
										Continue anyway
									{/snippet}
								</SubmitButton>
							</form>
							<form method="POST" action="?/forceManualSelection" use:enhance>
								<SubmitButton class="error-action-btn secondary tap-target">
									{#snippet children()}
										Use a different server
									{/snippet}
								</SubmitButton>
							</form>
						</div>
					</div>
				</div>
			{/if}

			{#if showLoginButton}
				<div class="action-section animate-item">
					<p class="instruction">Sign in with your Plex account to verify admin access</p>
					<Button
						type="button"
						class="plex-button tap-target"
						onclick={handlePlexLogin}
						disabled={isOAuthLoading || isRedirecting}
						aria-busy={isOAuthLoading || isRedirecting}
					>
						{#if isRedirecting}
							<LoaderCircleIcon class="size-[18px] animate-spin" aria-hidden="true" />
							<span>Redirecting to Plex...</span>
						{:else if isOAuthLoading}
							<LoaderCircleIcon class="size-[18px] animate-spin" aria-hidden="true" />
							<span>Connecting to Plex...</span>
						{:else}
							<PlayIcon class="size-[18px]" fill="currentColor" />
							<span>{redirectModeActive ? 'Sign in with Plex (redirect)' : 'Sign in with Plex'}</span>
						{/if}
					</Button>
					{#if redirectModeActive}
						<div class="redirect-mode-badge" role="status" aria-live="polite">
							<CircleCheckIcon class="size-[14px]" aria-hidden="true" />
							<span>Redirect mode active</span>
						</div>
						<a class="redirect-fallback" href="?auth=popup">
							<span class="redirect-fallback-label">Use popup instead</span>
							<span class="redirect-fallback-hint">Opens Plex sign-in in a new window.</span>
						</a>
					{:else}
						<a class="redirect-fallback" href="?auth=redirect">
							<span class="redirect-fallback-label">Use redirect instead</span>
							<span class="redirect-fallback-hint"
								>Sign-in opens in a popup by default. If it's blocked, switch to a
								same-tab redirect.</span
							>
						</a>
					{/if}
				</div>
			{:else if isNonAdminUser}
				<div class="error-card animate-item">
					<div class="error-icon">
						<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					</div>
					<div class="error-content">
						<p class="error-title">Admin Access Required</p>
						<p class="error-message">
							Only the Plex server owner can configure Obzorarr. Sign in with the owner account.
						</p>
					</div>
				</div>
			{:else}
				<div class="success-card animate-item">
					<div class="success-icon">
						<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</div>
					<div class="success-content">
						<p class="success-title">Signed in as {effectiveUsername}</p>
						<p class="success-message">Admin access verified. Ready to continue.</p>
					</div>
				</div>
			{/if}
		{:else}
			{#if showLoginButton}
				<div class="action-section animate-item">
					<p class="instruction">Sign in with Plex to connect your server</p>
					<Button
						type="button"
						class="plex-button tap-target"
						onclick={handlePlexLogin}
						disabled={isOAuthLoading || isRedirecting}
						aria-busy={isOAuthLoading || isRedirecting}
					>
						{#if isRedirecting}
							<LoaderCircleIcon class="size-[18px] animate-spin" aria-hidden="true" />
							<span>Redirecting to Plex...</span>
						{:else if isOAuthLoading}
							<LoaderCircleIcon class="size-[18px] animate-spin" aria-hidden="true" />
							<span>Connecting to Plex...</span>
						{:else}
							<PlayIcon class="size-[18px]" fill="currentColor" />
							<span>{redirectModeActive ? 'Sign in with Plex (redirect)' : 'Sign in with Plex'}</span>
						{/if}
					</Button>
					{#if redirectModeActive}
						<div class="redirect-mode-badge" role="status" aria-live="polite">
							<CircleCheckIcon class="size-[14px]" aria-hidden="true" />
							<span>Redirect mode active</span>
						</div>
						<a class="redirect-fallback" href="?auth=popup">
							<span class="redirect-fallback-label">Use popup instead</span>
							<span class="redirect-fallback-hint">Opens Plex sign-in in a new window.</span>
						</a>
					{:else}
						<a class="redirect-fallback" href="?auth=redirect">
							<span class="redirect-fallback-label">Use redirect instead</span>
							<span class="redirect-fallback-hint"
								>Sign-in opens in a popup by default. If it's blocked, switch to a
								same-tab redirect.</span
							>
						</a>
					{/if}
				</div>
			{:else if isNonAdminUser}
				<div class="error-card animate-item">
					<div class="error-icon">
						<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					</div>
					<div class="error-content">
						<p class="error-title">Server Owner Required</p>
						<p class="error-message">
							Only a Plex server owner can configure Obzorarr. Sign in with an account that owns a
							server.
						</p>
					</div>
				</div>
			{:else if showServerSelector}
				<div class="server-section animate-item">
					<p class="instruction">Select the Plex server you want to connect</p>

					{#if isLoadingServers}
						<div class="servers-loading">
							<span class="loading-spinner"></span>
							<span>Loading your servers...</span>
						</div>
					{:else if ownedServers.length === 0}
						<div class="no-servers">
							<p>No servers found that you own.</p>
							<p class="no-servers-hint">You must be the owner of a Plex server to use Obzorarr.</p>
						</div>
					{:else}
						<div class="server-list">
							{#each ownedServers as server (server.clientIdentifier)}
								{@const isExpanded = expandedServer === server.clientIdentifier}
								{@const isSelected = selectedServer === server.clientIdentifier}
								{@const connections = server.connections ? sortConnections(server.connections) : []}
								<div class="server-item" class:expanded={isExpanded}>
									<button
										type="button"
										class="server-card"
										class:expanded={isExpanded}
										class:selected={isSelected && serverSaved}
										onclick={() => handleServerExpand(server)}
										disabled={isSavingServer}
									>
										<div class="server-icon">
											<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
												<rect x="2" y="3" width="20" height="14" rx="2" />
												<line x1="8" y1="21" x2="16" y2="21" />
												<line x1="12" y1="17" x2="12" y2="21" />
											</svg>
										</div>
										<div class="server-info">
											<span class="server-name">{server.name}</span>
											<span class="server-badge owner">Owner</span>
											{#if !isExpanded && !(isSelected && serverSaved)}
												<span class="server-hint">Click to select a connection</span>
											{/if}
										</div>
										{#if isSelected && serverSaved}
											<div class="server-check">
												<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
													<path
														d="M20 6L9 17l-5-5"
														stroke-linecap="round"
														stroke-linejoin="round"
													/>
												</svg>
											</div>
										{:else}
											<div class="server-expand" class:rotated={isExpanded}>
												<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
												</svg>
											</div>
										{/if}
									</button>

									{#if isExpanded && connections.length > 0}
										<div class="connections-panel">
											<p class="connections-label">Select a connection</p>
											{#if connections.some((connection) => isHttpUrl(connection.uri))}
												<label class="insecure-http-toggle">
													<input
														type="checkbox"
														bind:checked={plexAllowInsecureLocalHttp}
														disabled={isSavingServer}
													/>
													<span>Allow insecure local HTTP Plex connection</span>
												</label>
											{/if}
											<Tooltip.Provider>
												<div class="connections-list">
													{#each connections as connection (connection.uri)}
														{@const info = getConnectionInfo(connection)}
														{@const isConnSelected = selectedConnection === connection.uri}
														<button
															type="button"
															class="connection-card"
															class:selected={isConnSelected}
															class:saving={isSavingServer && isConnSelected}
															class:ssl={info.isSSL}
															onclick={(e) => {
																e.stopPropagation();
																handleConnectionSelect(server, connection);
															}}
															disabled={isSavingServer}
														>
															<div class="connection-info">
																<div class="connection-header">
																	<Tooltip.Root>
																		<Tooltip.Trigger>
																			{#snippet child({ props })}
																				<span {...props} class="connection-badge {info.type}">
																					{#if info.isSSL}
																						<svg
																							class="ssl-lock-icon"
																							viewBox="0 0 24 24"
																							fill="none"
																							stroke="currentColor"
																							stroke-width="2.5"
																							aria-hidden="true"
																						>
																							<rect
																								x="3"
																								y="11"
																								width="18"
																								height="11"
																								rx="2"
																								ry="2"
																							/>
																							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
																						</svg>
																					{/if}
																					{info.label}
																				</span>
																			{/snippet}
																		</Tooltip.Trigger>
																		<Tooltip.Content
																			side="top"
																			class="connection-tooltip"
																			sideOffset={8}
																			collisionPadding={16}
																			portalProps={{ to: 'body' }}
																		>
																			<div class="tooltip-inner">
																				{#if info.isSSL}
																					<div class="tooltip-header ssl">
																						<svg aria-hidden="true"
																							class="tooltip-icon"
																							viewBox="0 0 24 24"
																							fill="none"
																							stroke="currentColor"
																							stroke-width="2"
																						>
																							<path
																								d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
																								fill="currentColor"
																								fill-opacity="0.2"
																							/>
																							<path
																								d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
																							/>
																						</svg>
																						<strong>Secure Connection</strong>
																					</div>
																				{:else}
																					<strong class="tooltip-title"
																						>{info.label} Connection</strong
																					>
																				{/if}
																				<p class="tooltip-text">{info.tooltip}</p>
																			</div>
																		</Tooltip.Content>
																	</Tooltip.Root>
																	<span class="connection-desc">{info.description}</span>
																</div>
																<span class="connection-uri">{formatServerUrl(connection.uri)}</span
																>
															</div>
															{#if isConnSelected}
																<div class="connection-check">
																	{#if isSavingServer}
																		<span class="check-spinner"></span>
																	{:else}
																		<svg aria-hidden="true"
																			viewBox="0 0 24 24"
																			fill="none"
																			stroke="currentColor"
																			stroke-width="3"
																		>
																			<path
																				d="M20 6L9 17l-5-5"
																				stroke-linecap="round"
																				stroke-linejoin="round"
																			/>
																		</svg>
																	{/if}
																</div>
															{/if}
														</button>
													{/each}
												</div>
											</Tooltip.Provider>
										</div>
									{:else if isExpanded}
										<div class="connections-panel">
											<p class="no-connections">No connections available for this server.</p>
										</div>
									{/if}

									{#if isExpanded && !serverSaved}
										<div class="custom-url-section">
											<div class="custom-url-divider">
												<span>or</span>
											</div>

											<button
												type="button"
												class="custom-url-toggle"
												class:expanded={showCustomUrl}
												onclick={toggleCustomUrl}
												disabled={isSavingServer || isTestingCustomUrl}
											>
												<span>Enter a custom URL for a reverse proxy</span>
												<svg aria-hidden="true"
													class="toggle-chevron"
													class:rotated={showCustomUrl}
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
												</svg>
											</button>

											{#if showCustomUrl}
												<div class="custom-url-form">
													<p class="custom-url-help" id="custom-url-help">
														Enter your reverse proxy URL (e.g., https://plex.yourdomain.com)
													</p>

													<div class="custom-url-input-row">
														<input
															type="url"
															class="custom-url-input"
															class:error={customUrlTestResult?.success === false}
															placeholder="https://plex.yourdomain.com"
															bind:value={customUrl}
															disabled={isTestingCustomUrl || isSavingServer}
															aria-label="Custom Plex server URL"
															aria-describedby="custom-url-help"
														/>
														<Button
															type="button"
															class="custom-url-test-btn tap-target"
															onclick={() => testCustomConnection(server)}
															disabled={!isValidUrl(customUrl) ||
																isTestingCustomUrl ||
																isSavingServer}
															aria-busy={isTestingCustomUrl}
														>
															{#if isTestingCustomUrl}
																<LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" />
																<span>Testing...</span>
															{:else}
																<CircleCheckIcon class="size-4" />
																<span>Test Connection</span>
															{/if}
														</Button>
													</div>

													{#if isHttpUrl(customUrl)}
														<label class="insecure-http-toggle custom">
															<input
																type="checkbox"
																bind:checked={plexAllowInsecureLocalHttp}
																disabled={isTestingCustomUrl || isSavingServer}
															/>
															<span>Allow insecure local HTTP Plex connection</span>
														</label>
													{/if}

													{#if customUrlTestResult}
														<div
															class="custom-url-status"
															class:success={customUrlTestResult.success}
															class:error={!customUrlTestResult.success}
															role="status"
															aria-live="polite"
														>
															{#if customUrlTestResult.success}
																<svg aria-hidden="true"
																	class="status-icon"
																	viewBox="0 0 24 24"
																	fill="none"
																	stroke="currentColor"
																	stroke-width="2.5"
																>
																	<path
																		d="M20 6L9 17l-5-5"
																		stroke-linecap="round"
																		stroke-linejoin="round"
																	/>
																</svg>
																<span
																	>Connected to {customUrlTestResult.serverName ||
																		'Plex Server'}</span
																>
															{:else}
																<svg aria-hidden="true"
																	class="status-icon"
																	viewBox="0 0 24 24"
																	fill="none"
																	stroke="currentColor"
																	stroke-width="2"
																>
																	<circle cx="12" cy="12" r="10" />
																	<line x1="15" y1="9" x2="9" y2="15" />
																	<line x1="9" y1="9" x2="15" y2="15" />
																</svg>
																<span>{customUrlTestResult.error}</span>
															{/if}
														</div>
													{/if}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}

		{#if oauthError || form?.error}
			<div class="error-banner animate-item">
				<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
				<span>{oauthError || form?.error}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<form method="POST" action="?/goBack" use:enhance class="mr-auto">
			<Button type="submit" variant="outline" class="tap-target">
				<ArrowLeftIcon class="size-[18px]" />
				Previous
			</Button>
		</form>
		{#if data.hasEnvConfig && data.canProceed}
			<form method="POST" action="?/verifyAdmin" use:enhance>
				<SubmitButton class="continue-button tap-target">
					{#snippet children()}
						<span>Continue</span>
						<ArrowRightIcon class="size-[18px]" strokeWidth={2.5} />
					{/snippet}
				</SubmitButton>
			</form>
		{:else if !data.hasEnvConfig && serverSaved}
			<form method="POST" action="?/continueAfterServerSelection" use:enhance>
				<SubmitButton class="continue-button tap-target">
					{#snippet children()}
						<span>Continue</span>
						<ArrowRightIcon class="size-[18px]" strokeWidth={2.5} />
					{/snippet}
				</SubmitButton>
			</form>
		{:else}
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<span {...props} class="continue-disabled-wrapper">
								<Button type="button" class="continue-button tap-target" disabled>
									<span>Continue</span>
									<ArrowRightIcon class="size-[18px]" strokeWidth={2.5} />
								</Button>
							</span>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content
						side="top"
						class="continue-tooltip"
						sideOffset={8}
						collisionPadding={16}
						portalProps={{ to: 'body' }}
					>
						<span>{continueDisabledReason}</span>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		{/if}
	{/snippet}
</OnboardingCard>

<PopupBlockedModal
	bind:open={showPopupBlockedModal}
	onContinue={handleContinueWithRedirect}
	onCancel={handleCancelRedirect}
/>

<style>
	.plex-content {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 1.5rem;
		}

		.animate-item {
			opacity: 0;
		}

		.plex-icon-wrapper {
			position: relative;
			width: 72px;
			height: 72px;
		}

		.plex-icon-glow {
			position: absolute;
			inset: -8px;
			background: radial-gradient(circle, oklch(var(--primary) / 0.4) 0%, transparent 70%);
			border-radius: 50%;
			animation: icon-pulse 3s ease-in-out infinite;
		}

		@keyframes icon-pulse {
			0%,
			100% {
				opacity: 0.6;
				transform: scale(1);
			}
			50% {
				opacity: 0.8;
				transform: scale(1.05);
			}
		}

		.plex-icon {
			position: relative;
			width: 100%;
			height: 100%;
		}

		.plex-icon svg {
			width: 100%;
			height: 100%;
		}

		.preconfigured-card {
			display: flex;
			align-items: center;
			gap: 1rem;
			padding: 1.125rem 1.25rem;
			background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%);
			border: 1px solid rgba(34, 197, 94, 0.25);
			border-radius: 14px;
			width: 100%;
			position: relative;
			overflow: hidden;
		}

		.preconfigured-card::before {
			content: '';
			position: absolute;
			inset: 0;
			background: radial-gradient(ellipse at top left, rgba(34, 197, 94, 0.1) 0%, transparent 50%);
			pointer-events: none;
		}

		.preconfigured-icon {
			flex-shrink: 0;
			width: 44px;
			height: 44px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: rgba(34, 197, 94, 0.12);
			border-radius: 11px;
			color: oklch(0.7946 0.1951 150.81);
			position: relative;
		}

		.preconfigured-icon svg {
			width: 24px;
			height: 24px;
		}

		.preconfigured-info {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
			min-width: 0;
		}

		.preconfigured-header {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			flex-wrap: wrap;
		}

		.preconfigured-title {
			font-size: 0.95rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.95);
		}

		.preconfigured-server-name {
			font-size: 0.875rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.7);
		}

		.preconfigured-field-row {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			flex-wrap: wrap;
		}

		.preconfigured-field-label {
			font-size: 0.75rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.45);
			text-transform: uppercase;
			letter-spacing: 0.04em;
			flex-shrink: 0;
		}

		.preconfigured-badge {
			display: inline-flex;
			align-items: center;
			gap: 0.3rem;
			padding: 0.2rem 0.5rem;
			font-size: 0.65rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			background: rgba(34, 197, 94, 0.2);
			color: oklch(0.8116 0.1789 152.1);
			border-radius: 5px;
			border: 1px solid rgba(34, 197, 94, 0.3);
		}

		.preconfigured-badge .lock-icon {
			width: 10px;
			height: 10px;
		}

		.preconfigured-url {
			font-size: 0.8rem;
			color: rgba(255, 255, 255, 0.45);
			font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
			letter-spacing: -0.01em;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.preconfigured-check {
			flex-shrink: 0;
			width: 28px;
			height: 28px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: rgba(34, 197, 94, 0.15);
			border-radius: 50%;
			color: oklch(0.7946 0.1951 150.81);
		}

		.preconfigured-check svg {
			width: 15px;
			height: 15px;
		}

		.action-section {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 1rem;
			width: 100%;
		}

		.instruction {
			margin: 0;
			font-size: 0.95rem;
			color: rgba(255, 255, 255, 0.6);
			text-align: center;
		}

		/* shadcn Button child-renders the actual <button>, so the OAuth CTA
		   selector must be global for the gradient, layered shadows, and
		   hover/active transforms to reach it. Icons stay sized inline to avoid
		   another descendant override across the scoped-style boundary. */
		:global(.plex-button) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.75rem;
			padding: 0.875rem 2rem;
			min-width: 220px;
			font-size: 1rem;
			font-weight: 600;
			color: oklch(0.2198 0.0126 67.09);
			background: linear-gradient(135deg, #e5a00d 0%, #cc8400 100%);
			border: none;
			border-radius: 12px;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
			box-shadow:
				0 4px 16px rgba(229, 160, 13, 0.35),
				0 2px 4px rgba(0, 0, 0, 0.2),
				inset 0 1px 0 rgba(255, 255, 255, 0.25);
		}

		:global(.plex-button:hover:not(:disabled)) {
			transform: translateY(-2px);
			box-shadow:
				0 6px 24px rgba(229, 160, 13, 0.45),
				0 4px 8px rgba(0, 0, 0, 0.25),
				inset 0 1px 0 rgba(255, 255, 255, 0.3);
		}

		:global(.plex-button:active:not(:disabled)) {
			transform: translateY(0);
		}

		:global(.plex-button:disabled) {
			opacity: 0.85;
			cursor: not-allowed;
		}

		.button-spinner {
			width: 18px;
			height: 18px;
			border: 2px solid rgba(0, 0, 0, 0.2);
			border-top-color: rgba(0, 0, 0, 0.7);
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		.redirect-mode-badge {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			margin-top: 0.5rem;
			padding: 0.3rem 0.7rem;
			font-size: 0.78rem;
			font-weight: 600;
			color: oklch(0.8116 0.1789 152.1);
			background: rgba(34, 197, 94, 0.12);
			border: 1px solid rgba(34, 197, 94, 0.3);
			border-radius: 999px;
		}

		.redirect-fallback {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.15rem;
			margin-top: 0.75rem;
			text-decoration: none;
			transition: color 0.2s ease;
		}

		.redirect-fallback-label {
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.55);
			text-decoration: underline;
			text-underline-offset: 3px;
		}

		.redirect-fallback-hint {
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.4);
		}

		.redirect-fallback:hover .redirect-fallback-label,
		.redirect-fallback:focus-visible .redirect-fallback-label {
			color: rgba(255, 255, 255, 0.85);
		}

		.success-card {
			display: flex;
			align-items: flex-start;
			gap: 1rem;
			padding: 1rem 1.25rem;
			background: rgba(34, 197, 94, 0.1);
			border: 1px solid rgba(34, 197, 94, 0.25);
			border-radius: 12px;
			width: 100%;
		}

		.success-icon {
			flex-shrink: 0;
			width: 24px;
			height: 24px;
			color: oklch(0.7946 0.1951 150.81);
		}

		.success-icon svg {
			width: 100%;
			height: 100%;
		}

		.success-content {
			flex: 1;
		}

		.success-title {
			margin: 0;
			font-size: 0.95rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.95);
		}

		.success-message {
			margin: 0.25rem 0 0;
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.55);
		}

		.error-card {
			display: flex;
			align-items: flex-start;
			gap: 1rem;
			padding: 1rem 1.25rem;
			background: rgba(239, 68, 68, 0.1);
			border: 1px solid rgba(239, 68, 68, 0.25);
			border-radius: 12px;
			width: 100%;
		}

		.error-icon {
			flex-shrink: 0;
			width: 24px;
			height: 24px;
			color: oklch(0.6356 0.2082 25.38);
		}

		.error-icon svg {
			width: 100%;
			height: 100%;
		}

		.error-content {
			flex: 1;
		}

		.error-title {
			margin: 0;
			font-size: 0.95rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.95);
		}

		.error-message {
			margin: 0.25rem 0 0;
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.55);
			line-height: 1.5;
		}

		.error-message code {
			font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
			font-size: 0.8rem;
			background: rgba(255, 255, 255, 0.06);
			padding: 0.1rem 0.3rem;
			border-radius: 4px;
			color: rgba(255, 255, 255, 0.8);
		}

		.error-action-form {
			margin-top: 0.75rem;
		}

		/* SubmitButton child-renders the real <button>, so error-action palettes
		   and the secondary modifier must be hoisted. */
		:global(.error-action-btn) {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			padding: 0.5rem 0.875rem;
			font-size: 0.85rem;
			font-weight: 500;
			color: oklch(0.7052 0.1587 21.97);
			background: rgba(239, 68, 68, 0.1);
			border: 1px solid rgba(239, 68, 68, 0.3);
			border-radius: 8px;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		:global(.error-action-btn:hover:not(:disabled)) {
			background: rgba(239, 68, 68, 0.18);
			border-color: rgba(239, 68, 68, 0.5);
		}

		:global(.error-action-btn:disabled) {
			opacity: 0.4;
			cursor: not-allowed;
		}

		:global(.error-action-btn.secondary) {
			color: rgba(255, 255, 255, 0.7);
			background: rgba(255, 255, 255, 0.04);
			border-color: rgba(255, 255, 255, 0.12);
		}

		:global(.error-action-btn.secondary:hover:not(:disabled)) {
			background: rgba(255, 255, 255, 0.08);
			border-color: rgba(255, 255, 255, 0.2);
		}

		.override-checkbox {
			display: flex;
			align-items: flex-start;
			gap: 0.5rem;
			margin-top: 0.75rem;
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.75);
			cursor: pointer;
			line-height: 1.4;
		}

		.override-checkbox input[type='checkbox'] {
			margin-top: 0.15rem;
			flex-shrink: 0;
			accent-color: oklch(var(--primary));
		}

		.override-actions {
			display: flex;
			gap: 0.5rem;
			margin-top: 0.75rem;
			flex-wrap: wrap;
		}

		.server-section {
			width: 100%;
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}

		.servers-loading {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.75rem;
			padding: 2rem;
			color: rgba(255, 255, 255, 0.6);
			font-size: 0.9rem;
		}

		.loading-spinner {
			width: 20px;
			height: 20px;
			border: 2px solid rgba(255, 255, 255, 0.2);
			border-top-color: oklch(var(--primary));
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		.no-servers {
			text-align: center;
			padding: 1.5rem;
			color: rgba(255, 255, 255, 0.6);
		}

		.no-servers p {
			margin: 0;
		}

		.no-servers-hint {
			margin-top: 0.5rem !important;
			font-size: 0.85rem;
			opacity: 0.7;
		}

		.server-list {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
		}

		.server-item {
			display: flex;
			flex-direction: column;
		}

		.server-card {
			display: flex;
			align-items: center;
			gap: 1rem;
			padding: 1rem 1.25rem;
			background: rgba(255, 255, 255, 0.03);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 12px;
			cursor: pointer;
			transition: all 0.2s ease;
			text-align: left;
			width: 100%;
		}

		.server-card.expanded {
			border-radius: 12px 12px 0 0;
			border-bottom-color: transparent;
		}

		.server-card:hover:not(:disabled) {
			background: rgba(255, 255, 255, 0.06);
			border-color: rgba(255, 255, 255, 0.12);
		}

		.server-card.expanded:hover:not(:disabled) {
			border-bottom-color: transparent;
		}

		.server-card.selected {
			background: oklch(var(--primary) / 0.1);
			border-color: oklch(var(--primary) / 0.4);
			box-shadow: 0 0 0 1px oklch(var(--primary) / 0.2);
		}

		.server-card:disabled {
			opacity: 0.7;
			cursor: not-allowed;
		}

		.server-icon {
			flex-shrink: 0;
			width: 40px;
			height: 40px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: rgba(255, 255, 255, 0.05);
			border-radius: 10px;
			color: rgba(255, 255, 255, 0.7);
		}

		.server-icon svg {
			width: 22px;
			height: 22px;
		}

		.server-info {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
		}

		.server-name {
			font-size: 0.95rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.95);
		}

		.server-badge {
			display: inline-flex;
			align-items: center;
			width: fit-content;
			padding: 0.2rem 0.5rem;
			font-size: 0.7rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			border-radius: 4px;
		}

		.server-badge.owner {
			background: oklch(var(--primary) / 0.15);
			color: oklch(var(--primary));
		}

		.server-hint {
			font-size: 0.72rem;
			color: rgba(255, 255, 255, 0.45);
			font-style: italic;
		}

		.continue-disabled-wrapper {
			display: inline-flex;
		}

		:global(.continue-tooltip) {
			z-index: 9999;
			max-width: 220px;
			padding: 0.5rem 0.7rem;
			font-size: 0.78rem;
			line-height: 1.4;
			color: rgba(255, 255, 255, 0.92);
			background: oklch(0.2267 0 0);
			border: 1px solid oklch(0.3008 0 0);
			border-radius: 8px;
			box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
		}

		.server-check {
			flex-shrink: 0;
			width: 24px;
			height: 24px;
			color: oklch(var(--primary));
		}

		.server-check svg {
			width: 100%;
			height: 100%;
		}

		.server-expand {
			flex-shrink: 0;
			width: 24px;
			height: 24px;
			color: rgba(255, 255, 255, 0.4);
			transition: transform 0.2s ease;
		}

		.server-expand.rotated {
			transform: rotate(180deg);
		}

		.server-expand svg {
			width: 100%;
			height: 100%;
		}

		.check-spinner {
			display: block;
			width: 20px;
			height: 20px;
			border: 2px solid oklch(var(--primary) / 0.3);
			border-top-color: oklch(var(--primary));
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		.connections-panel {
			background: rgba(255, 255, 255, 0.02);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-top: none;
			border-radius: 0 0 12px 12px;
			padding: 1rem;
		}

		.connections-label {
			margin: 0 0 0.75rem;
			font-size: 0.8rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.5);
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.insecure-http-toggle {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			margin: 0 0 0.875rem;
			font-size: 0.8125rem;
			color: rgba(255, 255, 255, 0.78);
		}

		.insecure-http-toggle.custom {
			margin: 0.75rem 0 0;
		}

		.insecure-http-toggle input {
			width: 1rem;
			height: 1rem;
			accent-color: oklch(var(--primary));
		}

		.connections-list {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		.connection-card {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.75rem 1rem;
			background: rgba(255, 255, 255, 0.03);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 8px;
			cursor: pointer;
			transition: all 0.15s ease;
			text-align: left;
			width: 100%;
		}

		.connection-card:hover:not(:disabled) {
			background: rgba(255, 255, 255, 0.06);
			border-color: rgba(255, 255, 255, 0.1);
		}

		.connection-card.selected {
			background: rgba(34, 197, 94, 0.1);
			border-color: rgba(34, 197, 94, 0.4);
		}

		.connection-card:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}

		.connection-info {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
			min-width: 0;
		}

		.connection-header {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.connection-badge {
			display: inline-flex;
			align-items: center;
			gap: 0.25rem;
			padding: 0.15rem 0.4rem;
			font-size: 0.65rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			border-radius: 4px;
			cursor: help;
			transition: all 0.15s ease;
		}

		.connection-badge:hover {
			filter: brightness(1.15);
		}

		.connection-badge.secure {
			background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%);
			color: oklch(0.7946 0.1951 150.81);
			border: 1px solid rgba(34, 197, 94, 0.3);
			box-shadow:
				0 0 8px rgba(34, 197, 94, 0.15),
				inset 0 1px 0 rgba(255, 255, 255, 0.1);
		}

		.connection-badge.secure:hover {
			box-shadow:
				0 0 12px rgba(34, 197, 94, 0.25),
				inset 0 1px 0 rgba(255, 255, 255, 0.15);
		}

		.ssl-lock-icon {
			width: 10px;
			height: 10px;
			flex-shrink: 0;
		}

		.connection-badge.local {
			background: rgba(59, 130, 246, 0.15);
			color: oklch(0.6261 0.1859 259.6);
		}

		.connection-badge.remote {
			background: rgba(168, 85, 247, 0.15);
			color: oklch(0.6268 0.2332 304.11);
		}

		.connection-badge.relay {
			background: rgba(251, 191, 36, 0.15);
			color: oklch(0.8334 0.1641 83.87);
		}

		.connection-desc {
			font-size: 0.75rem;
			color: rgba(255, 255, 255, 0.45);
		}

		.connection-uri {
			font-size: 0.8rem;
			font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
			color: rgba(255, 255, 255, 0.6);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.connection-check {
			flex-shrink: 0;
			width: 20px;
			height: 20px;
			color: oklch(0.7946 0.1951 150.81);
		}

		.connection-check svg {
			width: 100%;
			height: 100%;
		}

		.no-connections {
			margin: 0;
			padding: 0.5rem;
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.5);
			text-align: center;
		}

		.error-banner {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.875rem 1rem;
			background: rgba(239, 68, 68, 0.15);
			border: 1px solid rgba(239, 68, 68, 0.3);
			border-radius: 10px;
			width: 100%;
			font-size: 0.875rem;
			color: oklch(0.7052 0.1587 21.97);
		}

		.error-banner svg {
			flex-shrink: 0;
			width: 18px;
			height: 18px;
		}

		/* SubmitButton + Button render the actual <button> inside child
		   components, so this selector must be global for the primary palette,
		   hover translate-y, and dual shadow to reach it. The icon stays sized
		   inline to avoid another descendant override across the scoped-style
		   boundary. */
		:global(.continue-button) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.75rem 1.5rem;
			font-size: 0.95rem;
			font-weight: 600;
			color: oklch(var(--primary-foreground));
			background: oklch(var(--primary));
			border: none;
			border-radius: 10px;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
			box-shadow:
				0 2px 12px oklch(var(--primary) / 0.3),
				inset 0 1px 0 rgba(255, 255, 255, 0.2);
		}

		:global(.continue-button:hover:not(:disabled)) {
			transform: translateY(-1px);
			box-shadow:
				0 4px 16px oklch(var(--primary) / 0.4),
				inset 0 1px 0 rgba(255, 255, 255, 0.25);
		}

		:global(.continue-button:disabled) {
			opacity: 0.4;
			cursor: not-allowed;
			transform: none;
			box-shadow: none;
		}

		.connection-card.ssl {
			background: linear-gradient(135deg, rgba(34, 197, 94, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%);
			border-color: rgba(34, 197, 94, 0.15);
		}

		.connection-card.ssl:hover:not(:disabled) {
			background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(255, 255, 255, 0.06) 100%);
			border-color: rgba(34, 197, 94, 0.25);
		}

		.connection-card.ssl.selected {
			background: rgba(34, 197, 94, 0.12);
			border-color: rgba(34, 197, 94, 0.5);
			box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.2);
		}

		/* bits-ui writes `z-index: auto` inline on tooltip portals; use
		   !important so tooltips can rise above the onboarding card. */
		:global([id^='bits-']:has(.connection-tooltip)) {
			z-index: 100 !important;
		}

		:global(.connection-tooltip) {
			background: rgba(15, 23, 42, 0.95);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 10px;
			padding: 0;
			max-width: 280px;
			box-shadow:
				0 8px 32px rgba(0, 0, 0, 0.4),
				0 2px 8px rgba(0, 0, 0, 0.2);
		}

		.tooltip-inner {
			padding: 0.75rem 1rem;
		}

		.tooltip-header {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			margin-bottom: 0.5rem;
		}

		.tooltip-header.ssl {
			color: oklch(0.7946 0.1951 150.81);
		}

		.tooltip-header strong {
			font-size: 0.85rem;
			font-weight: 600;
		}

		.tooltip-icon {
			width: 16px;
			height: 16px;
			flex-shrink: 0;
		}

		.tooltip-title {
			display: block;
			font-size: 0.85rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.95);
			margin-bottom: 0.375rem;
		}

		.tooltip-text {
			margin: 0;
			font-size: 0.8rem;
			line-height: 1.5;
			color: rgba(255, 255, 255, 0.7);
		}

		.custom-url-section {
			padding: 0 1rem 1rem;
			margin-top: -0.5rem;
		}

		.custom-url-divider {
			display: flex;
			align-items: center;
			gap: 1rem;
			margin: 0.75rem 0;
			color: rgba(255, 255, 255, 0.35);
			font-size: 0.75rem;
			text-transform: uppercase;
			letter-spacing: 0.1em;
		}

		.custom-url-divider::before,
		.custom-url-divider::after {
			content: '';
			flex: 1;
			height: 1px;
			background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
		}

		.custom-url-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			width: 100%;
			padding: 0.625rem 1rem;
			background: transparent;
			border: none;
			color: rgba(255, 255, 255, 0.5);
			font-size: 0.85rem;
			cursor: pointer;
			transition: color 0.2s ease;
		}

		.custom-url-toggle:hover:not(:disabled) {
			color: rgba(255, 255, 255, 0.7);
		}

		.custom-url-toggle:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.toggle-chevron {
			width: 16px;
			height: 16px;
			transition: transform 0.2s ease;
		}

		.toggle-chevron.rotated {
			transform: rotate(180deg);
		}

		.custom-url-form {
			margin-top: 0.75rem;
			padding: 1rem;
			background: rgba(255, 255, 255, 0.02);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 10px;
			animation: slideDown 0.3s cubic-bezier(0.22, 1, 0.36, 1);
		}

		@keyframes slideDown {
			from {
				opacity: 0;
				transform: translateY(-8px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		.custom-url-help {
			margin: 0 0 0.75rem;
			font-size: 0.8rem;
			color: rgba(255, 255, 255, 0.5);
		}

		.custom-url-input-row {
			display: flex;
			gap: 0.5rem;
		}

		.custom-url-input {
			flex: 1;
			min-width: 0;
			padding: 0.75rem 1rem;
			background: rgba(255, 255, 255, 0.03);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			color: rgba(255, 255, 255, 0.9);
			font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
			font-size: 0.875rem;
			transition: all 0.2s ease;
		}

		.custom-url-input:focus {
			outline: none;
			border-color: oklch(var(--primary) / 0.5);
			box-shadow: 0 0 0 3px oklch(var(--primary) / 0.1);
		}

		.custom-url-input::placeholder {
			color: rgba(255, 255, 255, 0.3);
		}

		.custom-url-input:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}

		.custom-url-input.error {
			border-color: rgba(239, 68, 68, 0.5);
		}

		.custom-url-input.error:focus {
			box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
		}

		/* shadcn Button child-renders the real control, so the connection-test
		   palette must be hoisted. */
		:global(.custom-url-test-btn) {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.75rem 1rem;
			background: oklch(var(--primary) / 0.15);
			border: 1px solid oklch(var(--primary) / 0.3);
			border-radius: 8px;
			color: oklch(var(--primary));
			font-size: 0.85rem;
			font-weight: 500;
			white-space: nowrap;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		:global(.custom-url-test-btn:hover:not(:disabled)) {
			background: oklch(var(--primary) / 0.25);
			border-color: oklch(var(--primary) / 0.5);
		}

		:global(.custom-url-test-btn:disabled) {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.test-spinner {
			width: 16px;
			height: 16px;
			border: 2px solid oklch(var(--primary) / 0.3);
			border-top-color: oklch(var(--primary));
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		.custom-url-status {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			margin-top: 0.75rem;
			padding: 0.75rem 1rem;
			border-radius: 8px;
			font-size: 0.85rem;
			animation: fadeIn 0.2s ease;
		}

		@keyframes fadeIn {
			from {
				opacity: 0;
				transform: scale(0.98);
			}
			to {
				opacity: 1;
				transform: scale(1);
			}
		}

		.custom-url-status.success {
			background: rgba(34, 197, 94, 0.1);
			border: 1px solid rgba(34, 197, 94, 0.25);
			color: oklch(0.7946 0.1951 150.81);
		}

		.custom-url-status.error {
			background: rgba(239, 68, 68, 0.1);
			border: 1px solid rgba(239, 68, 68, 0.25);
			color: oklch(0.7052 0.1587 21.97);
		}

		.custom-url-status .status-icon {
			flex-shrink: 0;
			width: 18px;
			height: 18px;
		}

		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}

		@media (max-width: 480px) {
			.plex-button {
				width: 100%;
				min-width: unset;
			}

			.preconfigured-card {
				padding: 1rem;
				gap: 0.875rem;
			}

			.preconfigured-icon {
				width: 38px;
				height: 38px;
			}

			.preconfigured-icon svg {
				width: 20px;
				height: 20px;
			}

			.preconfigured-title {
				font-size: 0.875rem;
			}

			.preconfigured-server-name {
				font-size: 0.8rem;
			}

			.preconfigured-url {
				font-size: 0.75rem;
			}

			.server-card {
				padding: 0.875rem 1rem;
			}

			.server-icon {
				width: 36px;
				height: 36px;
			}

			.server-icon svg {
				width: 18px;
				height: 18px;
			}

			.connections-panel {
				padding: 0.75rem;
			}

			.connection-card {
				padding: 0.625rem 0.75rem;
			}

			.connection-badge {
				font-size: 0.6rem;
			}

			.connection-desc {
				font-size: 0.7rem;
			}

			.connection-uri {
				font-size: 0.75rem;
			}

			.custom-url-section {
				padding: 0 0.75rem 0.75rem;
			}

			.custom-url-input-row {
				flex-direction: column;
			}

			.custom-url-test-btn {
				width: 100%;
				justify-content: center;
			}

			.custom-url-input {
				font-size: 0.8rem;
				padding: 0.625rem 0.75rem;
			}

			.custom-url-help {
				font-size: 0.75rem;
			}
		}
</style>
