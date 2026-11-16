<script lang="ts">
import { tick } from "svelte";
import PasswordField from "#lib/components/credentials/PasswordField.svelte";
import PanelPage from "#lib/components/layout/PanelPage.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import type { PageProps, SubmitFunction } from "./$types";
import { deleteAcrossDash, formatTokenInput } from "./token-format.ts";

let { form }: PageProps = $props();

let submitting = $state(false);
let showPassword = $state(false);

/** Fields edited since the last answer: their old error no longer describes what they hold. */
let edited = $state({ token: false, username: false, password: false });
let tokenInput = $state<HTMLInputElement>();
let passwordInput = $state<HTMLInputElement>();

const usernameMessages = {
	empty: m.setup_username_empty,
	"too-long": m.setup_username_too_long,
	control: m.setup_username_control,
};
const passwordMessages = {
	"too-short": m.setup_password_too_short,
	"too-long": m.setup_password_too_long,
	pattern: m.setup_password_pattern,
	"app-name": m.setup_password_app_name,
	username: m.setup_password_username,
	common: m.setup_password_common,
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
// "Use at least 15 characters." already says what the helper says.
const passwordHelp = $derived(!(passwordError && form?.passwordError === "too-short"));

/** The token helper with its format example set like the console line it describes. */
const FORMAT = "\u0001";
const tokenHelp = m.setup_token_help({ format: FORMAT }).split(FORMAT);

/** Each field's description: its error, when it has one, then its helper. */
const describedBy = (id: string, error: string | undefined, help: boolean) =>
	[error ? `${id}-error` : undefined, help ? `${id}-help` : undefined].filter(Boolean).join(" ") ||
	undefined;

/** The token reads like the console line it came from: xxxx-xxxx-xxxx as it is typed. */
function formatToken(event: Event & { currentTarget: HTMLInputElement }) {
	edited.token = true;
	const input = event.currentTarget;
	const next = formatTokenInput(input.value, input.selectionStart ?? input.value.length);
	input.value = next.value;
	if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
}

/** Backspace or Delete next to a dash removes the character beyond it. */
function stepOverDash(event: InputEvent & { currentTarget: HTMLInputElement }) {
	const input = event.currentTarget;
	const caret = input.selectionStart;
	if (caret === null || caret !== input.selectionEnd) return;
	const direction =
		event.inputType === "deleteContentBackward"
			? "backward"
			: event.inputType === "deleteContentForward"
				? "forward"
				: undefined;
	if (direction === undefined) return;
	const next = deleteAcrossDash(input.value, caret, direction);
	if (next === undefined) return;
	event.preventDefault();
	input.value = next.value;
	input.setSelectionRange(next.caret, next.caret);
}

/**
 * While the claim runs, the button says so and can't be pressed again. A failed claim keeps the
 * username, clears the password, and moves focus to the first field to fix. It clears the token
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
		// The first field to fix; otherwise the token: the message asks for it after a server failure,
		// and a held-back claim kept it.
		(document.querySelector<HTMLElement>("[aria-invalid='true']") ?? tokenInput)?.focus();
	};
};

const field = css({ display: "flex", flexDirection: "column", gap: "sm" });
const label = css({ textStyle: "label" });
const help = css({ textStyle: "caption", color: "muted" });
const error = css({ textStyle: "caption", color: "danger", fontWeight: "semibold" });
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
	"&[aria-invalid=true]": { borderColor: "danger" },
});
</script>

<svelte:head>
	<title>{m.setup_page_title()}</title>
</svelte:head>

<PanelPage>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{m.setup_title()}</h1>
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
		<div class={field}>
			<label class={label} for="token">{m.setup_token_label()}</label>
			<input
				bind:this={tokenInput}
				class={[
					control,
					css({
						fontFamily: "mono",
						fontSize: "body",
						fontVariantNumeric: "tabular-nums",
					}),
				]}
				id="token"
				name="token"
				type="text"
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
				aria-invalid={tokenError ? "true" : undefined}
				aria-describedby={describedBy("token", tokenError, true)}
				oninput={formatToken}
				onbeforeinput={stepOverDash}
			>
			{#if tokenError}
				<p class={error} id="token-error">{tokenError}</p>
			{/if}
			<!-- biome-ignore format: one line, so no whitespace lands between the format and its full stop -->
			<p class={help} id="token-help">{#each tokenHelp as part, index (index)}{#if index > 0}<code class={css({ fontFamily: "mono" })}>xxxx-xxxx-xxxx</code>{/if}{part}{/each}</p>
		</div>

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
			help={passwordHelp ? m.setup_password_help() : undefined}
			oninput={() => (edited.password = true)}
		/>

		{#if form?.failed}
			<p class={error} role="alert">{m.setup_failed()}</p>
		{/if}
		{#if form?.busy}
			<p class={error} role="alert">{m.error_server_busy()}</p>
		{/if}
		{#if form?.retryAfterSeconds}
			<p class={error} role="alert">
				{m.error_too_many_attempts({ count: Math.ceil(form.retryAfterSeconds / 60) })}
			</p>
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
			{submitting ? m.setup_submitting() : m.setup_submit()}
		</button>
	</form>
</PanelPage>
