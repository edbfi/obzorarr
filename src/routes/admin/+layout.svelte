<script lang="ts">
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import FileText from '@lucide/svelte/icons/file-text';
import GalleryHorizontal from '@lucide/svelte/icons/gallery-horizontal';
import Gift from '@lucide/svelte/icons/gift';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import LogOut from '@lucide/svelte/icons/log-out';
import Menu from '@lucide/svelte/icons/menu';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Settings from '@lucide/svelte/icons/settings';
import User from '@lucide/svelte/icons/user';
import Users from '@lucide/svelte/icons/users';
import X from '@lucide/svelte/icons/x';
import { type Component, type Snippet, tick } from 'svelte';
import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import Logo from '$lib/components/Logo.svelte';
import CsrfWarningBanner from '$lib/components/security/CsrfWarningBanner.svelte';
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import type { LayoutData } from './$types';

interface Props {
	data: LayoutData;
	children: Snippet;
}

let { data, children }: Props = $props();

const navItems: Array<{ href: string; label: string; icon: Component }> = [
	{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
	{ href: '/admin/wrapped', label: 'Wrapped', icon: Gift },
	{ href: '/admin/slides', label: 'Slides', icon: GalleryHorizontal },
	{ href: '/admin/sync', label: 'Sync', icon: RefreshCw },
	{ href: '/admin/users', label: 'Users', icon: Users },
	{ href: '/admin/logs', label: 'Logs', icon: FileText },
	{ href: '/admin/settings', label: 'Settings', icon: Settings }
];

const isActive = $derived((href: string) => {
	const currentPath = $page.url.pathname;
	if (href === '/admin') {
		return currentPath === '/admin';
	}
	return currentPath.startsWith(href);
});

let sidebarOpen = $state(false);
let isMobileSidebar = $state(false);
let sidebarHiddenFromMobile = $derived(isMobileSidebar && !sidebarOpen);
let mainContentHiddenFromMobile = $derived(isMobileSidebar && sidebarOpen);
let adminAvatarError = $state(false);
let sidebarElement = $state<HTMLElement | undefined>();

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

$effect(() => {
	if (!browser) return;

	const query = window.matchMedia('(max-width: 768px)');
	const syncMobileState = () => {
		isMobileSidebar = query.matches;
	};

	syncMobileState();
	query.addEventListener('change', syncMobileState);

	return () => query.removeEventListener('change', syncMobileState);
});

async function focusAfterRender(selector: string) {
	await tick();
	document.querySelector<HTMLElement>(selector)?.focus();
}

$effect(() => {
	data.adminUser.thumb;
	adminAvatarError = false;
});

let locallyDismissed = $state(false);
let showCsrfWarning = $derived(data.csrfWarning.show && !locallyDismissed);

$effect(() => {
	if (data.csrfWarning.show) {
		locallyDismissed = false;
	}
});

function toggleSidebar() {
	sidebarOpen = !sidebarOpen;

	if (sidebarOpen) {
		void focusAfterRender('.sidebar-close-button');
	}
}

function closeSidebar() {
	sidebarOpen = false;
	void focusAfterRender('.menu-button');
}

function shouldUseClientNavigation(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
	return (
		event.button === 0 &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey &&
		!event.altKey &&
		(!anchor.target || anchor.target === '_self')
	);
}

async function handleAdminNavigation(event: MouseEvent) {
	const anchor = event.currentTarget;
	if (!(anchor instanceof HTMLAnchorElement) || !shouldUseClientNavigation(event, anchor)) {
		return;
	}

	const href = anchor.getAttribute('href');
	if (!href) return;

	event.preventDefault();
	const shouldRestoreFocus = isMobileSidebar;
	if (shouldRestoreFocus) {
		sidebarOpen = false;
		await focusAfterRender('.menu-button');
	}
	void goto(href, { keepFocus: shouldRestoreFocus });
}

function getSidebarFocusableElements(): HTMLElement[] {
	if (!sidebarElement) return [];
	return Array.from(sidebarElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) => element.tabIndex >= 0 && element.getClientRects().length > 0
	);
}

