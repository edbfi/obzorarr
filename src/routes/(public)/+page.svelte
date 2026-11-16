<script lang="ts">
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
</script>

<svelte:head>
	<title>Obzorarr</title>
</svelte:head>

<!-- Placeholder until the landing and sign-in surface (.impeccable/surfaces/route.md) is built. -->
<main
	class={css({
		maxWidth: "readingMax",
		marginInline: "auto",
		paddingBlock: "hero",
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" },
	})}
>
	<div
		class={css({
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "md",
		})}
	>
		<p class={css({ textStyle: "label", color: "primary" })}>Obzorarr</p>
		<LanguageSwitcher />
	</div>
	<h1 class={css({ textStyle: "display", marginBlockStart: "section", textWrap: "balance" })}>
		{m.landing_title()}
	</h1>
	<p class={css({ marginBlockStart: "lg", color: "muted" })}>
		{m.landing_sign_in_status()}
	</p>
	<!-- The owner's way in until `landing` replaces this page (SPEC-sign-in.md, "The admin shell"). -->
	<a
		href="/admin/sign-in"
		class={css({
			display: "inline-flex",
			alignItems: "center",
			minHeight: "controlHeight",
			marginBlockStart: "xl",
			textStyle: "label",
			color: "secondary",
			textDecoration: "underline",
			textUnderlineOffset: "[3px]",
			_hover: { color: "text" },
		})}
	>
		{m.landing_owner_sign_in()}
	</a>
</main>
