<script lang="ts">
import PlayIcon from '@lucide/svelte/icons/play';
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import { Button } from '$lib/components/ui/button';

interface Props {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onContinue: () => void;
	onCancel: () => void;
}

// ISSUE-002: this in-app overlay is always dismissable without starting OAuth —
// the visible "Cancel" button (and Escape, via AlertDialog) calls onCancel and
// closes, returning the user to the prior page intact. Only "Continue to Plex"
// (handleContinue) initiates the OAuth flow. The report's "Escape/backdrop
// navigates away" symptom is the Plex-hosted OAuth page (third-party DOM we do
// not own), not this modal.
let { open = $bindable(false), onOpenChange, onContinue, onCancel }: Props = $props();

function handleOpenChange(value: boolean): void {
	open = value;
	onOpenChange?.(value);
}

function handleContinue(): void {
	open = false;
	onContinue();
}

function handleCancel(): void {
	open = false;
	onCancel();
}
</script>

<AlertDialog.Root bind:open onOpenChange={handleOpenChange}>
	<AlertDialog.Content class="popup-blocked-modal">
		<AlertDialog.Header>
			<div class="header-icon">
				<svg
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M9 3v18" />
					<path d="m14 9 3 3-3 3" />
				</svg>
			</div>
			<AlertDialog.Title>Popup Blocked</AlertDialog.Title>
			<AlertDialog.Description>
				Your browser blocked the login popup. This is common in Safari and privacy-focused browsers.
			</AlertDialog.Description>
		</AlertDialog.Header>

		<div class="info-card">
			<div class="info-icon">
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
				>
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
					<polyline points="15 3 21 3 21 9" />
					<line x1="10" y1="14" x2="21" y2="3" />
				</svg>
			</div>
			<p>
				Continue in this window instead. Obzorarr sends you to Plex to sign in and brings you back
				here.
			</p>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={handleCancel}>Cancel</AlertDialog.Cancel>
			<Button class="tap-target" onclick={handleContinue}>
				<PlayIcon />
				Continue to Plex
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
:global(.popup-blocked-modal) {
	max-width: 26rem !important;
}

:global(.popup-blocked-modal [data-slot="alert-dialog-header"]) {
	text-align: center;
}

:global(.popup-blocked-modal [data-slot="alert-dialog-title"]) {
	text-align: center;
}

:global(.popup-blocked-modal [data-slot="alert-dialog-description"]) {
	text-align: center;
}

.header-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 3rem;
	height: 3rem;
	margin: 0 auto 0.75rem;
	border-radius: 12px;
	background: oklch(var(--primary) / 0.1);
	color: oklch(var(--primary));
}

.info-card {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
	padding: 0.875rem 1rem;
	margin: 0.5rem 0 0.25rem;
	background: oklch(var(--muted) / 0.5);
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
}

.info-icon {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.5rem;
	height: 1.5rem;
	margin-top: 0.0625rem;
	color: oklch(var(--muted-foreground));
}

.info-card p {
	margin: 0;
	font-size: 0.8125rem;
	line-height: 1.5;
	color: oklch(var(--muted-foreground));
}
</style>
