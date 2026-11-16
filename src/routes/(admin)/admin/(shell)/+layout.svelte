<script lang="ts">
import type { Snippet } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import AdminDrawer from "#lib/components/layout/AdminDrawer.svelte";
import AdminSidebar from "#lib/components/layout/AdminSidebar.svelte";
import { provideShellModals } from "#lib/components/layout/shell-modals.svelte.ts";
import { css } from "#styled-system/css";
import type { LayoutData } from "./$types";

/**
 * The admin shell (SPEC-sign-in.md, "The admin shell"; brief `route-admin-settings-security.md`):
 * a 224px sidebar from 1024px, a rail from 768px, and below that a 64px top bar whose menu opens
 * the sidebar as a drawer. While the drawer or a confirmation is open, everything behind it is
 * inert. Without JavaScript the drawer can't open, so below 768px the sidebar stands above the page.
 */
let { data, children }: { data: LayoutData; children: Snippet } = $props();
let drawerOpen = $state(false);
const modals = provideShellModals();
const behind = $derived(drawerOpen || modals.open > 0);
</script>

<svelte:head>
	<noscript>
		<style>
		@media (width < 48rem) {
			#admin-shell {
				flex-direction: column;
			}
			#admin-sidebar {
				display: block;
				position: static;
				width: auto;
				height: auto;
				border-inline-end: 0;
				border-block-end: 1px solid var(--colors-border);
			}
			#admin-topbar {
				display: none;
			}
		}
		</style>
	</noscript>
</svelte:head>

<div id="admin-shell" class={css({ display: "flex", minHeight: "dvh" })}>
	<aside
		id="admin-sidebar"
		inert={behind}
		class={css({
			display: "none",
			tablet: {
				display: "block",
				position: "sticky",
				insetBlockStart: "[0]",
				flex: "none",
				width: "rail",
				height: "dvh",
				overflowY: "auto",
				bg: "surface",
				borderInlineEndWidth: "1px",
				borderInlineEndStyle: "solid",
				borderInlineEndColor: "border",
			},
			desktop: { width: "sidebar" },
		})}
	>
		<AdminSidebar username={data.username} rail />
	</aside>

	<div id="admin-page" inert={behind} class={css({ flex: "1", minWidth: "[0]" })}>
		<header
			id="admin-topbar"
			class={css({
				display: "flex",
				flexWrap: "wrap",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "sm",
				minHeight: "topbar",
				paddingBlock: "xs",
				paddingInline: "mobileGutter",
				bg: "surface",
				borderBlockEndWidth: "1px",
				borderBlockEndStyle: "solid",
				borderBlockEndColor: "border",
				tablet: { display: "none" },
			})}
		>
			<p
				class={css({
					display: "flex",
					alignItems: "center",
					gap: "sm",
					fontFamily: "display",
					fontSize: "h3",
					fontWeight: "semibold",
					lineHeight: "h3",
				})}
			>
				<img src={icon} alt="" width="24" height="24">
				Obzorarr
			</p>
			<AdminDrawer username={data.username} bind:open={drawerOpen} />
		</header>

		<main
			class={css({
				maxWidth: "formMax",
				paddingBlock: { base: "xl", tablet: "section" },
				paddingInline: { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" },
			})}
		>
			{@render children()}
		</main>
	</div>
</div>
