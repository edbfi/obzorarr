<script lang="ts">
import type { Snippet } from "svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { page } from "$app/state";

/**
 * `/admin/settings`: its one heading and the tabs, which list only tabs that exist (Security now;
 * later modules add theirs), above the open tab (SPEC-sign-in.md, "The admin shell").
 */
let { children }: { children: Snippet } = $props();

const tabs = [{ href: "/admin/settings/security", label: m.admin_settings_security }];
</script>

<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{m.admin_settings_title()}</h1>

<nav
	aria-label={m.admin_settings_tabs()}
	class={css({
		display: "flex",
		gap: "lg",
		marginBlockStart: "lg",
		borderBlockEndWidth: "1px",
		borderBlockEndStyle: "solid",
		borderBlockEndColor: "border",
	})}
>
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			aria-current={page.url.pathname === tab.href ? "page" : undefined}
			class={css({
				display: "flex",
				alignItems: "center",
				minHeight: "controlHeight",
				marginBlockEnd: "[-1px]",
				textStyle: "label",
				color: "muted",
				textDecoration: "none",
				borderBlockEndWidth: "2px",
				borderBlockEndStyle: "solid",
				borderBlockEndColor: "transparent",
				_hover: { color: "text" },
				"&[aria-current=page]": { color: "text", borderBlockEndColor: "primary" },
			})}
		>
			{tab.label()}
		</a>
	{/each}
</nav>

<div class={css({ marginBlockStart: "xl" })}>
	{@render children()}
</div>
