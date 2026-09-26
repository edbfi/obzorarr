<script lang="ts">
import { untrack } from 'svelte';
import { enhance } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import { ShareModePrivacyLevel, type ShareModeType } from '$lib/sharing/types';

interface ShareSettings {
	mode: ShareModeType;
	shareToken: string | null | undefined;
	canUserControl: boolean;
}

interface Props {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	currentUrl: string;
	canonicalUrl?: string;
	shareSettings?: ShareSettings;
	isOwner?: boolean;
	isAdmin?: boolean;
	isServerWrapped?: boolean;
	globalFloor?: ShareModeType;
}

let {
	open = $bindable(false),
	onOpenChange,
	currentUrl,
	canonicalUrl,
	shareSettings,
	isOwner = false,
	isAdmin = false,
	isServerWrapped = false,
	globalFloor
}: Props = $props();

const floorLevel = $derived(globalFloor ? ShareModePrivacyLevel[globalFloor] : 0);

function isBelowFloor(mode: ShareModeType): boolean {
	return ShareModePrivacyLevel[mode] < floorLevel;
}

let copied = $state(false);
let copyTimeout: ReturnType<typeof setTimeout> | undefined;
let isUpdating = $state(false);
let isRefreshing = $state(false);
let localMode = $state<ShareModeType>(untrack(() => shareSettings?.mode ?? 'public'));
let localShareToken = $state<string | null | undefined>(untrack(() => shareSettings?.shareToken));

const displayMode = $derived(localMode);
const displayShareToken = $derived(localShareToken);
const controlsDisabled = $derived(isUpdating || isRefreshing);

const shareUrl = $derived.by(() => {
	const origin = typeof window !== 'undefined' ? window.location.origin : '';
	// DF-04: the copyable link uses the opaque share href (slug for public/oauth,
	// token for private-link) — never the enumerable numeric canonicalUrl. The
	// private-link branch below still swaps in the live token.
	const baseUrl = currentUrl;

	if (!shareSettings) return `${origin}${baseUrl}`;

	if (displayMode === 'private-link' && displayShareToken) {
		const parts = baseUrl.split('/u/');
		if (parts.length === 2) {
			return `${origin}${parts[0]}/u/${displayShareToken}`;
		}
	}
	return `${origin}${baseUrl}`;
});

// DF-04 / ISSUE-004: Server Members (private-oauth) pages are now served at an
// opaque slug (not the enumerable integer id), so there IS a real shareable link
// — it just only resolves for signed-in Plex server members. We show the slug
// link alongside a members-only note so the owner can share it while recipients
// understand they must sign in. Access control is unchanged.
const isMembersOnly = $derived(displayMode === 'private-oauth');

const canControlShare = $derived(
	(isOwner || isAdmin) && (shareSettings?.canUserControl || isAdmin) && !isServerWrapped
);
// ISSUE-002: when the stored mode is `private-link` but that mode sits below
// the active global floor, the radio option is already disabled — so the
// regenerate control must hide too, otherwise it offers to rotate a token for
// a mode the user can no longer select. Mirror the radio's floor gating.
const canRegenerateToken = $derived(
	canControlShare && displayMode === 'private-link' && !isBelowFloor(displayMode)
);

// ISSUE-019: an owner whose `canUserControl` is off (and who isn't an admin)
// gets no visibility controls at all. Surface why, plus a path to their own
// settings, instead of silently hiding the section.
const showNoControlNotice = $derived(
	isOwner && !isAdmin && !isServerWrapped && !(shareSettings?.canUserControl ?? false)
);

const availableModes = $derived.by(() => {
	if (isAdmin) return ['public', 'private-link', 'private-oauth'] as const;
	if (shareSettings?.canUserControl) return ['public', 'private-link', 'private-oauth'] as const;
	return [] as const;
});

const modeLabels: Record<ShareModeType, { label: string; description: string }> = {
	public: {
		label: 'Public',
		description: 'Anyone can view'
	},
	'private-oauth': {
		label: 'Server Members',
		description: 'Only Plex server members'
	},
	'private-link': {
		label: 'Private Link',
		description: 'Anyone with the link'
	}
};

