<script lang="ts">
import ArrowRight from '@lucide/svelte/icons/arrow-right';
import DatabaseIcon from '@lucide/svelte/icons/database';
import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
import PaletteIcon from '@lucide/svelte/icons/palette';
import PlugIcon from '@lucide/svelte/icons/plug';
import Settings2Icon from '@lucide/svelte/icons/settings-2';
import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

const sections = [
	{
		name: 'Connections',
		href: '/admin/settings/connections',
		icon: PlugIcon,
		description: 'Configure your Plex server URL, token, and API credentials.'
	},
	{
		name: 'Security',
		href: '/admin/settings/security',
		icon: ShieldCheckIcon,
		description: 'Manage authentication, registration, and access control.'
	},
	{
		name: 'Data',
		href: '/admin/settings/data',
		icon: DatabaseIcon,
		description: 'Control sync schedules, retention, and history settings.'
	},
	{
		name: 'System',
		href: '/admin/settings/system',
		icon: Settings2Icon,
		description: 'Logging levels, diagnostics, and maintenance options.'
	},
	{
		name: 'Appearance',
		href: '/admin/settings/appearance',
		icon: PaletteIcon,
		description: 'Theme, branding, and visual presentation preferences.'
	},
	{
		name: 'Privacy',
		href: '/admin/settings/privacy',
		icon: LockKeyholeIcon,
		description: 'Anonymization, sharing controls, and data visibility.'
	}
] as const;
</script>

<svelte:head>
	<title>Settings - Admin - Obzorarr</title>
</svelte:head>

<div class="hub">
	<p class="hub-intro">Select a section below to configure your server.</p>
	<div class="hub-grid">
		{#each sections as section (section.href)}
			{@const Icon = section.icon}
			<a href={section.href} class="hub-card">
				<div class="hub-card-glow"></div>
				<div class="hub-icon-wrap">
					<Icon class="hub-icon" aria-hidden="true" />
				</div>
				<div class="hub-card-body">
					<span class="hub-card-name">{section.name}</span>
					<span class="hub-card-desc">{section.description}</span>
				</div>
				<ArrowRight class="hub-arrow" aria-hidden="true" />
			</a>
		{/each}
	</div>
</div>

<style>
.hub {
	padding: 1.5rem;
}

.hub-intro {
	margin: 0 0 1.25rem;
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
}

.hub-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 1rem;
}

.hub-card {
	position: relative;
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1.125rem 1.25rem;
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: 0.75rem;
	text-decoration: none;
	overflow: hidden;
	transition:
		border-color 0.2s ease,
		box-shadow 0.2s ease,
		transform 0.2s ease;
}

.hub-card:hover {
	border-color: oklch(var(--primary) / 0.5);
	box-shadow: 0 6px 20px -4px oklch(var(--primary) / 0.15);
	transform: translateY(-2px);
}

.hub-card:focus-visible {
	outline: 2px solid oklch(var(--ring));
	outline-offset: 2px;
}

.hub-card-glow {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.5), transparent);
	opacity: 0;
	transition: opacity 0.2s ease;
}

.hub-card:hover .hub-card-glow {
	opacity: 1;
}

.hub-icon-wrap {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2.75rem;
	height: 2.75rem;
	border-radius: 0.625rem;
	background: oklch(var(--primary) / 0.1);
	flex-shrink: 0;
	transition: background 0.2s ease;
}

.hub-card:hover .hub-icon-wrap {
	background: oklch(var(--primary) / 0.18);
}

.hub-card :global(.hub-icon) {
	width: 1.25rem;
	height: 1.25rem;
	color: oklch(var(--primary));
}

.hub-card-body {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	position: relative;
	z-index: 1;
}

.hub-card-name {
	font-size: 0.9375rem;
	font-weight: 600;
	color: oklch(var(--foreground));
}

.hub-card-desc {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
	line-height: 1.4;
}

.hub-card :global(.hub-arrow) {
	width: 1rem;
	height: 1rem;
	color: oklch(var(--muted-foreground) / 0.5);
	flex-shrink: 0;
	transition:
		color 0.2s ease,
		transform 0.2s ease;
}

.hub-card:hover :global(.hub-arrow) {
	color: oklch(var(--primary));
	transform: translateX(3px);
}

@media (max-width: 640px) {
	.hub {
		padding: 1rem;
	}

	.hub-grid {
		grid-template-columns: 1fr;
	}
}
</style>
