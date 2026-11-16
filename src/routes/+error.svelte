<script lang="ts">
import { onMount } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { page } from "$app/state";

/**
 * Each status's title in the viewer's language, never the number itself; the description is the
 * error's message, which `handleError` sets for every error (SPEC-sign-in.md, "Errors and error
 * pages").
 */
const title = $derived.by(() => {
	// An enhanced form's action error reaches this page as a 500; its own status is in the error.
	switch (page.error?.status ?? page.status) {
		case 404:
			return m.error_not_found_title();
		case 403:
			return m.error_access_denied_title();
		case 429:
			return m.error_too_many_requests_title();
		default:
			return m.error_something_went_wrong_title();
	}
});
const description = $derived(page.error?.message ?? m.error_something_went_wrong_description());

// Go back needs script, and a page to go back to, so it appears only once the page has both.
let canGoBack = $state(false);
onMount(() => {
	canGoBack = history.length > 1;
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
	<title>{title}</title>
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
		<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{title}</h1>
		<p class={css({ marginBlockStart: "sm", color: "muted" })}>{description}</p>
		<div class={css({ display: "flex", flexWrap: "wrap", gap: "md", marginBlockStart: "xl" })}>
			{#if canGoBack}
				<button type="button" class={action} onclick={() => history.back()}>
					{m.error_go_back()}
				</button>
			{/if}
			<a class={action} href="/">{m.error_home()}</a>
		</div>
	</main>
</div>