async function copyUrl(): Promise<void> {
	if (controlsDisabled) return;

	try {
		await navigator.clipboard.writeText(shareUrl);
		copied = true;
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copied = false;
		}, 2000);
	} catch {
		// Clipboard APIs can be unavailable outside secure contexts or in older browsers.
		const input = document.createElement('input');
		input.value = shareUrl;
		document.body.appendChild(input);
		input.select();
		document.execCommand('copy');
		document.body.removeChild(input);
		copied = true;
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copied = false;
		}, 2000);
	}
}

async function refreshShareData(): Promise<void> {
	if (isRefreshing) return;

	isRefreshing = true;
	try {
		await invalidateAll();
	} catch (error) {
		console.warn('Failed to refresh share data:', error);
	} finally {
		isRefreshing = false;
	}
}

function handleOpenChange(value: boolean): void {
	open = value;
	if (value) {
		void refreshShareData();
	}
	onOpenChange?.(value);
}

function applyShareActionData(data: unknown): void {
	const actionData = data as
		| {
				shareSettings?: Partial<ShareSettings>;
				shareToken?: string | null;
				canonicalUrl?: string;
		  }
		| undefined;

	if (actionData?.shareSettings?.mode) {
		localMode = actionData.shareSettings.mode;
	}

	if (actionData?.shareSettings && 'shareToken' in actionData.shareSettings) {
		localShareToken = actionData.shareSettings.shareToken;
	}

	if (actionData && 'shareToken' in actionData) {
		localShareToken = actionData.shareToken;
	}
}

function restoreLocalShareState(): void {
	localMode = shareSettings?.mode ?? 'public';
	localShareToken = shareSettings?.shareToken;
}

function submitModeChange(event: Event, mode: ShareModeType): void {
	if (controlsDisabled || isBelowFloor(mode)) {
		event.preventDefault();
		restoreLocalShareState();
		return;
	}

	localMode = mode;
	(event.currentTarget as HTMLInputElement).form?.requestSubmit();
}

function currentRouteIdentifier(): string | null {
	if (typeof window === 'undefined') return null;
	const match = window.location.pathname.match(/\/u\/([^/]+)\/?$/);
	if (!match?.[1]) return null;

	try {
		return decodeURIComponent(match[1]);
	} catch {
		return null;
	}
}

function isTokenIdentifier(value: string | null): boolean {
	return Boolean(
		value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
	);
}

function tokenizedUrl(baseUrl: string, token: string): string {
	const parts = baseUrl.split('/u/');
	return parts.length === 2 ? `${parts[0]}/u/${token}` : baseUrl;
}

async function navigateAfterTokenRouteUpdate(data: unknown): Promise<boolean> {
	const actionData = data as
		| {
				shareSettings?: Partial<ShareSettings>;
				shareToken?: string | null;
				canonicalUrl?: string;
		  }
		| undefined;
	const routeIdentifier = currentRouteIdentifier();

	const nextMode = actionData?.shareSettings?.mode;
	const nextToken =
		actionData?.shareSettings && 'shareToken' in actionData.shareSettings
			? actionData.shareSettings.shareToken
			: actionData?.shareToken;

	if (
		nextMode &&
		nextMode !== 'private-link' &&
		isTokenIdentifier(routeIdentifier) &&
		actionData?.canonicalUrl
	) {
		await goto(actionData.canonicalUrl, { replaceState: true, invalidateAll: true });
		return true;
	}

	if (nextMode === 'private-link' && nextToken && nextToken !== routeIdentifier) {
		await goto(tokenizedUrl(actionData?.canonicalUrl ?? canonicalUrl ?? currentUrl, nextToken), {
			replaceState: true,
			invalidateAll: true
		});
		return true;
	}

	return false;
}

$effect(() => {
	return () => {
		clearTimeout(copyTimeout);
	};
});

