<script lang="ts">
import LogOut from '@lucide/svelte/icons/log-out';
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import * as Tabs from '$lib/components/ui/tabs';
import { ShareModePrivacyLevel } from '$lib/sharing/types';
import { handleFormToast } from '$lib/utils/form-toast';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

type RegenerateTokenActionData = {
	action?: string;
	wrappedHref?: string;
	shareToken?: string;
};

const validTabs = ['privacy', 'display', 'account'] as const;
type TabValue = (typeof validTabs)[number];

function getInitialTab(): TabValue {
	if (typeof window === 'undefined') return 'privacy';
	const urlTab = $page.url.searchParams.get('tab');
	if (urlTab && validTabs.includes(urlTab as TabValue)) {
		return urlTab as TabValue;
	}
	return 'privacy';
}

let activeTab = $state<TabValue>(getInitialTab());

// svelte-ignore state_referenced_locally
let selectedShareMode = $state<string>(data.shareSettings.mode);
let selectedLogoPreference = $state<'show' | 'hide'>('show');
let isUpdating = $state(false);
let isRegenerating = $state(false);
let wrappedHrefOverride = $state<string | null>(null);
// svelte-ignore state_referenced_locally
let syncedWrappedHref = $state(data.wrappedHref);

let copied = $state(false);
let copyTimeout: ReturnType<typeof setTimeout> | null = null;

let regenerateDialogOpen = $state(false);

// DF-019: track the last server-confirmed share mode so we only overwrite the
// local selection when the server actually sends a new value — not on every
// reactive re-run.  Without this key the $effect below fired during the
// submit round-trip and briefly reset all radios to unchecked before the
// server response arrived.
// svelte-ignore state_referenced_locally
let syncedShareMode = $state(data.shareSettings.mode);

$effect(() => {
	// Only snap the radio selection back when the server-side mode has changed,
	// not on every reactive pass.  This prevents the transient "all unchecked"
	// state that occurred while isUpdating=true kept the inputs disabled and the
	// $effect simultaneously reset selectedShareMode to the (stale) server value.
	if (data.shareSettings.mode !== syncedShareMode) {
		syncedShareMode = data.shareSettings.mode;
		selectedShareMode = data.shareSettings.mode;
	}
	selectedLogoPreference = data.userLogoPreference === false ? 'hide' : 'show';
	if (data.wrappedHref !== syncedWrappedHref) {
		syncedWrappedHref = data.wrappedHref;
		wrappedHrefOverride = null;
	}
});

$effect(() => {
	handleFormToast(form);
	const payload = form as unknown as { action?: string; currentMode?: string } | null | undefined;
	if (payload?.action === 'updateShareMode' && typeof payload.currentMode === 'string') {
		selectedShareMode = payload.currentMode;
	}
});

function isBelowFloor(mode: string): boolean {
	const floor = data.globalFloor;
	if (!floor) return false;
	return (
		(ShareModePrivacyLevel[mode as keyof typeof ShareModePrivacyLevel] ?? 0) <
		(ShareModePrivacyLevel[floor as keyof typeof ShareModePrivacyLevel] ?? 0)
	);
}

// True when the currently-selected mode is blocked by the admin privacy floor.
// Disables Save to prevent a misleading 'Invalid share mode' toast (disabled
// radio inputs are not submitted by the browser, so `mode` arrives as null).
let isSelectedModeBelowFloor = $derived(isBelowFloor(selectedShareMode));

function getShareIcon(mode: string): string {
	switch (mode) {
		case 'public':
			return '🌐';
		case 'private-oauth':
			return '🔐';
		case 'private-link':
			return '🔗';
		default:
			return '⚙️';
	}
}

const shareModeDescriptions: Record<string, string> = {
	public: 'Anyone can view your Wrapped page',
	'private-oauth': 'Only Plex server members can view',
	'private-link': 'Anyone with the special link can view'
};

