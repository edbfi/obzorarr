<script lang="ts">
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import { animate } from 'motion';
import { tick } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { shouldUseRedirectAuth } from '$lib/client/auth-mode';
import {
	commitRedirectFromPopupBlocked,
	isSafeReturnPath,
	type PlexLoginController,
	resolveSafeReturnPath,
	startPlexLoginPopup,
	startPlexLoginRedirect
} from '$lib/client/plex-login';
import PopupBlockedModal from '$lib/components/auth/PopupBlockedModal.svelte';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import Logo from '$lib/components/Logo.svelte';
import { Button } from '$lib/components/ui/button';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

let username = $state('');
let usernameTouched = $state(false);
let isLookingUp = $state(false);
let usernameInput: HTMLInputElement | undefined = $state();

// The 403 "public lookup disabled" failure has no `username` field, so narrow
// the ActionData union with an `in` check before reading it.
$effect(() => {
	const echoed =
		form && 'username' in form && typeof form.username === 'string' ? form.username : null;
	if (echoed) {
		username = echoed;
	}
});

let isOAuthLoading = $state(false);
let isRedirecting = $state(false);
let oauthError = $state<string | null>(null);
let loginController: PlexLoginController | null = null;

let showPopupBlockedModal = $state(false);
let pendingPinId = $state<number | null>(null);
let pendingAuthUrl = $state<string | null>(null);

let heroContainer: HTMLElement | undefined = $state();

$effect(() => {
	if (!heroContainer || prefersReducedMotion.current) return;
	const animation = animate(
		heroContainer,
		{ opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0)'] },
		{ type: 'spring', stiffness: 100, damping: 15 }
	);
	return () => animation.stop();
});

$effect(() => {
	return () => {
		loginController?.cancel();
		loginController = null;
	};
});

