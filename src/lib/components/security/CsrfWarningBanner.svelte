<script lang="ts">
import Settings from '@lucide/svelte/icons/settings';
import ShieldAlert from '@lucide/svelte/icons/shield-alert';
import X from '@lucide/svelte/icons/x';
import * as AlertDialog from '$lib/components/ui/alert-dialog';

interface Props {
	onDismiss: () => void;
}

let { onDismiss }: Props = $props();

let showFirstConfirmation = $state(false);
let showSecondConfirmation = $state(false);
let isDismissing = $state(false);

function handleDismissClick() {
	showFirstConfirmation = true;
}

function handleFirstConfirmationCancel() {
	showFirstConfirmation = false;
}

function handleFirstConfirmationProceed() {
	showFirstConfirmation = false;
	showSecondConfirmation = true;
}

function handleSecondConfirmationCancel() {
	showSecondConfirmation = false;
}

async function handlePermanentDismiss() {
	isDismissing = true;
	try {
		const response = await fetch('/api/security/dismiss-csrf-warning', {
			method: 'POST'
		});

		if (response.ok) {
			showSecondConfirmation = false;
			onDismiss();
		}
	} finally {
		isDismissing = false;
	}
}
</script>

<div class="csrf-warning-banner" role="alert">
	<div class="banner-content">
		<div class="banner-icon">
			<ShieldAlert class="icon" />
		</div>
		<div class="banner-text">
			<strong>Security Warning:</strong>
			CSRF protection is not configured, so Obzorarr accepts form posts from any origin.
		</div>
		<div class="banner-actions">
			<a href="/admin/settings?tab=security" class="configure-button">
				<Settings class="button-icon" />
				Configure CSRF Protection
			</a>
			<button
				type="button"
				class="dismiss-button"
				onclick={handleDismissClick}
				aria-label="Dismiss warning"
			>
				<X class="dismiss-icon" />
			</button>
		</div>
	</div>
</div>

<AlertDialog.Root bind:open={showFirstConfirmation}>
	<AlertDialog.Content class="csrf-dialog">
		<AlertDialog.Header>
			<div class="dialog-icon warning">
				<ShieldAlert class="icon" />
			</div>
			<AlertDialog.Title>Dismiss Security Warning?</AlertDialog.Title>
			<AlertDialog.Description>
				CSRF (Cross-Site Request Forgery) protection stops other websites from making requests on
				behalf of your users. Without it, an attacker can act as a signed-in user.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="warning-card">
			<p>Dismissing this warning means you accept that risk.</p>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={handleFirstConfirmationCancel}>Cancel</AlertDialog.Cancel>
			<button type="button" class="proceed-button" onclick={handleFirstConfirmationProceed}>
				I Understand the Risk
			</button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={showSecondConfirmation}>
	<AlertDialog.Content class="csrf-dialog">
		<AlertDialog.Header>
			<div class="dialog-icon danger">
				<ShieldAlert class="icon" />
			</div>
			<AlertDialog.Title>Dismiss the warning for good?</AlertDialog.Title>
			<AlertDialog.Description>
				The CSRF security warning will not appear again unless you reset it in the admin settings.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="info-card">
			<p>
				You can re-enable this warning later by going to <strong>Admin Settings → Security</strong>
				and clicking "Re-enable CSRF Warning".
			</p>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={handleSecondConfirmationCancel}>Cancel</AlertDialog.Cancel>
			<button
				type="button"
				class="danger-button"
				onclick={handlePermanentDismiss}
				disabled={isDismissing}
			>
				{#if isDismissing}
					Dismissing...
				{:else}
					Permanently Dismiss Warning
				{/if}
			</button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
.csrf-warning-banner {
	background: linear-gradient(
		135deg,
		oklch(0.7065 0.186 48.13 / 0.15) 0%,
		oklch(0.7065 0.186 48.13 / 0.08) 100%
	);
	border: 1px solid oklch(0.7065 0.186 48.13 / 0.3);
	border-radius: 0.5rem;
	padding: 0.875rem 1rem;
	margin: 1rem;
}

.banner-content {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.banner-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2.25rem;
	height: 2.25rem;
	background: oklch(0.7065 0.186 48.13 / 0.15);
	border-radius: 0.5rem;
	flex-shrink: 0;
}

.banner-icon :global(.icon) {
	width: 1.25rem;
	height: 1.25rem;
	color: oklch(0.7065 0.186 48.13);
}

.banner-text {
	flex: 1;
	font-size: 0.875rem;
	color: oklch(var(--foreground));
	line-height: 1.5;
	min-width: 200px;
}

.banner-text strong {
	color: oklch(0.7065 0.186 48.13);
}

.banner-actions {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	flex-shrink: 0;
}

.configure-button {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem 0.875rem;
	font-size: 0.8125rem;
	font-weight: 600;
	color: oklch(var(--primary-foreground));
	background: oklch(0.7065 0.186 48.13);
	border: none;
	border-radius: 0.375rem;
	text-decoration: none;
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		box-shadow 0.15s ease;
	white-space: nowrap;
}

.configure-button:hover {
	background: oklch(0.6726 0.1876 45.95);
	box-shadow: 0 0 0 3px oklch(0.7065 0.186 48.13 / 0.2);
}

.configure-button :global(.button-icon) {
	width: 0.875rem;
	height: 0.875rem;
}

.dismiss-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	background: transparent;
	border: 1px solid oklch(var(--border));
	border-radius: 0.375rem;
	color: oklch(var(--muted-foreground));
	cursor: pointer;
	transition: all 0.15s ease;
}

