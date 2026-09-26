<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '$lib/utils.js';
import SettingsStatusPill from './SettingsStatusPill.svelte';

interface Props {
	id: string;
	title: string;
	description: string;
	checked: boolean;
	disabled?: boolean;
	disabledReason?: string;
	onLabel?: string;
	offLabel?: string;
	icon?: Snippet;
	class?: string;
	ariaDescribedby?: string;
	ariaInvalid?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
}

let {
	id,
	title,
	description,
	checked = $bindable(false),
	disabled = false,
	disabledReason,
	onLabel = 'Enabled',
	offLabel = 'Disabled',
	icon,
	class: className,
	ariaDescribedby,
	ariaInvalid
}: Props = $props();

const labelId = $derived(`${id}-label`);
const descriptionId = $derived(`${id}-description`);
const stateId = $derived(`${id}-state`);
const describedBy = $derived([descriptionId, stateId, ariaDescribedby].filter(Boolean).join(' '));
</script>

<label
	for={id}
	class={cn('settings-toggle-row', checked && 'checked', disabled && 'disabled', className)}
	data-checked={checked}
	data-disabled={disabled || undefined}
>
	{#if icon}
		<span class="toggle-row-icon" aria-hidden="true">{@render icon()}</span>
	{/if}

	<span class="toggle-row-copy">
		<span id={labelId} class="toggle-row-title">{title}</span>
		<span id={descriptionId} class="toggle-row-description">
			{description}
			{#if disabled && disabledReason}
				<span class="disabled-reason"> {disabledReason}</span>
			{/if}
		</span>
	</span>

	<span class="toggle-row-control">
		<SettingsStatusPill id={stateId} tone={checked ? 'success' : 'neutral'}>
			{checked ? onLabel : offLabel}
		</SettingsStatusPill>
		<input
			{id}
			type="checkbox"
			role="switch"
			aria-checked={checked}
			class="toggle-switch"
			bind:checked
			{disabled}
			aria-labelledby={labelId}
			aria-describedby={describedBy}
			aria-invalid={ariaInvalid}
		>
	</span>
</label>

<style>
.settings-toggle-row {
	display: flex;
	align-items: center;
	gap: 0.9rem;
	justify-content: space-between;
	padding: 0.9rem 1rem;
	border: 1px solid oklch(var(--border));
	border-radius: calc(var(--radius) + 0.35rem);
	position: relative;
	background: linear-gradient(135deg, oklch(var(--muted) / 0.34), oklch(var(--card) / 0.58));
	cursor: pointer;
	transition:
		border-color 0.18s ease,
		background 0.18s ease,
		box-shadow 0.18s ease;
}

.settings-toggle-row:hover:not(.disabled) {
	border-color: oklch(var(--primary) / 0.45);
	background: linear-gradient(135deg, oklch(var(--primary) / 0.08), oklch(var(--muted) / 0.36));
	box-shadow: inset 0 0 0 1px oklch(var(--primary) / 0.08);
}

.settings-toggle-row.checked {
	border-color: oklch(var(--primary) / 0.55);
	background: linear-gradient(135deg, oklch(var(--primary) / 0.13), oklch(var(--muted) / 0.28));
}

.settings-toggle-row.disabled {
	cursor: not-allowed;
	opacity: 0.7;
}

.toggle-row-icon {
	position: relative;
	z-index: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 auto;
	width: 2rem;
	height: 2rem;
	border-radius: 999px;
	border: 1px solid oklch(var(--border));
	background: oklch(var(--background) / 0.55);
	color: oklch(var(--primary));
}

:global(.toggle-row-icon svg) {
	width: 1rem;
	height: 1rem;
}

.toggle-row-copy {
	position: relative;
	z-index: 1;
	display: flex;
	flex: 1 1 auto;
	min-width: 0;
	flex-direction: column;
	gap: 0.28rem;
}

.toggle-row-title {
	color: oklch(var(--foreground));
	font-size: 0.92rem;
	font-weight: 650;
	line-height: 1.25;
}

.toggle-row-description {
	color: oklch(var(--muted-foreground));
	font-size: 0.78rem;
	line-height: 1.45;
}

.disabled-reason {
	color: oklch(var(--foreground) / 0.72);
}

.toggle-row-control {
	position: relative;
	z-index: 1;
	display: inline-flex;
	align-items: center;
	gap: 0.65rem;
	flex: 0 0 auto;
}

.toggle-switch {
	position: relative;
	width: 2rem;
	height: 1.15rem;
	margin: 0;
	flex: 0 0 auto;
	appearance: none;
	border: 1px solid oklch(var(--border));
	border-radius: 999px;
	background: oklch(var(--input));
	cursor: pointer;
	outline: none;
	transition:
		background 0.18s ease,
		border-color 0.18s ease,
		box-shadow 0.18s ease;
}

.toggle-switch::after {
	content: "";
	position: absolute;
	top: 1px;
	left: 1px;
	width: calc(1.15rem - 4px);
	height: calc(1.15rem - 4px);
	border-radius: 999px;
	background: oklch(var(--background));
	box-shadow: 0 1px 3px oklch(0 0 0 / 0.28);
	transition:
		transform 0.18s ease,
		background 0.18s ease;
}

.toggle-switch:checked {
	border-color: oklch(var(--primary));
	background: oklch(var(--primary));
}

.toggle-switch:checked::after {
	background: oklch(var(--primary-foreground));
	transform: translateX(calc(2rem - 1.15rem));
}

.toggle-switch:focus-visible {
	box-shadow: 0 0 0 3px oklch(var(--ring) / 0.35);
}

.toggle-switch:disabled {
	cursor: not-allowed;
}

@media (max-width: 560px) {
	.settings-toggle-row {
		align-items: flex-start;
		flex-direction: column;
	}

	.toggle-row-control {
		width: 100%;
		justify-content: space-between;
	}
}
</style>
