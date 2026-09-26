<script lang="ts">
import KeyRound from '@lucide/svelte/icons/key-round';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import { Input } from '$lib/components/ui/input';
import type { ActionData } from './$types';

let { form }: { form: ActionData } = $props();
let token = $state('');
let isClaiming = $state(false);
</script>

<OnboardingCard
	title="Claim Setup"
	subtitle="Enter the bootstrap token printed in the server console"
>
	<form
		method="POST"
		action="?/claimInstance"
		class="claim-form"
		onsubmit={() => {
	isClaiming = true;
}}
	>
		<div class="icon-wrap">
			<KeyRound size={36} strokeWidth={1.75} />
		</div>

		<p class="claim-help">
			Only one browser can claim setup at a time. Active claims expire after 10 minutes, and
			bootstrap tokens expire after 15 minutes. If another browser already claimed setup, wait for
			it to expire and use the current console token, or restart the server to print a new banner.
		</p>

		<div class="field">
			<label for="bootstrap-token">Bootstrap token</label>
			<Input
				id="bootstrap-token"
				name="token"
				type="password"
				value={token}
				oninput={(e) => (token = e.currentTarget.value)}
				onchange={(e) => (token = e.currentTarget.value)}
				class="bootstrap-token-input"
				autocomplete="one-time-code"
				autocapitalize="none"
				spellcheck="false"
				placeholder="xxxx-xxxx-xxxx"
				required
			/>
		</div>

		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<SubmitButton
			class="claim-button tap-target"
			submitting={isClaiming}
			disabled={token.trim().length === 0}
		>
			{#snippet children()}
				Claim setup
			{/snippet}
			{#snippet submittingLabel()}
				Claiming…
			{/snippet}
		</SubmitButton>
	</form>
</OnboardingCard>

<style>
.claim-form {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	width: min(100%, 28rem);
	margin: 0 auto;
}

.icon-wrap {
	width: 4rem;
	height: 4rem;
	border-radius: 999px;
	display: grid;
	place-items: center;
	margin: 0 auto;
	background: oklch(var(--primary) / 0.12);
	color: oklch(var(--primary));
	border: 1px solid oklch(var(--primary) / 0.25);
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.claim-help {
	margin: 0;
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
	line-height: 1.5;
}

label {
	font-size: 0.875rem;
	font-weight: 600;
	color: oklch(var(--foreground));
}

/* shadcn Input child-renders the real <input>, so the monospace token
	   treatment must be hoisted. */
:global(.bootstrap-token-input) {
	width: 100%;
	border: 1px solid oklch(var(--border));
	border-radius: 0.5rem;
	background: oklch(var(--background));
	color: oklch(var(--foreground));
	padding: 0.85rem 1rem;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 1rem;
	letter-spacing: 0.04em;
}

:global(.bootstrap-token-input:focus) {
	outline: 2px solid oklch(var(--primary) / 0.45);
	outline-offset: 2px;
}

.error {
	margin: 0;
	color: oklch(var(--destructive));
	font-size: 0.875rem;
}

/* SubmitButton child-renders the real <button>, so this styling must cross
	   Svelte's component-scope boundary via :global. */
:global(.claim-button) {
	border: 0;
	border-radius: 0.5rem;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	font-weight: 700;
	padding: 0.85rem 1rem;
	cursor: pointer;
}

:global(.claim-button:disabled) {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
