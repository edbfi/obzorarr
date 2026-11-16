<script lang="ts">
import SettingsIcon from "@lucide/svelte/icons/settings";
import type { Snippet } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import OwnerFooter from "#lib/components/layout/OwnerFooter.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { page } from "$app/state";

/**
 * The admin shell's sidebar (SPEC-sign-in.md, "The admin shell"): the logo and wordmark, the
 * navigation, which lists only pages that exist (Settings now; each later module adds its own in
 * PRODUCT.md's order), and the owner's footer. As the sidebar from 768px up (`rail`), it
 * collapses to its icons below 1024px; in the drawer it is always whole, with the drawer's close
 * button (`close`) beside the wordmark.
 */
let {
	username,
	rail = false,
	close,
}: { username: string; rail?: boolean; close?: Snippet } = $props();

const links = [
	{ href: "/admin/settings/security", section: "/admin/settings", label: m.admin_settings_title },
];
const railHiddenClass = css({ tabletOnly: { srOnly: true } });
const railCentredClass = css({ tabletOnly: { justifyContent: "center", paddingInline: "[0]" } });
// In the rail, labels stay for screen readers only, and the rest is centred on its icon.
const railHidden = $derived(rail ? railHiddenClass : undefined);
const railCentred = $derived(rail ? railCentredClass : undefined);
</script>

<div
	class={css({
		display: "flex",
		flexDirection: "column",
		gap: "xl",
		height: "[100%]",
		padding: "md",
	})}
>
	<div
		class={css({
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "sm",
		})}
	>
		<p
			class={[
				css({
					display: "flex",
					alignItems: "center",
					gap: "sm",
					minHeight: "controlHeight",
					paddingInline: "sm",
					fontFamily: "display",
					fontSize: "h3",
					fontWeight: "semibold",
					lineHeight: "h3",
				}),
				railCentred,
			]}
		>
			<img src={icon} alt="" width="24" height="24">
			<span class={railHidden}>Obzorarr</span>
		</p>
		{@render close?.()}
	</div>

	<nav aria-label={m.admin_nav_label()} class={css({ flex: "1" })}>
		<ul class={css({ display: "flex", flexDirection: "column", gap: "xs" })}>
			{#each links as link (link.href)}
				{@const current = page.url.pathname.startsWith(link.section)}
				<li>
					<a
						href={link.href}
						aria-current={current ? "page" : undefined}
						class={[
							css({
								display: "flex",
								alignItems: "center",
								gap: "sm",
								minHeight: "controlHeight",
								paddingInline: "md",
								borderRadius: "control",
								textStyle: "label",
								color: "muted",
								textDecoration: "none",
								_hover: { color: "text", bg: "raised" },
								"&[aria-current=page]": { color: "text", bg: "raised" },
							}),
							railCentred,
						]}
					>
						<SettingsIcon size={20} aria-hidden="true" />
						<span class={railHidden}>{link.label()}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<OwnerFooter {username} {rail} />
</div>