// Reset only when reopening so freshly-loaded shareSettings (for example, a
// token rotated elsewhere) replaces the previous optimistic local state.
let prevOpen = false;
$effect(() => {
	if (open && !prevOpen) {
		restoreLocalShareState();
	}
	prevOpen = open;
});

let lastShareSettings = untrack(() => shareSettings);
$effect(() => {
	if (!isUpdating && shareSettings !== lastShareSettings) {
		lastShareSettings = shareSettings;
		restoreLocalShareState();
	}
});
</script>

<AlertDialog.Root bind:open onOpenChange={handleOpenChange}>
	<AlertDialog.Content class="share-modal">
		<AlertDialog.Header>
			<AlertDialog.Title>Share Wrapped</AlertDialog.Title>
			<AlertDialog.Description>
				{#if isServerWrapped}
					Share this server's Year in Review with others
				{:else}
					Share your Year in Review with friends and family
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="url-section">
			<label for="share-url" class="label">Share Link</label>
			<div class="url-row">
				<input
					id="share-url"
					type="text"
					readonly
					disabled={controlsDisabled}
					value={controlsDisabled ? '' : shareUrl}
					placeholder={controlsDisabled ? 'Refreshing link...' : undefined}
					class="url-input"
					onclick={(e) => e.currentTarget.select()}
				>
				<button
					type="button"
					class="copy-btn"
					disabled={controlsDisabled}
					onclick={copyUrl}
					aria-label={controlsDisabled ? 'Refreshing link' : copied ? 'Copied!' : 'Copy link'}
				>
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
							class="icon check"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
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
							class="icon"
						>
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
					{/if}
				</button>
			</div>
			{#if copied}
				<span class="copied-feedback">Copied to clipboard!</span>
			{/if}
			{#if isMembersOnly}
				<div class="members-only-notice">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="members-only-icon"
						aria-hidden="true"
					>
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<p class="members-only-text">
						Visible to Plex server members only. Recipients must sign in with their Plex account to
						open this Wrapped.
					</p>
				</div>
			{:else if displayMode === 'private-link'}
				<div class="members-only-notice">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="members-only-icon"
						aria-hidden="true"
					>
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
					</svg>
					<p class="members-only-text">
						Shared via private link. Anyone with this link can open this Wrapped without signing in,
						so treat it like a password and share it only with people you trust.
					</p>
				</div>
			{/if}
		</div>

		{#if canControlShare && availableModes.length > 0}
			<div class="share-modes">
				<span class="label" id="visibility-label">Visibility</span>
				<form
					aria-labelledby="visibility-label"
					method="POST"
					action="?/updateShareMode"
					use:enhance={() => {
	isUpdating = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success') {
				applyShareActionData(result.data);
				if (await navigateAfterTokenRouteUpdate(result.data)) return;
			} else {
				if (result.type === 'failure') {
					applyShareActionData(result.data);
				} else {
					restoreLocalShareState();
				}
				try {
					await invalidateAll();
				} catch (error) {
					console.warn('Failed to refresh share data after share mode update:', error);
				}
			}
			// DF-11: reset:false keeps the native <form> from reverting the
			// radios to their authored `checked` attribute for a frame, which
			// flashed the selection off before the optimistic localMode re-applied.
			await update({ reset: false });
		} finally {
			isUpdating = false;
		}
	};
}}
				>
					<div class="mode-options" role="radiogroup" aria-labelledby="visibility-label">
						{#each availableModes as mode}
							<label
								class="mode-option"
								class:active={displayMode === mode}
								class:below-floor={isBelowFloor(mode as ShareModeType)}
								aria-disabled={isBelowFloor(mode as ShareModeType)}
							>
								<input
									type="radio"
									name="mode"
									value={mode}
									checked={displayMode === mode}
									disabled={controlsDisabled || isBelowFloor(mode as ShareModeType)}
									onchange={(e) => submitModeChange(e, mode as ShareModeType)}
								>
								<div class="mode-content">
									<span class="mode-label">{modeLabels[mode as ShareModeType].label}</span>
									<span class="mode-desc">{modeLabels[mode as ShareModeType].description}</span>
									{#if globalFloor && isBelowFloor(mode as ShareModeType)}
										<span class="floor-note">
											Disabled by the server-wide privacy floor: visibility can't be more public
											than <strong>{modeLabels[globalFloor].label}</strong>. Effective mode at
											access time will be
											<strong>{modeLabels[globalFloor].label}</strong>.
											{#if isAdmin}
												Lower the server-wide floor in
												<a
													href="/admin/settings/privacy"
													class="floor-note-link"
													target="_blank"
													rel="noopener noreferrer"
												>
													Privacy settings
												</a>
												to self-share. That lowers the floor for
												<strong>all users</strong>
												on the server, not only you.
											{:else}
												Contact your admin to change the server-wide floor.
											{/if}
										</span>
									{/if}
								</div>
								{#if displayMode === mode}
									<svg
										aria-hidden="true"
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="check-icon"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{/if}
							</label>
						{/each}
					</div>
				</form>

				{#if canRegenerateToken}
					<form
						method="POST"
						action="?/regenerateToken"
						use:enhance={() => {
	isUpdating = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success') {
				applyShareActionData(result.data);
				if (await navigateAfterTokenRouteUpdate(result.data)) return;
			} else {
				restoreLocalShareState();
			}
			// DF-11: reset:false keeps the native <form> from reverting the
			// radios to their authored `checked` attribute for a frame, which
			// flashed the selection off before the optimistic localMode re-applied.
			await update({ reset: false });
		} finally {
			isUpdating = false;
		}
	};
}}
						class="regenerate-form"
					>
						<button type="submit" class="btn-link" disabled={controlsDisabled}>
							<svg
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
								<path d="M3 3v5h5" />
							</svg>
							Regenerate share link
						</button>
					</form>
				{/if}
			</div>
		{/if}

		{#if showNoControlNotice}
			<div class="control-notice">
				<p class="control-notice-text">
					Your admin hasn't enabled per-user visibility control, so this Wrapped uses the server
					default. Manage your account from
					<a href="/dashboard/settings" class="control-notice-link">your settings</a>, or contact
					your admin to request control.
				</p>
			</div>
		{/if}

		<div class="advanced-section">
			<a
				href={isAdmin ? '/admin/settings?tab=privacy' : '/dashboard/settings'}
				class="advanced-link"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Advanced sharing options (opens in a new tab)"
			>
				<svg
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					/>
					<circle cx="12" cy="12" r="3" />
				</svg>
				Advanced sharing options
				<!-- ISSUE-005: open in a new tab so the Wrapped page + this share
					     modal survive (a same-tab nav unmounted both). External-link glyph
					     signals the new-tab behavior. -->
				<svg
					class="advanced-link-external"
					xmlns="http://www.w3.org/2000/svg"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M15 3h6v6" />
					<path d="M10 14 21 3" />
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				</svg>
			</a>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel>Close</AlertDialog.Cancel>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
:global(.share-modal) {
	max-width: 28rem !important;
	/* ISSUE-003: under the privacy floor the modal grows tall enough that the
			   "Regenerate share link" action fell below the viewport with no way to
			   reach it. Cap the height and scroll INSIDE the dialog so every control
			   (incl. Regenerate) is reachable without dismissing the modal. */
	max-height: calc(100dvh - 4rem) !important;
	overflow-y: auto !important;
}

.url-section {
	margin-top: 0.5rem;
	margin-bottom: 1.25rem;
}

.label {
	display: block;
	font-size: 0.875rem;
	font-weight: 500;
	color: oklch(var(--foreground));
	margin-bottom: 0.5rem;
}

.url-row {
	display: flex;
	gap: 0.5rem;
}

.url-input {
	flex: 1;
	padding: 0.625rem 0.75rem;
	font-size: 0.875rem;
	border: 1px solid oklch(var(--border));
	border-radius: 6px;
	background-color: oklch(var(--background));
	color: oklch(var(--foreground));
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
}

.url-input:focus {
	outline: none;
	border-color: oklch(var(--primary));
	box-shadow: 0 0 0 2px oklch(var(--primary) / 0.1);
}

.copy-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2.5rem;
	height: 2.5rem;
	border: 1px solid oklch(var(--border));
	border-radius: 6px;
	background-color: oklch(var(--background));
	color: oklch(var(--foreground));
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		border-color 0.15s ease;
}

.copy-btn:hover {
	background-color: rgba(255, 255, 255, 0.1);
	border-color: oklch(var(--primary));
}

.copy-btn:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}

.copy-btn:disabled:hover {
	background-color: oklch(var(--background));
	border-color: oklch(var(--border));
}

.copy-btn .icon.check {
	color: #22c55e;
}

.copied-feedback {
	display: block;
	margin-top: 0.375rem;
	font-size: 0.75rem;
	color: #22c55e;
}

.members-only-notice {
	display: flex;
	align-items: flex-start;
	gap: 0.625rem;
	margin-top: 0.625rem;
	padding: 0.75rem 0.875rem;
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
	background-color: oklch(var(--muted) / 0.4);
}

.members-only-icon {
	flex-shrink: 0;
	margin-top: 0.0625rem;
	color: oklch(var(--muted-foreground));
}

.members-only-text {
	margin: 0;
	font-size: 0.8125rem;
	line-height: 1.45;
	color: oklch(var(--muted-foreground));
}

.share-modes {
	margin-bottom: 1.25rem;
	padding-top: 1rem;
	border-top: 1px solid oklch(var(--border));
}

.mode-options {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.mode-option {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		border-color 0.15s ease;
}

.mode-option:hover {
	background-color: rgba(255, 255, 255, 0.05);
}

.mode-option.active {
	border-color: oklch(var(--primary));
	background-color: oklch(var(--primary) / 0.08);
}

.mode-option.below-floor {
	opacity: 0.55;
	cursor: not-allowed;
}

.mode-option.below-floor:hover {
	background-color: transparent;
}

.mode-option input[type="radio"] {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.mode-option:focus-within {
	outline: 2px solid oklch(var(--primary));
	outline-offset: 2px;
}

.mode-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.mode-label {
	font-size: 0.875rem;
	font-weight: 500;
	color: oklch(var(--foreground));
}

.mode-desc {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.floor-note {
	margin-top: 0.375rem;
	padding: 0.375rem 0.5rem;
	font-size: 0.7rem;
	line-height: 1.4;
	color: oklch(0.869 0.1467 90.38);
	background: rgba(250, 204, 21, 0.08);
	border-left: 2px solid rgba(250, 204, 21, 0.5);
	border-radius: 4px;
}

.floor-note-link {
	color: inherit;
	font-weight: 600;
	text-decoration: underline;
}

.floor-note-link:hover {
	text-decoration: none;
}

.check-icon {
	color: oklch(var(--primary));
}

.regenerate-form {
	margin-top: 0.75rem;
}

.btn-link {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.375rem 0;
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
	background: none;
	border: none;
	cursor: pointer;
	transition: color 0.15s ease;
}

.btn-link:hover {
	color: oklch(var(--foreground));
}

.btn-link:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.control-notice {
	padding: 0.75rem 0.875rem;
	margin-bottom: 1.25rem;
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
	background-color: oklch(var(--muted) / 0.4);
}

.control-notice-text {
	margin: 0;
	font-size: 0.8125rem;
	line-height: 1.45;
	color: oklch(var(--muted-foreground));
}

.control-notice-link {
	color: oklch(var(--primary));
	text-decoration: none;
}

.control-notice-link:hover {
	text-decoration: underline;
}

.advanced-section {
	padding-top: 1rem;
	border-top: 1px solid oklch(var(--border));
	margin-bottom: 0.5rem;
}

.advanced-link {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
	text-decoration: none;
	transition: color 0.15s ease;
}

.advanced-link:hover {
	color: oklch(var(--foreground));
}

.advanced-link-external {
	opacity: 0.7;
}
</style>
