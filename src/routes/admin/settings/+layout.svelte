<script lang="ts">
import DatabaseIcon from '@lucide/svelte/icons/database';
import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
import PaletteIcon from '@lucide/svelte/icons/palette';
import PlugIcon from '@lucide/svelte/icons/plug';
import Settings2Icon from '@lucide/svelte/icons/settings-2';
import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
import type { Snippet } from 'svelte';
import { page } from '$app/state';

interface Props {
	children: Snippet;
}

let { children }: Props = $props();

const tabs = [
	{ name: 'Connections', href: '/admin/settings/connections', icon: PlugIcon },
	{ name: 'Security', href: '/admin/settings/security', icon: ShieldCheckIcon },
	{ name: 'Data', href: '/admin/settings/data', icon: DatabaseIcon },
	{ name: 'System', href: '/admin/settings/system', icon: Settings2Icon },
	{ name: 'Appearance', href: '/admin/settings/appearance', icon: PaletteIcon },
	{ name: 'Privacy', href: '/admin/settings/privacy', icon: LockKeyholeIcon }
];

// DF-009: keep one page-level <h1> in the settings shell for orientation and
// accessibility; the index route redirects and child tabs only have per-card headings.
const activeTab = $derived(
	tabs.find((tab) => page.url.pathname.startsWith(tab.href))?.name ?? 'Settings'
);

// US-022: the bare /admin/settings load always 303s to /admin/settings/connections,
// so this layout only renders for the six nested-route paths below.
// (The `isMonolith` suppression that lived here pre-US-022 is gone — see
// commit cf958fa.)
</script>

<header class="settings-heading">
	<h1>{activeTab}</h1>
	<p>Manage your Obzorarr server configuration.</p>
</header>

<nav class="settings-tabs" aria-label="Settings sections">
	<ul>
		{#each tabs as tab (tab.href)}
			{@const active = page.url.pathname.startsWith(tab.href)}
			{@const Icon = tab.icon}
			<li>
				<a href={tab.href} class:active aria-current={active ? 'page' : undefined}>
					<Icon aria-hidden="true" />
					<span>{tab.name}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>

{@render children()}

<style>
.settings-heading {
	padding: 1.25rem 1.5rem 0.5rem;
}
.settings-heading h1 {
	margin: 0;
	font-size: 1.5rem;
	font-weight: 700;
	color: oklch(var(--foreground));
}
.settings-heading p {
	margin: 0.25rem 0 0;
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
}
.settings-tabs {
	border-bottom: 1px solid oklch(var(--border));
	background:
		linear-gradient(180deg, oklch(var(--card) / 0.28), transparent), oklch(var(--background) / 0.72);
	padding: 0.75rem 1.5rem;
}
.settings-tabs ul {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
	list-style: none;
	margin: 0;
	padding: 0;
}
.settings-tabs a {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	padding: 0.65rem 0.85rem;
	color: oklch(var(--muted-foreground));
	text-decoration: none;
	font-size: 0.875rem;
	font-weight: 600;
	border: 1px solid transparent;
	border-radius: calc(var(--radius) + 0.25rem);
	transition:
		color 0.15s ease,
		border-color 0.15s ease,
		background 0.15s ease,
		box-shadow 0.15s ease;
}
.settings-tabs a :global(svg) {
	width: 1rem;
	height: 1rem;
	opacity: 0.82;
}
.settings-tabs a:hover {
	color: oklch(var(--foreground));
	background: oklch(var(--muted) / 0.38);
	border-color: oklch(var(--border));
}
.settings-tabs a:focus-visible {
	outline: 2px solid oklch(var(--ring));
	outline-offset: 2px;
}
.settings-tabs a.active {
	color: oklch(var(--primary));
	background: linear-gradient(135deg, oklch(var(--primary) / 0.12), oklch(var(--card) / 0.9));
	border-color: oklch(var(--primary) / 0.32);
	box-shadow:
		inset 0 0 0 1px oklch(var(--primary) / 0.08),
		0 8px 24px oklch(var(--primary) / 0.08);
}
.settings-tabs a.active :global(svg) {
	opacity: 1;
}

@media (max-width: 640px) {
	.settings-tabs {
		padding-inline: 1rem;
	}

	.settings-tabs a {
		padding-inline: 0.7rem;
	}
}
</style>