const shareModeLabels: Record<string, string> = {
	public: 'Public',
	'private-oauth': 'Server Members',
	'private-link': 'Private Link'
};

function getShareUrl(): string {
	const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
	return `${baseUrl}${wrappedHrefOverride ?? data.wrappedHref}`;
}

async function copyShareUrl() {
	try {
		await navigator.clipboard.writeText(getShareUrl());
		copied = true;

		if (copyTimeout) clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copied = false;
		}, 2000);
	} catch (err) {
		console.error('Failed to copy:', err);
	}
}

function formatDate(date: Date | null): string {
	if (!date) return 'Unknown';
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(date));
}

function formatRelativeDate(date: Date | null): string {
	if (!date) return 'Unknown';
	const now = new Date();
	const target = new Date(date);
	const diffDays = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

	if (diffDays < 0) return 'Expired';
	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Tomorrow';
	if (diffDays < 7) return `In ${diffDays} days`;
	return formatDate(date);
}

function getLogoModeDescription(): string {
	switch (data.wrappedLogoMode) {
		case 'always_show':
			return 'Your admin shows the logo on every Wrapped page';
		case 'always_hide':
			return 'Your admin hides the logo on every Wrapped page';
		default:
			return '';
	}
}
</script>

<svelte:head>
	<title>Settings - Obzorarr</title>