async function handlePlexLogin() {
	if (!browser) return;

	oauthError = null;

	const params = new URL(window.location.href).searchParams;
	const useRedirect = shouldUseRedirectAuth(params);

	// Post-login target preserved by the anon→admin hook redirect (ISSUE-002).
	// Validated here and re-validated downstream before any navigation, so a
	// forged ?returnTo= can never drive an external redirect.
	const rawReturnTo = params.get('returnTo');
	const returnTo = isSafeReturnPath(rawReturnTo) ? rawReturnTo : undefined;

	if (useRedirect) {
		loginController?.cancel();
		loginController = null;
		isRedirecting = true;
		await startPlexLoginRedirect({
			context: 'landing',
			returnTo,
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
		context: 'landing',
		onSuccess: (user) => {
			window.location.href = resolveSafeReturnPath(
				returnTo,
				user.isAdmin ? '/admin' : '/dashboard'
			);
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
		commitRedirectFromPopupBlocked(pendingPinId, pendingAuthUrl, 'landing');
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
</script>

<div class="landing">
	<section class="hero" bind:this={heroContainer}>
		<div class="hero-content">
			<div class="logo-glow" aria-hidden="true">
				<Logo size={120} />
			</div>

			<h1 class="hero-title">
				<span class="title-main">OBZORARR</span>
				<span class="title-sub">Year in Review</span>
			</h1>

			<p class="hero-description">
				See what you watched on Plex this year, with stats and animated slides you can share.
			</p>

			{#if data.publicLookupEnabled}
				<div class="username-section">
					<form
						method="POST"
						action="?/lookupUser"
						use:enhance={() => {
	isLookingUp = true;
	return async ({ update }) => {
		try {
			await update();
		} finally {
			isLookingUp = false;
		}
		if (form?.error) {
			await tick();
			usernameInput?.focus();
		}
	};
}}
						class="username-form"
						aria-busy={isLookingUp}
					>
						<div class="username-input-group">
							<label for="username-input" class="lookup-label">Find a current-year Wrapped</label>
							<input
								id="username-input"
								bind:this={usernameInput}
								type="text"
								name="username"
								bind:value={username}
								placeholder="Enter your Plex username"
								disabled={isLookingUp}
								class="username-input"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								required
								aria-describedby={form?.error ? 'username-help username-action-error' : 'username-help'}
								aria-invalid={form?.error ? 'true' : undefined}
								onblur={() => (usernameTouched = true)}
							>
							<SubmitButton
								class="view-button tap-target"
								submitting={isLookingUp}
								disabled={browser && !username.trim()}
							>
								{#snippet children()}
									View {data.currentYear} Wrapped
								{/snippet}
								{#snippet submittingLabel()}
									Looking up...
								{/snippet}
							</SubmitButton>
						</div>
						<p id="username-help" class="lookup-help">
							Search a Plex username. Eligible pages open without sign-in, and unknown or opted-out
							usernames return the same response.
						</p>
						<p class="lookup-boundary">
							This opens only a Wrapped page. Dashboards, settings, and admin controls still need
							sign-in.
						</p>
						<p class="lookup-status" role="status" aria-live="polite">
							{isLookingUp ? 'Looking for that Wrapped…' : ''}
						</p>

						{#if form?.error}
							<p id="username-action-error" class="error-message" role="alert">
								{form.error}
								{#if form.requiresAuth}
									<button type="button" class="link-button" onclick={handlePlexLogin}>
										Sign in now
									</button>
								{/if}
							</p>
						{/if}

						{#if usernameTouched && username.trim() === '' && username.length > 0}
							<p class="error-message" role="alert">Username cannot be empty or whitespace only.</p>
						{/if}
					</form>
				</div>
			{:else}
				<!-- Public lookup disabled by the admin: sign-in CTA instead of the
				     username field. Falls back to a hard navigation to /auth/plex when
				     JS is absent; with JS the onclick handler uses the same popup/redirect
				     flow as the login button so Cmd+Click or middle-click cannot open an
				     orphan tab by bypassing SvelteKit's click interception (ISSUE-009). -->
				<div class="username-section">
					<p class="signin-required-note">This server requires sign-in to view Wrapped.</p>
					<a
						href={data.loginHref}
						class="view-button cta-link tap-target"
						onclick={(e) => {
	e.preventDefault();
	handlePlexLogin();
}}
						onauxclick={(e) => {
	e.preventDefault();
}}
					>
						<span class="plex-icon" aria-hidden="true">&#9654;</span>
						Sign in with Plex
					</a>
				</div>
			{/if}

			<div class="login-section">
				<p class="login-prompt">Sign in to reach your dashboard or change your settings.</p>
				<Button
					type="button"
					class="login-button secondary tap-target"
					onclick={handlePlexLogin}
					disabled={isOAuthLoading || isRedirecting}
					aria-busy={isOAuthLoading || isRedirecting}
				>
					{#if isRedirecting}
						<LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" />
						Redirecting to Plex...
					{:else if isOAuthLoading}
						<LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" />
						Connecting to Plex...
					{:else}
						<span class="plex-icon" aria-hidden="true">&#9654;</span>
						Sign in with Plex
					{/if}
				</Button>

				{#if oauthError}
					<p class="error-message" role="alert">{oauthError}</p>
				{/if}
			</div>
		</div>
	</section>

	<footer class="footer">
		<p>Spotify Wrapped-style summaries for your Plex Media Server</p>
	</footer>
</div>

<PopupBlockedModal
	bind:open={showPopupBlockedModal}
	onContinue={handleContinueWithRedirect}
	onCancel={handleCancelRedirect}
/>

<style>
.landing {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	background: oklch(var(--background));
}

.hero {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 2rem;
	min-height: 80vh;
	position: relative;
	overflow: hidden;
}

.hero::before {
	content: "";
	position: absolute;
	inset: 0;
	background: radial-gradient(ellipse at center, oklch(var(--primary) / 0.1) 0%, transparent 70%);
	pointer-events: none;
}

.hero-content {
	max-width: 600px;
	text-align: center;
	position: relative;
	z-index: 1;
}

.logo-glow {
	margin-bottom: 1rem;
	filter: drop-shadow(0 0 20px oklch(var(--primary) / 0.5))
		drop-shadow(0 0 40px oklch(var(--primary) / 0.3));
}

.hero-title {
	margin: 0 0 1.5rem;
}

.title-main {
	display: block;
	font-size: clamp(2.5rem, 8vw, 4rem);
	font-weight: 900;
	letter-spacing: 0.15em;
	color: oklch(var(--primary));
	text-shadow:
		2px 2px 0 oklch(var(--primary) / 0.3),
		4px 4px 0 oklch(var(--primary) / 0.1);
}

.title-sub {
	display: block;
	font-size: clamp(1rem, 3vw, 1.5rem);
	font-weight: 400;
	letter-spacing: 0.3em;
	text-transform: uppercase;
	color: oklch(var(--accent));
	margin-top: 0.5rem;
}

.hero-description {
	font-size: 1.125rem;
	line-height: 1.7;
	color: oklch(var(--muted-foreground));
	margin: 0 0 2rem;
}

.username-section {
	margin-bottom: 2rem;
}

.username-form {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

/* When public lookup is disabled, the fallback sign-in link should keep
		   the primary CTA affordance; `.cta-link` only neutralises the anchor's
		   default underline. */
.signin-required-note {
	font-size: 0.95rem;
	color: oklch(var(--muted-foreground));
	margin: 0 0 0.75rem;
}

:global(a.cta-link) {
	text-decoration: none;
}

.username-input-group {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
	justify-content: center;
	/* Without this the input and the taller SubmitButton align to flex-start
			   and the button sits visibly offset. Centering + the matching 1px
			   transparent border on `.view-button` below give the two controls equal
			   border-box height and a shared vertical center so they read as one. */
	align-items: center;
}

.lookup-label {
	width: 100%;
	font-size: 0.9rem;
	font-weight: 600;
	text-align: center;
}

.lookup-help,
.lookup-boundary,
.lookup-status {
	max-width: 38rem;
	margin: 0 auto;
	overflow-wrap: anywhere;
	font-size: 0.82rem;
	line-height: 1.5;
	color: oklch(var(--muted-foreground));
}

.lookup-boundary {
	font-weight: 500;
}

.lookup-status {
	min-height: 1.25rem;
	color: oklch(var(--foreground));
}

/* shadcn Input renders inside a child component beyond Svelte's scoped
		   style boundary, so the selector must be global to preserve the custom
		   max-width and focus ring without duplicating them at the call site. */
:global(.username-input) {
	flex: 1;
	min-width: 200px;
	max-width: 300px;
	padding: 0.875rem 1rem;
	font-size: 1rem;
	background: oklch(var(--input));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--foreground));
	transition:
		border-color 0.2s ease,
		box-shadow 0.2s ease;
}

:global(.username-input::placeholder) {
	color: oklch(var(--muted-foreground));
}

/* `:focus-visible` (not `:focus`) keeps mouse clicks from over-styling;
		   text inputs still match it on click per the UA heuristic, so the ring
		   shows for both keyboard and pointer focus. The ring is a *solid*
		   `oklch(var(--ring))` (no alpha): a 0.2-alpha shadow composites to
		   <1.6:1 against the dark hero bg on every theme — below WCAG 2.1 AA's
		   3:1 non-text minimum — and the red theme can't clear 3:1 below full
		   opacity. Solid clears 3:1 on all themes (3.34–10.83). Matches the
		   `.login-button.secondary` + `.link-button` rings below for cohesion. */
:global(.username-input:focus-visible) {
	outline: none;
	border-color: oklch(var(--ring));
	box-shadow: 0 0 0 2px oklch(var(--ring));
}

:global(.username-input:disabled) {
	opacity: 0.7;
	cursor: not-allowed;
}

/* shadcn SubmitButton renders the actual <button> inside a child component,
		   so the selector must be global for the hero CTA's hover translate-y and
		   glow to reach the primitive without re-implementing those rules. */
:global(.view-button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.875rem 1.5rem;
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--primary-foreground));
	background: oklch(var(--primary));
	/* 1px transparent border matches `.username-input`'s 1px solid border so
			   both controls share the same border-box height (identical padding + font
			   already); paired with `align-items: center` they line up as one control. */
	border: 1px solid transparent;
	border-radius: var(--radius);
	cursor: pointer;
	transition: all 0.2s ease;
	white-space: nowrap;
	box-shadow:
		0 4px 14px oklch(var(--primary) / 0.4),
		0 0 0 0 oklch(var(--accent) / 0);
}

:global(.view-button:hover:not(:disabled)) {
	background: oklch(var(--primary) / 0.9);
	transform: translateY(-2px);
	box-shadow:
		0 6px 20px oklch(var(--primary) / 0.5),
		0 0 0 3px oklch(var(--accent) / 0.3);
}

:global(.view-button:active:not(:disabled)) {
	transform: translateY(0);
}

:global(.view-button:disabled) {
	opacity: 0.6;
	cursor: not-allowed;
}

.login-section {
	padding-top: 1.5rem;
	border-top: 1px solid oklch(var(--border) / 0.5);
}

.login-prompt {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	margin: 0 0 0.75rem;
}

/* Keep this hoisted for parity with the shadcn-backed controls above; a
		   future Button swap should not lose styling across the component boundary. */
:global(.login-button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 200px;
	padding: 0.75rem 1.5rem;
	font-size: 1rem;
	font-weight: 600;
	border: none;
	border-radius: var(--radius);
	cursor: pointer;
	transition: all 0.2s ease;
}

:global(.login-button.secondary) {
	background: oklch(var(--secondary));
	color: oklch(var(--secondary-foreground));
	border: 1px solid oklch(var(--border));
	box-shadow: none;
}

:global(.login-button.secondary:hover:not(:disabled)) {
	background: oklch(var(--muted));
	transform: none;
}

/* Restore the focus-visible ring the shadcn Button primitive ships in its
		   base class — the `:480 box-shadow: none` above clobbers it. Reuse the
		   same solid ring as `.username-input:focus-visible` so keyboard focus is
		   cohesive across the hero controls and clears WCAG 2.1 AA 3:1; `--ring`
		   is theme-redefined in app.css, so it recolors per theme. `:focus-visible`
		   keeps mouse clicks ring-free. Specificity (0,3,0) + later source order
		   beats `:480`. */
:global(.login-button.secondary:focus-visible) {
	box-shadow: 0 0 0 2px oklch(var(--ring));
}

:global(.login-button:disabled) {
	opacity: 0.8;
	cursor: not-allowed;
}

.plex-icon {
	font-size: 1.125rem;
}

.error-message {
	margin-top: 0.75rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--destructive) / 0.2);
	border: 1px solid oklch(var(--destructive));
	border-radius: var(--radius);
	color: oklch(var(--destructive-foreground));
	font-size: 0.875rem;
	overflow-wrap: anywhere;
}

.link-button {
	background: none;
	border: none;
	color: oklch(var(--primary));
	text-decoration: underline;
	cursor: pointer;
	font-size: inherit;
	padding: 0;
	margin-left: 0.25rem;
}

.link-button:hover {
	opacity: 0.8;
}

/* The native "Sign in now" link had no focus-visible rule — match the
		   solid button/input ring so keyboard users can see it at >=3:1. */
:global(.link-button:focus-visible) {
	box-shadow: 0 0 0 2px oklch(var(--ring));
}

.footer {
	padding: 1.5rem 2rem;
	text-align: center;
	border-top: 1px solid oklch(var(--border));
}

.footer p {
	margin: 0;
	font-size: 0.75rem;
	color: oklch(var(--foreground));
	letter-spacing: 0.05em;
}

@media (max-width: 640px) {
	.hero {
		min-height: 70vh;
		padding: 1.5rem;
	}

	.logo-glow :global(.logo) {
		width: 96px;
		height: 96px;
	}

	.hero-description {
		font-size: 1rem;
	}

	.username-input-group {
		flex-direction: column;
		align-items: stretch;
	}

	:global(.username-input) {
		max-width: none;
	}

	:global(.view-button) {
		justify-content: center;
		width: 100%;
	}

	:global(.login-button) {
		width: 100%;
		min-width: unset;
	}
}

/* Respect users who request reduced motion. */
@media (prefers-reduced-motion: reduce) {
	:global(.view-button),
	:global(.login-button),
	:global(.username-input) {
		transition: none;
	}
}
</style>
