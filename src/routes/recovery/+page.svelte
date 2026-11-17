<script lang="ts">
import { tick } from "svelte";
import PasswordField from "#lib/components/credentials/PasswordField.svelte";
import { passwordMessages } from "#lib/components/credentials/password-messages.ts";
import TokenField from "#lib/components/credentials/TokenField.svelte";
import ErrorSummary, { type Problem } from "#lib/components/forms/ErrorSummary.svelte";
import PanelPage from "#lib/components/layout/PanelPage.svelte";
import { m } from "#lib/paraglide/messages.js";
import { APP_NAME } from "#lib/shared/app-name.ts";
import { PASSWORD_MIN_LENGTH } from "#lib/shared/credential-limits.ts";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import type { PageProps, SubmitFunction } from "./$types";

/**
 * `/recovery` (SPEC-sign-in.md, "Recovery"; surface brief `route-recovery.md`): the claim's form
 * again, with the recovery token and a new password; the username stays as it is.
 */
let { form }: PageProps = $props();

let submitting = $state(false);
let showPassword = $state(false);
/** Fields edited since the last answer: their old error no longer describes what they hold. */
let edited = $state({ token: false, password: false });
let tokenInput = $state<HTMLInputElement>();
let passwordInput = $state<HTMLInputElement>();
let summary = $state<ErrorSummary>();

const tokenError = $derived(
	form?.tokenRefused && !edited.token ? m.recovery_token_refused({ name: APP_NAME }) : undefined,
);
const passwordError = $derived(
	form?.passwordError && !edited.password ? passwordMessages[form.passwordError]() : undefined,
);
// The too-short answer already says what the helper says.
const passwordHelp = $derived(!(passwordError && form?.passwordError === "too-short"));

/** The summary's problems: the fields' in their order, then the page's (D29). */
const problems = $derived<Problem[]>([
	...(tokenError ? [{ message: tokenError, href: "#token" }] : []),
	...(passwordError ? [{ message: passwordError, href: "#password" }] : []),
	...(form?.failed ? [{ message: m.recovery_failed({ name: APP_NAME }) }] : []),
	...(form?.busy ? [{ message: m.error_server_busy({ name: APP_NAME }) }] : []),
	...(form?.retryAfterSeconds
		? [{ message: m.error_too_many_attempts({ count: Math.ceil(form.retryAfterSeconds / 60) }) }]
		: []),
]);

/**
 * While the new password is saved, the button says so and can't be pressed again. A failed try
 * keeps neither the token nor the password, and moves focus to the error summary (D29).
 */
const submit: SubmitFunction = () => {
	submitting = true;
	edited = { token: true, password: true };
	return async ({ result, update }) => {
		if (result.type === "redirect") {
			await update();
			return;
		}
		await update({ reset: false });
		submitting = false;
		edited = { token: false, password: false };
		showPassword = false;
		if (tokenInput) tokenInput.value = "";
		if (passwordInput) passwordInput.value = "";
		await tick();
		if (result.type === "failure") summary?.focus();
	};
};
</script>

<svelte:head>
	<title>
		{problems.length > 0
			? m.error_page_title({ title: m.recovery_page_title() })
			: m.recovery_page_title()}
	</title>
</svelte:head>

<PanelPage>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{m.recovery_title()}</h1>
	<p class={css({ marginBlockStart: "sm", color: "muted" })}>{m.recovery_intro()}</p>

	<form
		method="post"
		novalidate
		use:enhance={submit}
		class={css({ display: "flex", flexDirection: "column", gap: "xl", marginBlockStart: "xl" })}
	>
		<ErrorSummary bind:this={summary} {problems} />

		<TokenField
			bind:input={tokenInput}
			id="token"
			label={m.recovery_token_label()}
			error={tokenError}
			help={(format) => m.recovery_token_help({ name: APP_NAME, format })}
			oninput={() => (edited.token = true)}
		/>

		<PasswordField
			bind:input={passwordInput}
			bind:shown={showPassword}
			id="password"
			label={m.recovery_password_label()}
			autocomplete="new-password"
			error={passwordError}
			help={passwordHelp ? m.setup_password_help({ count: PASSWORD_MIN_LENGTH }) : undefined}
			oninput={() => (edited.password = true)}
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
			{submitting ? m.recovery_submitting() : m.recovery_submit()}
		</button>
	</form>
</PanelPage>
