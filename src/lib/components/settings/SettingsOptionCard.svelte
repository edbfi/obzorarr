<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '$lib/utils.js';

interface Props {
	title: string;
	description?: string;
	control: Snippet;
	icon?: Snippet;
	swatches?: string[];
	meta?: string;
	class?: string;
}

let { title, description, control, icon, swatches = [], meta, class: className }: Props = $props();
</script>

<!-- biome-ignore lint/a11y/noLabelWithoutControl: The control snippet renders the labelable input inside this label. -->
<label class={cn('settings-option-card', icon && 'has-icon', meta && 'has-meta', className)}>
	<span class="option-control">{@render control()}</span>

	{#if icon}
		<span class="option-icon" aria-hidden="true">{@render icon()}</span>
	{/if}

	<span class="option-copy">
		<span class="option-heading" class:has-swatches={swatches.length > 0}>
			<span class="option-title">{title}</span>
			{#if swatches.length > 0}
				<span class="theme-swatches" aria-hidden="true">
					{#each swatches as swatch, index (`${swatch}-${index}`)}
						<span class="theme-swatch" style={`background: ${swatch};`}></span>
					{/each}
				</span>
			{/if}
		</span>
		{#if description}
			<span class="option-description">{description}</span>
		{/if}
	</span>

	{#if meta}
		<span class="option-meta">
			<span class="meta-text">{meta}</span>
		</span>
	{/if}
</label>

<style>
.settings-option-card {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: 0.75rem;
	min-height: 3.6rem;
	padding: 0.85rem 0.95rem;
	border: 1px solid oklch(var(--border));
	border-radius: calc(var(--radius) + 0.35rem);
	background: oklch(var(--card) / 0.45);
	cursor: pointer;
	transition:
		border-color 0.18s ease,
		background 0.18s ease,
		box-shadow 0.18s ease,
		transform 0.18s ease;
}

.settings-option-card.has-icon {
	grid-template-columns: auto auto minmax(0, 1fr);
}

.settings-option-card.has-meta {
	grid-template-columns: auto minmax(0, 1fr) auto;
}

.settings-option-card.has-icon.has-meta {
	grid-template-columns: auto auto minmax(0, 1fr) auto;
}

.settings-option-card:hover {
	border-color: oklch(var(--primary) / 0.38);
	background: oklch(var(--muted) / 0.42);
}

:global(.settings-option-card:has([data-state="checked"])),
:global(.settings-option-card:has([data-checked])) {
	border-color: oklch(var(--primary) / 0.62);
	background: linear-gradient(135deg, oklch(var(--primary) / 0.12), oklch(var(--muted) / 0.3));
	box-shadow: inset 0 0 0 1px oklch(var(--primary) / 0.1);
}

.option-control,
.option-icon,
.option-meta,
.theme-swatches {
	display: inline-flex;
	align-items: center;
}

.option-icon {
	justify-content: center;
	width: 2rem;
	height: 2rem;
	border-radius: 999px;
	border: 1px solid oklch(var(--border));
	background: oklch(var(--background) / 0.5);
	color: oklch(var(--primary));
}

:global(.option-icon svg) {
	width: 1rem;
	height: 1rem;
}

.option-copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 0.25rem;
}

.option-heading {
	display: block;
	min-width: 0;
}

.option-heading.has-swatches {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.55rem;
}

.option-title {
	min-width: 0;
	color: oklch(var(--foreground));
	font-size: 0.9rem;
	font-weight: 650;
	line-height: 1.25;
}

.option-description {
	color: oklch(var(--muted-foreground));
	font-size: 0.76rem;
	font-weight: 400;
	line-height: 1.4;
}

.option-meta {
	justify-content: flex-end;
	gap: 0.55rem;
}

.theme-swatches {
	gap: 0.22rem;
	padding: 0.16rem 0.24rem;
	border: 1px solid oklch(var(--border));
	border-radius: 999px;
	/* Lighter, near-opaque card surface so a dark swatch (one of the three is
		   near `--background` lightness on every theme) no longer disappears against
		   a near-black pill. Replaces the previous background→muted gradient. */
	background: oklch(var(--card) / 0.9);
	box-shadow: inset 0 1px 0 oklch(var(--foreground) / 0.04);
	isolation: isolate;
}

.theme-swatch {
	display: inline-block;
	width: 0.68rem;
	height: 0.68rem;
	/* Light inner edge + a stronger `--foreground`-tinted outer ring (was a faint
		   `--border` ring) so every swatch keeps a visible boundary even when its fill
		   nearly matches the pill surface. */
	border: 1px solid oklch(var(--foreground) / 0.2);
	border-radius: 999px;
	box-shadow: 0 0 0 1px oklch(var(--foreground) / 0.3);
}

.meta-text {
	color: oklch(var(--muted-foreground));
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

@media (max-width: 560px) {
	.settings-option-card,
	.settings-option-card.has-icon {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.settings-option-card.has-meta,
	.settings-option-card.has-icon.has-meta {
		grid-template-columns: auto minmax(0, 1fr) auto;
	}

	.option-icon {
		display: none;
	}
}
</style>