</svelte:head>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
		<p class="subtitle">Manage your personal preferences</p>
	</header>

	<Tabs.Root bind:value={activeTab} class="settings-tabs">
		<Tabs.List class="tabs-list">
			<Tabs.Trigger value="privacy">Privacy</Tabs.Trigger>
			<Tabs.Trigger value="display">Display</Tabs.Trigger>
			<Tabs.Trigger value="account">Account</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="privacy">
			<section class="section">
				<h2>Sharing Settings</h2>
				<p class="section-description">Choose who can view your {data.currentYear} Wrapped page.</p>

				{#if data.shareSettings.canUserControl}
					<form
						method="POST"
						action="?/updateShareMode"
						use:enhance={({ cancel }) => {
	if (isUpdating) {
		cancel();
		return;
	}
	isUpdating = true;
	return async ({ result, update }) => {
		try {
			await update({ reset: false });
		} finally {
			isUpdating = false;
		}
	};
}}
						class="share-form"
					>
						<div class="privacy-card-grid three-col">
							<label
								class="privacy-card"
								class:selected={selectedShareMode === 'public'}
								class:below-floor={isBelowFloor('public')}
								aria-disabled={isBelowFloor('public')}
							>
								<input
									type="radio"
									name="mode"
									value="public"
									bind:group={selectedShareMode}
									disabled={isBelowFloor('public') || isUpdating}
								>
								<span class="card-icon">{getShareIcon('public')}</span>
								<span class="card-title">Public</span>
								<span class="card-desc">{shareModeDescriptions.public}</span>
								{#if isBelowFloor('public')}
									<span class="floor-note">
										Your administrator requires at least
										{shareModeLabels[data.globalFloor ?? ''] ?? data.globalFloor}
										privacy.
									</span>
								{/if}
							</label>

							<label
								class="privacy-card"
								class:selected={selectedShareMode === 'private-link'}
								class:below-floor={isBelowFloor('private-link')}
								aria-disabled={isBelowFloor('private-link')}
							>
								<input
									type="radio"
									name="mode"
									value="private-link"
									bind:group={selectedShareMode}
									disabled={isBelowFloor('private-link') || isUpdating}
								>
								<span class="card-icon">{getShareIcon('private-link')}</span>
								<span class="card-title">Private Link</span>
								<span class="card-desc">{shareModeDescriptions['private-link']}</span>
								{#if isBelowFloor('private-link')}
									<span class="floor-note">
										Private links and token regeneration are unavailable while your administrator
										limits sharing to at least
										{shareModeLabels[data.globalFloor ?? ''] ?? data.globalFloor}
										privacy.
									</span>
								{/if}
							</label>

							<label
								class="privacy-card"
								class:selected={selectedShareMode === 'private-oauth'}
								class:below-floor={isBelowFloor('private-oauth')}
								aria-disabled={isBelowFloor('private-oauth')}
							>
								<input
									type="radio"
									name="mode"
									value="private-oauth"
									bind:group={selectedShareMode}
									disabled={isBelowFloor('private-oauth') || isUpdating}
								>
								<span class="card-icon">{getShareIcon('private-oauth')}</span>
								<span class="card-title">Server Members</span>
								<span class="card-desc">{shareModeDescriptions['private-oauth']}</span>
								{#if isBelowFloor('private-oauth')}
									<span class="floor-note">
										Your administrator requires at least
										{shareModeLabels[data.globalFloor ?? ''] ?? data.globalFloor}
										privacy.
									</span>
								{/if}
							</label>
						</div>

						<div class="form-actions">
							{#if isSelectedModeBelowFloor}
								<p class="floor-note">
									Your current share mode is below the server's minimum privacy floor. Select a
									higher-privacy option above to save.
								</p>
							{/if}
							<button
								type="submit"
								class="save-button"
								disabled={isUpdating || isSelectedModeBelowFloor}
							>
								{isUpdating ? 'Saving...' : 'Save Sharing Settings'}
							</button>
						</div>
					</form>

					<div class="share-url-section">
						<h3>Your Wrapped URL</h3>
						<div class="url-container">
							<input type="text" readonly value={getShareUrl()} class="url-input">
							<button type="button" class="copy-button" class:copied onclick={copyShareUrl}>
								{#if copied}
									<svg
										aria-hidden="true"
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
									Copied!
								{:else}
									<svg
										aria-hidden="true"
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
										<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
									</svg>
									Copy
								{/if}
							</button>
						</div>

						{#if data.shareSettings.mode === 'private-link'}
							<div class="token-actions">
								<p class="token-hint">
									This link contains a private token. Only people with this exact link can open your
									Wrapped page.
								</p>
								<button
									type="button"
									class="regenerate-button"
									onclick={() => (regenerateDialogOpen = true)}
								>
									🔄 Regenerate Link
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<div class="info-banner" role="status" aria-live="polite">
						<span class="info-icon">ℹ️</span>
						<div class="info-content">
							<strong>Your server administrator manages sharing settings</strong>
							<p>
								Your current sharing mode is:
								<span class="mode-badge"
									>{getShareIcon(data.shareSettings.mode)}
									{data.shareSettings.mode === 'private-oauth'
	? 'Server Members Only'
	: data.shareSettings.mode === 'private-link'
		? 'Private Link'
		: 'Public'}</span
								>
							</p>
							<!-- DF-007: explain WHY this control is locked — the admin's global
							     "allow users to change their share settings" flag must be on AND
							     the admin must grant control to your account before this becomes
							     editable. Copy/discoverability only; no gate-logic change. -->
							<p class="locked-reason">
								This control is locked because your server administrator hasn't granted you
								permission to change it. Ask them to enable per-user share control for your account.
							</p>
						</div>
					</div>

					<div class="share-url-section readonly">
						<h3>Your Wrapped URL</h3>
						<div class="url-container">
							<input type="text" readonly value={getShareUrl()} class="url-input">
							<button type="button" class="copy-button" class:copied onclick={copyShareUrl}>
								{#if copied}
									<svg
										aria-hidden="true"
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
									Copied!
								{:else}
									<svg
										aria-hidden="true"
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
										<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
									</svg>
									Copy
								{/if}
							</button>
						</div>
					</div>
				{/if}
			</section>
		</Tabs.Content>

		<Tabs.Content value="display">
			<section class="section">
				<h2>Logo Visibility</h2>
				<p class="section-description">
					Choose whether the Obzorarr logo appears on your Wrapped page.
				</p>

				{#if data.canControlLogo}
					<form
						method="POST"
						action="?/updateLogoPreference"
						use:enhance={({ cancel }) => {
	if (isUpdating) {
		cancel();
		return;
	}
	isUpdating = true;
	return async ({ update }) => {
		await update();
		isUpdating = false;
	};
}}
						class="logo-form"
					>
						<div
							class="privacy-card-grid two-col"
							role="radiogroup"
							aria-label="Logo visibility on your Wrapped page"
						>
							<label class="privacy-card" class:selected={selectedLogoPreference === 'show'}>
								<input
									type="radio"
									name="logoPreference"
									value="show"
									aria-label="Show logo"
									bind:group={selectedLogoPreference}
									disabled={isUpdating}
								>
								<span class="card-icon" aria-hidden="true">✅</span>
								<span class="card-title">Show logo</span>
								<span class="card-desc">Show the Obzorarr logo on your Wrapped page</span>
							</label>

							<label class="privacy-card" class:selected={selectedLogoPreference === 'hide'}>
								<input
									type="radio"
									name="logoPreference"
									value="hide"
									aria-label="Hide logo"
									bind:group={selectedLogoPreference}
									disabled={isUpdating}
								>
								<span class="card-icon" aria-hidden="true">🚫</span>
								<span class="card-title">Hide logo</span>
								<span class="card-desc">Hide the Obzorarr logo on your Wrapped page</span>
							</label>
						</div>

						<div class="form-actions">
							<button type="submit" class="save-button" disabled={isUpdating}>
								{isUpdating ? 'Saving...' : 'Save Display Settings'}
							</button>
						</div>
					</form>
				{:else}
					<div class="info-banner">
						<span class="info-icon">ℹ️</span>
						<div class="info-content">
							<strong>Your server administrator controls logo visibility</strong>
							<p>{getLogoModeDescription()}</p>
						</div>
					</div>
				{/if}
			</section>
		</Tabs.Content>

		<Tabs.Content value="account">
			<section class="section">
				<h2>Profile Information</h2>
				<p class="section-description">Your account details from Plex.</p>

				<div class="profile-card">
					<div class="profile-header">
						{#if data.user.thumb}
							<img src={data.user.thumb} alt="Profile" class="profile-avatar">
						{:else}
							<div class="profile-avatar-placeholder">
								<span>{data.user.username.charAt(0).toUpperCase()}</span>
							</div>
						{/if}
						<div class="profile-info">
							<h3 class="profile-name">{data.user.username}</h3>
							{#if data.user.email}
								<p class="profile-email">{data.user.email}</p>
							{/if}
						</div>
					</div>

					<div class="profile-details">
						<div class="detail-row">
							<span class="detail-label">Member Since</span>
							<span class="detail-value">
								{data.user.createdAt ? formatDate(data.user.createdAt) : 'Unknown'}
							</span>
						</div>

						<div class="detail-row">
							<span class="detail-label">Session Expires</span>
							<span class="detail-value session-expiry">
								{formatRelativeDate(data.sessionExpiresAt)}
							</span>
						</div>

						{#if data.user.plexId}
							<div class="detail-row">
								<span class="detail-label">Plex ID</span>
								<span class="detail-value mono">{data.user.plexId}</span>
							</div>
						{/if}

						<div class="detail-row">
							<span class="detail-label">Account ID</span>
							<span class="detail-value mono">{data.user.id}</span>
						</div>
					</div>
				</div>

				<div class="account-actions">
					<a href={data.wrappedHref} class="view-wrapped-link">
						View My {data.currentYear} Wrapped →
					</a>
				</div>
			</section>

			<section class="section">
				<h2>Sign Out</h2>
				<p class="section-description">End your session on this device.</p>
				<form method="POST" action="/auth/logout" use:enhance class="logout-form">
					<button type="submit" class="logout-button">
						<LogOut class="logout-icon" aria-hidden="true" />
						<span>Log out</span>
					</button>
				</form>
			</section>
		</Tabs.Content>
	</Tabs.Root>

	<AlertDialog.Root bind:open={regenerateDialogOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Regenerate Share Link?</AlertDialog.Title>
				<AlertDialog.Description>
					A new private link replaces the current one. The old link stops working for everyone who
					already has it.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={isRegenerating}>Cancel</AlertDialog.Cancel>
				<form
					method="POST"
					action="?/regenerateToken"
					use:enhance={({ cancel }) => {
	if (isRegenerating) {
		cancel();
		return;
	}
	isRegenerating = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success') {
				const payload = (result.data ?? {}) as RegenerateTokenActionData;
				if (payload.action === 'regenerateToken' && typeof payload.wrappedHref === 'string') {
					wrappedHrefOverride = payload.wrappedHref;
				}
			} else if (result.type === 'error') {
				handleFormToast({
					error: result.error?.message ?? 'Could not regenerate the share link.'
				});
			}

			await update({ reset: result.type !== 'failure' });

			if (result.type === 'success') {
				regenerateDialogOpen = false;
				await invalidateAll();
			}
		} finally {
			isRegenerating = false;
		}
	};
}}
					style="display: contents;"
				>
					<AlertDialog.Action type="submit" disabled={isRegenerating}>
						{#if isRegenerating}
							Regenerating...
						{:else}
							Regenerate Link
						{/if}
					</AlertDialog.Action>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>

<style>
.settings-page {
	max-width: 700px;
	margin: 0 auto;
	padding: 2rem;
}

.page-header {
	margin-bottom: 2rem;
}

.page-header h1 {
	font-size: 2rem;
	font-weight: 700;
	color: oklch(var(--primary));
	margin: 0 0 0.5rem;
}

.subtitle {
	color: oklch(var(--muted-foreground));
	margin: 0;
}

/* Tabs.Root receives these classes via props, so the selectors must escape Svelte scope. */
:global(.settings-tabs) {
	margin-top: 1.5rem;
}

:global(.tabs-list) {
	display: flex;
	gap: 0.25rem;
	border-bottom: 1px solid oklch(var(--border));
	margin-bottom: 1.5rem;
	overflow-x: auto;
	scrollbar-width: thin;
}

:global(.tabs-list button) {
	padding: 0.75rem 1.25rem;
	font-size: 0.875rem;
	font-weight: 500;
	color: oklch(var(--muted-foreground));
	background: transparent;
	border: none;
	border-bottom: 2px solid transparent;
	cursor: pointer;
	white-space: nowrap;
	transition: all 0.15s ease;
}

:global(.tabs-list button:hover) {
	color: oklch(var(--foreground));
}

:global(.tabs-list button[data-state="active"]) {
	color: oklch(var(--primary));
	border-bottom-color: oklch(var(--primary));
}

.section {
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	padding: 1.5rem;
	margin-bottom: 1.5rem;
}

.section h2 {
	font-size: 1.125rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin: 0 0 0.5rem;
}

.section h3 {
	font-size: 0.95rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin: 1.5rem 0 0.75rem;
}

.section-description {
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
	margin: 0 0 1.25rem;
}

.privacy-card-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 0.75rem;
	margin-bottom: 1rem;
}

.privacy-card-grid.two-col {
	grid-template-columns: repeat(2, 1fr);
}

.privacy-card-grid.three-col {
	grid-template-columns: repeat(3, 1fr);
}

.privacy-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 1rem 0.75rem;
	background: oklch(var(--muted));
	border: 2px solid oklch(var(--border));
	border-radius: var(--radius);
	cursor: pointer;
	transition: all 0.15s ease;
	text-align: center;
	min-height: 120px;
}

.privacy-card:hover {
	border-color: oklch(var(--primary) / 0.5);
	background: oklch(var(--muted) / 0.8);
}

.privacy-card.selected {
	border-color: oklch(var(--primary));
	background: oklch(var(--primary) / 0.1);
}

.privacy-card.below-floor {
	opacity: 0.55;
	cursor: not-allowed;
}

.privacy-card.below-floor:hover {
	border-color: oklch(var(--border));
	background: oklch(var(--muted));
}

.floor-note {
	margin-top: 0.5rem;
	padding: 0.375rem 0.5rem;
	font-size: 0.7rem;
	line-height: 1.4;
	color: oklch(0.869 0.1467 90.38);
	background: rgba(250, 204, 21, 0.08);
	border-left: 2px solid rgba(250, 204, 21, 0.5);
	border-radius: 4px;
	text-align: left;
}

.privacy-card input[type="radio"] {
	position: absolute;
	opacity: 0;
	pointer-events: none;
}

.privacy-card .card-icon {
	font-size: 1.5rem;
	margin-bottom: 0.5rem;
	line-height: 1;
}

.privacy-card .card-title {
	font-weight: 600;
	font-size: 0.875rem;
	color: oklch(var(--foreground));
	margin-bottom: 0.25rem;
}

.privacy-card .card-desc {
	font-size: 0.7rem;
	color: oklch(var(--muted-foreground));
	line-height: 1.4;
}

.form-actions {
	margin-top: 1.25rem;
}

.save-button {
	padding: 0.625rem 1.25rem;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border: none;
	border-radius: var(--radius);
	font-weight: 500;
	font-size: 0.875rem;
	cursor: pointer;
	transition: opacity 0.15s ease;
}

.save-button:hover:not(:disabled) {
	opacity: 0.9;
}

.save-button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.share-url-section {
	margin-top: 1.5rem;
	padding-top: 1.5rem;
	border-top: 1px solid oklch(var(--border));
}

.share-url-section.readonly {
	margin-top: 1.25rem;
}

.url-container {
	display: flex;
	gap: 0.5rem;
}

.url-input {
	flex: 1;
	padding: 0.625rem 0.875rem;
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--foreground));
	font-size: 0.8rem;
	font-family: monospace;
}

.copy-button {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.625rem 1rem;
	background: oklch(var(--secondary));
	color: oklch(var(--foreground));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	font-size: 0.8rem;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
	white-space: nowrap;
}

.copy-button:hover {
	background: oklch(var(--muted));
}

.copy-button.copied {
	background: oklch(0.6318 0.1589 149.73);
	color: white;
	border-color: oklch(0.6318 0.1589 149.73);
}

.token-actions {
	margin-top: 1rem;
}

.token-hint {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
	margin: 0 0 0.75rem;
}

.regenerate-button {
	padding: 0.5rem 0.875rem;
	background: oklch(var(--secondary));
	color: oklch(var(--foreground));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	font-size: 0.8rem;
	cursor: pointer;
	transition: all 0.15s ease;
}

.regenerate-button:hover {
	background: oklch(var(--destructive));
	color: oklch(var(--destructive-foreground));
	border-color: oklch(var(--destructive));
}

.info-banner {
	display: flex;
	gap: 1rem;
	padding: 1rem 1.25rem;
	background: oklch(0.5883 0.1391 251.44 / 0.1);
	border: 1px solid oklch(0.5883 0.1391 251.44 / 0.25);
	border-left: 3px solid oklch(var(--primary));
	border-radius: var(--radius);
	margin-bottom: 1rem;
}

.info-icon {
	font-size: 1.25rem;
	flex-shrink: 0;
}

.info-content {
	flex: 1;
}

.info-content strong {
	display: block;
	font-size: 0.9375rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin-bottom: 0.25rem;
}

.info-content p {
	font-size: 0.8rem;
	color: oklch(var(--muted-foreground));
	margin: 0;
}

/* DF-007: secondary explanatory line under the locked-mode badge. */
.info-content .locked-reason {
	margin-top: 0.5rem;
	font-size: 0.75rem;
	line-height: 1.5;
}

.mode-badge {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.125rem 0.5rem;
	background: oklch(var(--muted));
	border-radius: calc(var(--radius) / 2);
	font-weight: 500;
}

.profile-card {
	background: oklch(var(--muted));
	border-radius: var(--radius);
	overflow: hidden;
}

.profile-header {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1.25rem;
	background: linear-gradient(
		135deg,
		oklch(var(--primary) / 0.15) 0%,
		oklch(var(--primary) / 0.05) 100%
	);
	border-bottom: 1px solid oklch(var(--border));
}

.profile-avatar {
	width: 64px;
	height: 64px;
	border-radius: 50%;
	object-fit: cover;
	border: 3px solid oklch(var(--primary));
}

.profile-avatar-placeholder {
	width: 64px;
	height: 64px;
	border-radius: 50%;
	background: oklch(var(--primary));
	display: flex;
	align-items: center;
	justify-content: center;
	border: 3px solid oklch(var(--primary) / 0.5);
}

.profile-avatar-placeholder span {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--primary-foreground));
}

.profile-info {
	flex: 1;
}

.profile-name {
	font-size: 1.25rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin: 0 0 0.25rem;
}

.profile-email {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	margin: 0;
}

.profile-details {
	padding: 1rem 1.25rem;
}

.detail-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.625rem 0;
	border-bottom: 1px solid oklch(var(--border) / 0.5);
}

.detail-row:last-child {
	border-bottom: none;
}

.detail-label {
	font-size: 0.8rem;
	color: oklch(var(--muted-foreground));
}

.detail-value {
	font-size: 0.875rem;
	font-weight: 500;
	color: oklch(var(--foreground));
}

.detail-value.mono {
	font-family: monospace;
	font-size: 0.8rem;
}

.session-expiry {
	padding: 0.25rem 0.5rem;
	background: oklch(var(--primary) / 0.15);
	border-radius: calc(var(--radius) / 2);
	font-size: 0.8rem;
}

.account-actions {
	margin-top: 1.5rem;
}

.view-wrapped-link {
	display: inline-flex;
	align-items: center;
	padding: 0.75rem 1.25rem;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border-radius: var(--radius);
	font-weight: 500;
	font-size: 0.875rem;
	text-decoration: none;
	transition: opacity 0.15s ease;
}

.view-wrapped-link:hover {
	opacity: 0.9;
}

.logout-form {
	margin: 0;
}

.logout-button {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 1.25rem;
	background: oklch(var(--destructive) / 0.1);
	color: oklch(var(--destructive));
	border: 1px solid oklch(var(--destructive) / 0.3);
	border-radius: var(--radius);
	font-weight: 500;
	font-size: 0.875rem;
	cursor: pointer;
	transition: background 0.15s ease;
}

.logout-button:hover {
	background: oklch(var(--destructive) / 0.18);
}

.logout-button :global(.logout-icon) {
	width: 1rem;
	height: 1rem;
}

@media (max-width: 640px) {
	.settings-page {
		padding: 1.25rem;
	}

	.privacy-card-grid,
	.privacy-card-grid.two-col,
	.privacy-card-grid.three-col {
		grid-template-columns: 1fr;
	}

	.privacy-card {
		flex-direction: row;
		align-items: flex-start;
		text-align: left;
		min-height: auto;
		padding: 1rem;
		gap: 0.875rem;
	}

	.privacy-card .card-icon {
		flex-shrink: 0;
		margin-bottom: 0;
	}

	.privacy-card .card-title,
	.privacy-card .card-desc {
		text-align: left;
	}

	.url-container {
		flex-direction: column;
	}

	.profile-header {
		flex-direction: column;
		text-align: center;
	}

	.detail-row {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
	}
}
</style>
