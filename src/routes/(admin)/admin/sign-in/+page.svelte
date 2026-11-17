<script lang="ts">
import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
import { tick } from "svelte";
import PasswordField from "#lib/components/credentials/PasswordField.svelte";
import ErrorSummary, { type Problem } from "#lib/components/forms/ErrorSummary.svelte";
import MessageWithCode, { CODE } from "#lib/components/i18n/MessageWithCode.svelte";
import PanelPage from "#lib/components/layout/PanelPage.svelte";
import { m } from "#lib/paraglide/messages.js";
import { APP_NAME } from "#lib/shared/app-name.ts";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import type { PageProps, SubmitFunction } from "./$types";

let { form }: PageProps = $props();

let submitting = $state(false);
let showPassword = $state(false);
let passwordInput = $state<HTMLInputElement>();
let summary = $state<ErrorSummary>();

/** The summary's problems, all the page's own: none names a field (D29). */
const problems = $derived<Problem[]>([
	...(form?.wrong ? [{ message: m.sign_in_wrong() }] : []),
	...(form?.busy ? [{ message: m.error_server_busy({ name: APP_NAME }) }] : []),
	...(form?.retryAfterSeconds
		? [{ message: m.error_too_many_attempts({ count: Math.ceil(form.retryAfterSeconds / 60) }) }]
		: []),
]);

/**
 * While signing in, the button says so and can't be pressed again. A wrong username or password
 * keeps the username and clears the password; a busy server, too many attempts or a wait checked
 * nothing, so the password stays. Each failure moves focus to the error summary (D29).
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
		if (result.type !== "failure") return;
		if (result.data?.wrong) {
			showPassword = false;
			if (passwordInput) passwordInput.value = "";
		}
		await tick();
		summary?.focus();
	};
};

/** The recovery steps, each variable or path set as code, like the console they point to. */
const steps = [
	{
		message: m.sign_in_forgot_restart({ name: APP_NAME, variable: CODE }),
		code: "OBZORARR_RECOVERY=true",
	},
	{ message: m.sign_in_forgot_token() },
	{ message: m.sign_in_forgot_recovery({ path: CODE }), code: "/recovery" },
];

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
</script>

<svelte:head>
	<title>
		{problems.length > 0
			? m.error_page_title({ title: m.sign_in_page_title() })
			: m.sign_in_page_title()}
	</title>
</svelte:head>

<PanelPage>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>
		{m.sign_in_title({ name: APP_NAME })}
	</h1>

	<form
		method="post"
		novalidate
		use:enhance={submit}
		class={css({ display: "flex", flexDirection: "column", gap: "xl", marginBlockStart: "xl" })}
	>
		<ErrorSummary bind:this={summary} {problems} />

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
				autocorrect="off"
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
			{#each steps as step, index (index)}
				<li><MessageWithCode {...step} /></li>
			{/each}
		</ol>
	</details>
</PanelPage>
