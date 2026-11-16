<script lang="ts">
import type { Snippet } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { css } from "#styled-system/css";

/**
 * A page outside the admin shell with one task, such as the claim or signing in: the logo and
 * wordmark with the language switcher above one bordered panel, centred within the form width.
 */
let { children }: { children: Snippet } = $props();
</script>

<div
	class={css({
		maxWidth: "formMax",
		marginInline: "auto",
		paddingBlock: { base: "xl", tablet: "section" },
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter" },
	})}
>
	<header
		class={css({
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "md",
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
		<LanguageSwitcher />
	</header>

	<main
		class={css({
			marginBlockStart: { base: "xl", tablet: "xxl" },
			padding: { base: "lg", tablet: "xxl" },
			bg: "surface",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "border",
			borderRadius: "panel",
		})}
	>
		{@render children()}
	</main>
</div>