function trapSidebarFocus(event: KeyboardEvent) {
	if (!isMobileSidebar || !sidebarOpen || event.key !== 'Tab') return;

	const focusableElements = getSidebarFocusableElements();
	if (focusableElements.length === 0) {
		event.preventDefault();
		sidebarElement?.focus();
		return;
	}

	const first = focusableElements[0];
	const last = focusableElements.at(-1);
	const activeElement = document.activeElement;

	if (event.shiftKey && (activeElement === first || !sidebarElement?.contains(activeElement))) {
		event.preventDefault();
		last?.focus();
	} else if (
		!event.shiftKey &&
		(activeElement === last || !sidebarElement?.contains(activeElement))
	) {
		event.preventDefault();
		first?.focus();
	}
}

function handleWindowKeydown(event: KeyboardEvent) {
	if (isMobileSidebar && sidebarOpen && event.key === 'Escape') {
		event.preventDefault();
		void closeSidebar();
	}
}

function handleCsrfWarningDismissed() {
	locallyDismissed = true;
	invalidateAll();
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="admin-layout">
		<header class="mobile-header" class:sidebar-open={sidebarOpen}>
		<button
			type="button"
			class="menu-button"
			onclick={toggleSidebar}
			aria-label="Toggle navigation"
		>
			{#if sidebarOpen}
				<X class="menu-icon" />
			{:else}
				<Menu class="menu-icon" />
			{/if}
		</button>
		<div class="mobile-branding">
			<Logo size="sm" />
			<h1 class="mobile-title">Admin</h1>
		</div>
	</header>

	{#if sidebarOpen}
		<button
			type="button"
			class="sidebar-overlay"
			onclick={closeSidebar}
			onkeydown={(e) => e.key === 'Escape' && closeSidebar()}
			tabindex="-1"
			aria-label="Close sidebar"
		></button>
	{/if}

	<aside
		class="sidebar"
		class:open={sidebarOpen}
		inert={sidebarHiddenFromMobile}
		aria-hidden={sidebarHiddenFromMobile ? 'true' : undefined}
		onkeydown={trapSidebarFocus}
		tabindex="-1"
		bind:this={sidebarElement}
	>
			<div class="sidebar-header">
				<div class="sidebar-branding">
					<Logo size="md" />
					<div class="sidebar-text">
						<h2 class="sidebar-title">Obzorarr</h2>
						<span class="sidebar-subtitle">Admin Panel</span>
					</div>
				</div>
				<button
					type="button"
					class="sidebar-close-button"
					onclick={closeSidebar}
					aria-label="Close navigation"
				>
					<X class="sidebar-close-icon" />
				</button>
			</div>

		<nav class="sidebar-nav" aria-label="Admin navigation">
			<ul class="nav-list">
				{#each navItems as item (item.href)}
					{@const active = isActive(item.href)}
					<li>
						<a
							href={item.href}
							class="nav-link"
							class:active
							aria-current={active ? 'page' : undefined}
							onclick={handleAdminNavigation}
						>
							<span class="nav-icon-wrap" class:active>
								<item.icon class="nav-icon" />
							</span>
							<span class="nav-label">{item.label}</span>
							{#if active}
								<ChevronRight class="nav-indicator" />
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="sidebar-footer">
			<div class="user-card">
				<div class="user-avatar">
					{#if data.adminUser.thumb && !adminAvatarError}
						<img
							src={data.adminUser.thumb}
							alt={data.adminUser.username}
							class="user-avatar-img"
							onerror={() => {
								adminAvatarError = true;
							}}
						/>
					{:else}
						<User class="user-avatar-icon" />
					{/if}
				</div>
				<div class="user-info">
					<span class="user-name">{data.adminUser.username}</span>
					<span class="user-role">Administrator</span>
				</div>
			</div>
			<form id="admin-logout-form" method="POST" action="/auth/logout" use:enhance>
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<button type="button" class="logout-button" {...props}>
								<LogOut class="logout-icon" />
								<span>Logout</span>
							</button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Sign out?</AlertDialog.Title>
							<AlertDialog.Description>
								You will be returned to the sign-in page.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
							<AlertDialog.Action type="submit" form="admin-logout-form">Sign out</AlertDialog.Action>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
				<noscript>
					<button type="submit" class="logout-button">
						<LogOut class="logout-icon" />
						<span>Logout</span>
					</button>
				</noscript>
			</form>
			<div
				class="text-[10px] text-muted-foreground/50 font-mono tracking-wider text-center leading-none select-all"
				title={data.appVersion.kind}
			>
				{data.appVersion.display}
			</div>
		</div>
	</aside>

	<main
		class="main-content"
		inert={mainContentHiddenFromMobile}
		aria-hidden={mainContentHiddenFromMobile ? 'true' : undefined}
	>
		{#if showCsrfWarning}
			<CsrfWarningBanner onDismiss={handleCsrfWarningDismissed} />
		{/if}
		{@render children()}
	</main>
</div>

<style>
	.admin-layout {
			display: flex;
			min-height: 100vh;
			background: oklch(var(--background));
		}

		.mobile-header {
			display: none;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			height: 56px;
			background: oklch(var(--card) / 0.95);
			backdrop-filter: blur(12px);
			border-bottom: 1px solid oklch(var(--border));
			padding: 0 1rem;
			align-items: center;
			gap: 1rem;
			z-index: 40;
		}

		.menu-button {
			display: flex;
			align-items: center;
			justify-content: center;
			/* WCAG 2.1 SC 2.5.5 floor — was 40×40, now 44×44 via the shared token. */
			width: var(--min-tap-size);
			height: var(--min-tap-size);
			min-width: var(--min-tap-size);
			min-height: var(--min-tap-size);
			background: transparent;
			border: none;
			color: oklch(var(--foreground));
			cursor: pointer;
			border-radius: 0.5rem;
			transition: all 0.2s ease;
		}

		.menu-button:hover {
			background: oklch(var(--muted));
		}

		.menu-button :global(.menu-icon) {
			width: 1.25rem;
			height: 1.25rem;
		}

		.mobile-branding {
			display: flex;
			align-items: center;
			gap: 0.75rem;
		}

		.mobile-title {
			font-size: 1.125rem;
			font-weight: 600;
			color: oklch(var(--primary));
			margin: 0;
		}

		.sidebar-overlay {
			display: none;
			position: fixed;
			inset: 0;
			background: oklch(0 0 0 / 0.6);
			backdrop-filter: blur(4px);
			z-index: 45;
		}

		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			width: 260px;
			background: oklch(var(--card));
			border-right: 1px solid oklch(var(--border));
			display: flex;
			flex-direction: column;
			z-index: 50;
		}

			.sidebar-header {
				padding: 1.25rem 1.5rem;
				border-bottom: 1px solid oklch(var(--border) / 0.5);
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
				min-width: 0;
			}

			.sidebar-branding {
				display: flex;
				align-items: center;
				gap: 0.75rem;
				flex: 1;
				min-width: 0;
			}

			.sidebar-text {
				display: flex;
				flex-direction: column;
				min-width: 0;
			}

			.sidebar-title {
				font-size: 1.25rem;
				font-weight: 700;
			color: oklch(var(--primary));
				margin: 0;
				line-height: 1.2;
				letter-spacing: 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.sidebar-subtitle {
				font-size: 0.6875rem;
				color: oklch(var(--muted-foreground));
				text-transform: uppercase;
				letter-spacing: 0.08em;
				margin-top: 0.125rem;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.sidebar-close-button {
				display: none;
				align-items: center;
				justify-content: center;
				width: 2.25rem;
				height: 2.25rem;
				flex: 0 0 2.25rem;
				background: transparent;
				border: 1px solid oklch(var(--border) / 0.6);
				color: oklch(var(--foreground));
				cursor: pointer;
				border-radius: 0.5rem;
				transition: all 0.2s ease;
			}

			.sidebar-close-button:hover {
				background: oklch(var(--muted));
			}

			.sidebar-close-button :global(.sidebar-close-icon) {
				width: 1rem;
				height: 1rem;
			}

		.sidebar-nav {
			flex: 1;
			padding: 1rem 0.75rem;
			overflow-y: auto;
		}

		.nav-list {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
		}

		.nav-link {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.625rem 0.875rem;
			color: oklch(var(--muted-foreground));
			text-decoration: none;
			font-weight: 500;
			border-radius: 0.5rem;
			transition: all 0.2s ease;
			position: relative;
		}

		.nav-link:hover {
			background: oklch(var(--muted) / 0.5);
			color: oklch(var(--foreground));
		}

		.nav-link.active {
			background: oklch(var(--primary) / 0.12);
			color: oklch(var(--primary));
		}

		.nav-icon-wrap {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 2rem;
			height: 2rem;
			border-radius: 0.375rem;
			background: oklch(var(--muted) / 0.5);
			transition: all 0.2s ease;
		}

		.nav-link:hover .nav-icon-wrap {
			background: oklch(var(--muted));
		}

		.nav-icon-wrap.active {
			background: oklch(var(--primary) / 0.15);
		}

		.nav-link :global(.nav-icon) {
			width: 1rem;
			height: 1rem;
			transition: all 0.2s ease;
		}

		.nav-link.active :global(.nav-icon) {
			color: oklch(var(--primary));
		}

		.nav-label {
			font-size: 0.875rem;
			flex: 1;
		}

		.nav-link :global(.nav-indicator) {
			width: 1rem;
			height: 1rem;
			color: oklch(var(--primary));
			opacity: 0;
			transform: translateX(-4px);
			transition: all 0.2s ease;
		}

		.nav-link.active :global(.nav-indicator) {
			opacity: 1;
			transform: translateX(0);
		}

		.sidebar-footer {
			padding: 1rem;
			border-top: 1px solid oklch(var(--border) / 0.5);
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
		}

		.user-card {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.75rem;
			background: oklch(var(--muted) / 0.3);
			border-radius: 0.5rem;
			border: 1px solid oklch(var(--border) / 0.5);
		}

		.user-avatar {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 2.25rem;
			height: 2.25rem;
			background: linear-gradient(135deg, oklch(var(--primary)) 0%, oklch(var(--primary) / 0.8) 100%);
			border-radius: 0.5rem;
			flex-shrink: 0;
			overflow: hidden;
		}

		.user-avatar :global(.user-avatar-icon) {
			width: 1.125rem;
			height: 1.125rem;
			color: oklch(var(--primary-foreground));
		}

		.user-avatar-img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}

		.user-info {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}

		.user-name {
			font-size: 0.875rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.user-role {
			font-size: 0.6875rem;
			color: oklch(var(--muted-foreground));
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.logout-button {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			width: 100%;
			padding: 0.5rem 0.75rem;
			background: oklch(var(--muted) / 0.3);
			color: oklch(var(--muted-foreground));
			border: 1px solid oklch(var(--border) / 0.5);
			border-radius: 0.5rem;
			font-size: 0.8125rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.logout-button:hover {
			background: oklch(var(--destructive) / 0.15);
			color: oklch(var(--destructive));
			border-color: oklch(var(--destructive) / 0.3);
		}

		.logout-button :global(.logout-icon) {
			width: 0.875rem;
			height: 0.875rem;
		}

		.main-content {
			flex: 1;
			margin-left: 260px;
			min-height: 100vh;
		}

		/* 768px covers phones through tablets; verified 2026-04 at 375px and 280px
		   (Galaxy Fold folded). Collapses the sidebar behind an overlay and drops the
		   main-content left margin, so content fills the viewport without horizontal
		   scroll at smaller widths. */
		@media (max-width: 768px) {
				.mobile-header {
					display: flex;
				}

				.mobile-header.sidebar-open {
					visibility: hidden;
					pointer-events: none;
				}

				.sidebar-overlay {
					display: block;
				}

			.sidebar {
				transform: translateX(-100%);
				visibility: hidden;
				pointer-events: none;
				transition:
					transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
					visibility 0s linear 0.3s;
			}

				.sidebar.open {
					transform: translateX(0);
					visibility: visible;
					pointer-events: auto;
					transition-delay: 0s;
				}

				.sidebar-close-button {
					display: flex;
				}

			.main-content {
				margin-left: 0;
				padding-top: 56px;
			}
		}
</style>