.dismiss-button:hover {
	background: oklch(var(--muted) / 0.5);
	color: oklch(var(--foreground));
	border-color: oklch(var(--border));
}

.dismiss-button :global(.dismiss-icon) {
	width: 1rem;
	height: 1rem;
}

:global(.csrf-dialog) {
	max-width: 28rem !important;
}

:global(.csrf-dialog [data-slot="alert-dialog-header"]) {
	text-align: center;
}

:global(.csrf-dialog [data-slot="alert-dialog-title"]) {
	text-align: center;
}

:global(.csrf-dialog [data-slot="alert-dialog-description"]) {
	text-align: center;
}

.dialog-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 3rem;
	height: 3rem;
	margin: 0 auto 0.75rem;
	border-radius: 12px;
}

.dialog-icon.warning {
	background: oklch(0.7065 0.186 48.13 / 0.15);
	color: oklch(0.7065 0.186 48.13);
}

.dialog-icon.danger {
	background: oklch(var(--destructive) / 0.15);
	color: oklch(var(--destructive));
}

.dialog-icon :global(.icon) {
	width: 1.5rem;
	height: 1.5rem;
}

.warning-card,
.info-card {
	padding: 0.875rem 1rem;
	margin: 0.5rem 0 0.25rem;
	border-radius: 8px;
}

.warning-card {
	background: oklch(0.7065 0.186 48.13 / 0.1);
	border: 1px solid oklch(0.7065 0.186 48.13 / 0.2);
}

.info-card {
	background: oklch(var(--muted) / 0.5);
	border: 1px solid oklch(var(--border));
}

.warning-card p,
.info-card p {
	margin: 0;
	font-size: 0.8125rem;
	line-height: 1.5;
	color: oklch(var(--muted-foreground));
}

.proceed-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 2.5rem;
	padding: 0 1rem;
	font-size: 0.875rem;
	font-weight: 600;
	color: oklch(var(--primary-foreground));
	background: oklch(0.7065 0.186 48.13);
	border: none;
	border-radius: calc(var(--radius) + 2px);
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		box-shadow 0.15s ease;
}

.proceed-button:hover {
	background: oklch(0.6726 0.1876 45.95);
	box-shadow: 0 0 0 3px oklch(0.7065 0.186 48.13 / 0.2);
}

.danger-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 2.5rem;
	padding: 0 1rem;
	font-size: 0.875rem;
	font-weight: 600;
	color: oklch(var(--destructive-foreground));
	background: oklch(var(--destructive));
	border: none;
	border-radius: calc(var(--radius) + 2px);
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		box-shadow 0.15s ease;
}

.danger-button:hover:not(:disabled) {
	background: oklch(var(--destructive) / 0.9);
	box-shadow: 0 0 0 3px oklch(var(--destructive) / 0.2);
}

.danger-button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

@media (max-width: 640px) {
	.banner-content {
		flex-direction: column;
		align-items: flex-start;
	}

	.banner-actions {
		width: 100%;
		margin-top: 0.5rem;
	}

	.configure-button {
		flex: 1;
		justify-content: center;
	}
}
</style>
