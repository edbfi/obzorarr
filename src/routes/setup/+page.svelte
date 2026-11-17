<script lang="ts">
import { tick } from "svelte";
import PasswordField from "#lib/components/credentials/PasswordField.svelte";
import { passwordMessages } from "#lib/components/credentials/password-messages.ts";
import TokenField from "#lib/components/credentials/TokenField.svelte";
import ErrorSummary, { type Problem } from "#lib/components/forms/ErrorSummary.svelte";
import PanelPage from "#lib/components/layout/PanelPage.svelte";
import { m } from "#lib/paraglide/messages.js";
import { APP_NAME } from "#lib/shared/app-name.ts";
import {
	CONSOLE_TOKEN_MINUTES,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
} from "#lib/shared/credential-limits.ts";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import type { PageProps, SubmitFunction } from "./$types";

let { form }: PageProps = $props();

let submitting = $state(false);
let showPassword = $state(false);

/** Fields edited since the last answer: their old error no longer describes what they hold. */
let edited = $state({ token: false, username: false, password: false });
let tokenInput = $state<HTMLInputElement>();
let passwordInput = $state<HTMLInputElement>();
let summary = $state<ErrorSummary>();

const usernameMessages = {
	empty: () => m.setup_username_empty(),
	"too-long": () => m.setup_username_too_long({ count: USERNAME_MAX_LENGTH }),
	control: () => m.setup_username_control(),
};

const tokenError = $derived(
	form?.tokenRefused && !edited.token ? m.setup_token_refused() : undefined,
);
const usernameError = $derived(
	form?.usernameError && !edited.username ? usernameMessages[form.usernameError]() : undefined,
);
const passwordError = $derived(
	form?.passwordError && !edited.password ? passwordMessages[form.passwordError]() : undefined,
);
// The too-short answer already says what the helper says.
const passwordHelp = $derived(!(passwordError && form?.passwordError === "too-short"));

/** The summary's problems: the fields' in their order, then the page's (D29). */
const problems = $derived<Problem[]>([
	...(tokenError ? [{ message: tokenError, href: "#token" }] : []),
	...(usernameError ? [{ message: usernameError, href: "#username" }] : []),
	...(passwordError ? [{ message: passwordError, href: "#password" }] : []),
	...(form?.failed ? [{ message: m.setup_failed({ name: APP_NAME }) }] : []),
	...(form?.busy ? [{ message: m.error_server_busy({ name: APP_NAME }) }] : []),
	...(form?.retryAfterSeconds
		? [{ message: m.error_too_many_attempts({ count: Math.ceil(form.retryAfterSeconds / 60) }) }]
		: []),
]);
const title = $derived(m.setup_page_title({ name: APP_NAME }));

/** Each field's description: its error, when it has one, then its helper. */
const describedBy = (id: string, error: string | undefined, help: boolean) =>
	[error ? `${id}-error` : undefined, help ? `${id}-help` : undefined].filter(Boolean).join(" ") ||
	undefined;

/**
 * While the claim runs, the button says so and can't be pressed again. A failed claim keeps the
 * username, clears the password, and moves focus to the error summary (D29). It clears the token
 * too, unless the claim was only held back (too many attempts, or the server busy), which leaves
 * the token unused and worth keeping.
 */
const submit: SubmitFunction = () => {
	submitting = true;
	edited = { token: true, username: true, password: true };
	return async ({ result, update }) => {
		if (result.type === "redirect") {
			await update();
			return;
		}
		await update({ reset: false });
		submitting = false;
		edited = { token: false, username: false, password: false };
		showPassword = false;
		const heldBack =
			result.type === "failure" && (result.data?.busy || result.data?.retryAfterSeconds);
		if (tokenInput && !heldBack) tokenInput.value = "";
		if (passwordInput) passwordInput.value = "";
		await tick();
		if (result.type === "failure") summary?.focus();
	};
};

const field = css({ display: "flex", flexDirection: "column", gap: "sm" });
const label = css({ textStyle: "label" });
const help = css({ textStyle: "caption", color: "muted" });
const error = css({ textStyle: "caption", color: "danger", fontWeight: "semibold" });
const control = css({
	minHeight: "controlHeight",
	paddingInline: "md",
	// An error summary's link scrolls here: the label above stays in view (D29).
	scrollMarginBlockStart: "xxl",
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
	"&[aria-invalid=true]": { borderColor: "danger" },
});
</script>

<svelte:head>
	<title>{problems.length > 0 ? m.error_page_title({ title }) : title}</title>
</svelte:head>

<PanelPage>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{m.setup_title({ name: APP_NAME })}</h1>
	<p class={css({ marginBlockStart: "sm", color: "muted" })}>
		{m.setup_intro()}
	</p>

	<form
		method="post"
		novalidate
		use:enhance={submit}
		class={css({
			display: "flex",
			flexDirection: "column",
			gap: "xl",
			marginBlockStart: "xl",
		})}
	>
		<ErrorSummary bind:this={summary} {problems} />

		<TokenField
			bind:input={tokenInput}
			id="token"
			label={m.setup_token_label()}
			error={tokenError}
			help={(format) => m.setup_token_help({ count: CONSOLE_TOKEN_MINUTES, format })}
			oninput={() => (edited.token = true)}
		/>

		<div class={field}>
			<label class={label} for="username">{m.setup_username_label()}</label>
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
				aria-invalid={usernameError ? "true" : undefined}
				oninput={() => (edited.username = true)}
				aria-describedby={describedBy("username", usernameError, false)}
			>
			{#if usernameError}
				<p class={error} id="username-error">{usernameError}</p>
			{/if}
		</div>

		<PasswordField
			bind:input={passwordInput}
			bind:shown={showPassword}
			id="password"
			label={m.setup_password_label()}
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
			{submitting ? m.setup_submitting() : m.setup_submit()}
		</button>
	</form>
</PanelPage>
