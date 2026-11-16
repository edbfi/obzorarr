<script lang="ts">
import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
import { tick } from "svelte";
import PasswordField from "#lib/components/credentials/PasswordField.svelte";
import PanelPage from "#lib/components/layout/PanelPage.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import type { PageProps, SubmitFunction } from "./$types";

let { form }: PageProps = $props();

let submitting = $state(false);
let showPassword = $state(false);
let passwordInput = $state<HTMLInputElement>();

/**
 * While signing in, the button says so and can't be pressed again. A refused sign-in keeps the
 * username, clears the password and moves focus to it, the field to type again.
 */
const submit: SubmitFunction = () => {
	submitting = true;
	return async ({ result, update }) => {
		if (result.type === "redirect") {
			await update();
			return;
		}
		await update({ reset: false });
		submitting = false;
		showPassword = false;
		if (passwordInput) passwordInput.value = "";
		await tick();
		passwordInput?.focus();
	};
};

/** A recovery step with its variable or path set as code, like the console it points to. */
const CODE = "\u0001";
const steps = [
	m.sign_in_forgot_restart({ variable: CODE }).split(CODE),
	[m.sign_in_forgot_token()],
	m.sign_in_forgot_recovery({ path: CODE }).split(CODE),
];
const codes = ["OBZORARR_RECOVERY=true", undefined, "/recovery"];

const control = css({
	minHeight: "controlHeight",
	paddingInline: "md",
	bg: "surface",
	color: "text",
	caretColor: "primary",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "control-border",
	borderRadius: "control",
	transitionProperty: "border-color",
	transitionDuration: "feedback",
	_hover: { borderColor: "muted" },
});
const error = css({ textStyle: "caption", color: "danger", fontWeight: "semibold" });
const code = css({ fontFamily: "mono", fontSize: "code", overflowWrap: "anywhere" });
</script>

<svelte:head>
	<title>{m.sign_in_page_title()}</title>
</svelte:head>

<PanelPage>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{m.sign_in_title()}</h1>

	<form
		method="post"
		novalidate
		use:enhance={submit}
		class={css({ display: "flex", flexDirection: "column", gap: "xl", marginBlockStart: "xl" })}
	>
		<div class={css({ display: "flex", flexDirection: "column", gap: "sm" })}>
			<label class={css({ textStyle: "label" })} for="username">
				{m.sign_in_username_label()}
			</label>
			<!-- The answer's username is the field's default, so a re-render while the form is sent
			never writes over what was typed, as a reactive `value` does. -->
			<input
				class={control}
				id="username"
				name="username"
				type="text"
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				defaultValue={form?.username ?? ""}
			>
		</div>

		<PasswordField
			bind:input={passwordInput}
			bind:shown={showPassword}
			id="password"
			label={m.sign_in_password_label()}
			autocomplete="current-password"
		/>

		{#if form?.wrong}
			<p class={error} role="alert">{m.sign_in_wrong()}</p>
		{/if}
		{#if form?.busy}
			<p class={error} role="alert">{m.error_server_busy()}</p>
		{/if}

		<button
			type="submit"
			disabled={submitting}
			class={css({
				minHeight: "controlHeight",
				paddingInline: "xl",
				bg: "primary",
				color: "background",
				textStyle: "label",
				fontSize: "body",
				borderRadius: "control",
				cursor: "pointer",
				transitionProperty: "background-color, color",
				transitionDuration: "press",
				_enabled: { _hover: { bg: "secondary" } },
				_disabled: { bg: "raised", color: "muted", cursor: "progress" },
			})}
		>
			{submitting ? m.sign_in_submitting() : m.sign_in_submit()}
		</button>
	</form>

	<details
		class={css({
			marginBlockStart: "xl",
			paddingBlockStart: "lg",
			borderBlockStartWidth: "1px",
			borderBlockStartStyle: "solid",
			borderBlockStartColor: "border",
			"&[open] svg": { transform: "rotate(90deg)" },
		})}
	>
		<summary
			class={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "xs",
				minHeight: "controlHeight",
				textStyle: "label",
				color: "secondary",
				cursor: "pointer",
				borderRadius: "sm",
				listStyle: "none",
				"&::-webkit-details-marker": { display: "none" },
				_hover: { color: "text" },
				"& svg": {
					transitionProperty: "transform",
					transitionDuration: "feedback",
					_motionReduce: { transitionDuration: "[0s]" },
				},
			})}
		>
			<ChevronRightIcon size={20} aria-hidden="true" />
			{m.sign_in_forgot()}
		</summary>
		<ol
			class={css({
				display: "flex",
				flexDirection: "column",
				gap: "sm",
				marginBlockStart: "sm",
				paddingInlineStart: "xl",
				listStyleType: "decimal",
				color: "muted",
				"& ::marker": { color: "muted", fontVariantNumeric: "tabular-nums" },
			})}
		>
			{#each steps as parts, index (index)}
				<!-- biome-ignore format: one line, so no whitespace lands between the code and its punctuation -->
				<li>{#each parts as part, at (at)}{#if at > 0}<code class={code}>{codes[index]}</code>{/if}{part}{/each}</li>
			{/each}
		</ol>
	</details>
</PanelPage>
