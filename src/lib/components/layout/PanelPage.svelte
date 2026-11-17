<script lang="ts">
import type { Snippet } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";

/**
 * A page outside the admin shell with one task, such as the claim or signing in: a skip link to
 * the main content, shown only while it has focus, then the logo and wordmark with the language
 * switcher above one bordered panel, centred within the form width.
 */
let { children }: { children: Snippet } = $props();
</script>

<!-- A link to a fragment, so it works without JavaScript; `main` takes focus from it. -->
<a
	href="#main-content"
	class={css({
		srOnly: true,
		// `srOnly: false` would reset the padding after it, so each hiding property is undone here.
		_focus: {
			width: "auto",
			height: "auto",
			margin: "[0]",
			overflow: "visible",
			clip: "auto",
			whiteSpace: "normal",
			position: "absolute",
			insetBlockStart: "md",
			insetInlineStart: "md",
			paddingInline: "md",
			paddingBlock: "sm",
			bg: "primary",
			color: "background",
			textStyle: "label",
			borderRadius: "control",
		},
	})}
>
	{m.skip_to_main()}
</a>

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
		id="main-content"
		tabindex="-1"
		class={css({
			// It takes focus only from the skip link, which needs no ring of its own around the panel.
			_focus: { outlineStyle: "none" },
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
