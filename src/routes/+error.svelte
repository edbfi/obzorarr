<script lang="ts">
import { onMount } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { page } from "$app/state";

/**
 * Each status the app answers with, titled and described in the viewer's language; the number
 * itself is never shown (SPEC-sign-in.md, "Errors and error pages").
 */
const text = $derived.by(() => {
	switch (page.status) {
		case 404:
			return { title: m.error_not_found_title(), description: m.error_not_found_description() };
		case 403:
			return {
				title: m.error_access_denied_title(),
				description: m.error_forbidden_description(),
			};
		case 429:
			return {
				title: m.error_too_many_requests_title(),
				description: m.error_too_many_requests_description(),
			};
		default:
			return {
				title: m.error_something_went_wrong_title(),
				description: m.error_something_went_wrong_description(),
			};
	}
});

// Go back needs script, so it appears only once the page has it.
let hydrated = $state(false);
onMount(() => {
	hydrated = true;
});

const action = css({
	display: "inline-flex",
	alignItems: "center",
	minHeight: "controlHeight",
	paddingInline: "lg",
	textStyle: "label",
	color: "text",
	cursor: "pointer",
	textDecoration: "none",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "control-border",
	borderRadius: "control",
	transitionProperty: "border-color",
	transitionDuration: "feedback",
	_hover: { borderColor: "muted" },
});
</script>

<svelte:head>
	<title>{text.title}</title>
</svelte:head>

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
		<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{text.title}</h1>
		<p class={css({ marginBlockStart: "sm", color: "muted" })}>{text.description}</p>
		<div class={css({ display: "flex", flexWrap: "wrap", gap: "md", marginBlockStart: "xl" })}>
			{#if hydrated}
				<button type="button" class={action} onclick={() => history.back()}>
					{m.error_go_back()}
				</button>
			{/if}
			<a class={action} href="/">{m.error_home()}</a>
		</div>
	</main>
</div>
