<script lang="ts">
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import { tick } from "svelte";
import PasswordField from "#lib/components/credentials/PasswordField.svelte";
import { passwordMessages } from "#lib/components/credentials/password-messages.ts";
import MessageWithCode, { CODE } from "#lib/components/i18n/MessageWithCode.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import type { PageProps, SubmitFunction } from "./$types";

/**
 * The Security tab (SPEC-sign-in.md, "The Security tab"; surface brief
 * `route-admin-settings-security.md`): the owner's password, then their other sessions. Later
 * modules add their sections below.
 */
let { data, form }: PageProps = $props();

// While either action runs, both buttons wait: a change and a sign-out from one tab never race.
let saving = $state(false);
let signingOut = $state(false);
let showCurrent = $state(false);
let showNext = $state(false);
/** Fields edited since the last answer: their old error no longer describes what they hold. */
let edited = $state({ current: false, next: false });
let currentInput = $state<HTMLInputElement>();
let nextInput = $state<HTMLInputElement>();

const answer = $derived(form && "password" in form ? form.password : undefined);
const ended = $derived(form && "sessions" in form ? form.sessions?.ended : undefined);

const currentError = $derived(
	answer?.wrongCurrent && !edited.current ? m.security_password_wrong_current() : undefined,
);
const nextError = $derived(
	answer?.error && !edited.next ? passwordMessages[answer.error]() : undefined,
);
/** The field error the assertive region announces, while the field shows it below itself. */
const fieldError = $derived(currentError ?? nextError);
// "Use at least 15 characters." already says what the helper says.
const nextHelp = $derived(!(nextError && answer?.error === "too-short"));

/**
 * While the change is saved, the button says so and can't be pressed again. A change, or a
 * field error, empties both fields and hides what was typed; the field to fix takes focus, or
 * after a change the section's heading, since the disabled button lost it. Too many attempts or
 * a busy server checked nothing, so both passwords stay.
 */
const savePassword: SubmitFunction = () => {
	saving = true;
	edited = { current: true, next: true };
	return async ({ result, update }) => {
		await update({ reset: false });
		saving = false;
		edited = { current: false, next: false };
		const heldBack =
			result.type === "failure" &&
			(result.data?.password?.busy || result.data?.password?.retryAfterSeconds);
		if (result.type === "error" || heldBack) return;
		showCurrent = false;
		showNext = false;
		if (currentInput) currentInput.value = "";
		if (nextInput) nextInput.value = "";
		await tick();
		(
			document.querySelector<HTMLElement>("#password-section [aria-invalid='true']") ??
			document.querySelector<HTMLElement>("#password-heading")
		)?.focus();
	};
};

/** Once the others are signed out, the button is gone, so focus goes to the section's heading. */
const signOutElsewhere: SubmitFunction = () => {
	signingOut = true;
	return async ({ result, update }) => {
		await update();
		signingOut = false;
		if (result.type !== "success") return;
		await tick();
		document.querySelector<HTMLElement>("#sessions-heading")?.focus();
	};
};

const section = css({ display: "flex", flexDirection: "column", gap: "lg" });
/** A heading that takes focus after its section's action, without a ring: it isn't a control. */
const heading = css({ textStyle: "h2", textWrap: "balance", _focus: { outlineStyle: "none" } });
const status = css({ textStyle: "body", color: "success" });
const error = css({ textStyle: "caption", color: "danger", fontWeight: "semibold" });
/** A message above the control it is about. */
const message = css({ marginBlockEnd: "lg" });
const button = css({
	minHeight: "controlHeight",
	paddingInline: "xl",
	textStyle: "label",
	borderRadius: "control",
	cursor: "pointer",
	transitionProperty: "background-color, border-color, color",
	transitionDuration: "press",
	_disabled: { cursor: "progress" },
});
</script>

<svelte:head>
	<title>{m.admin_settings_title()}</title>
</svelte:head>

<div
	class={css({
		display: "flex",
		flexDirection: "column",
		gap: "section",
		"& > section + section": {
			paddingBlockStart: "section",
			borderBlockStartWidth: "1px",
			borderBlockStartStyle: "solid",
			borderBlockStartColor: "border",
		},
	})}
>
	{#if data.recoveryOn}
		<!-- The one thing to do once recovery has been used: turn it off. -->
		<p
			class={css({
				display: "flex",
				alignItems: "flex-start",
				gap: "sm",
				padding: "lg",
				color: "text",
				bg: "surface",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "warning",
				borderRadius: "panel",
				"& svg": { flex: "none", color: "warning", marginBlockStart: "[2px]" },
			})}
		>
			<TriangleAlertIcon size={20} aria-hidden="true" />
			<span>
				<MessageWithCode
					message={m.security_recovery_on({ variable: CODE })}
					code="OBZORARR_RECOVERY"
				/>
			</span>
		</p>
	{/if}

	<section id="password-section" class={section} aria-labelledby="password-heading">
		<h2 class={heading} id="password-heading" tabindex="-1">{m.security_password_heading()}</h2>
		<form
			method="post"
			action="?/password"
			novalidate
			use:enhance={savePassword}
			class={css({ display: "flex", flexDirection: "column", gap: "xl" })}
		>
			<PasswordField
				bind:input={currentInput}
				bind:shown={showCurrent}
				id="current"
				label={m.security_password_current_label()}
				autocomplete="current-password"
				error={currentError}
				oninput={() => (edited.current = true)}
			/>
			<PasswordField
				bind:input={nextInput}
				bind:shown={showNext}
				id="next"
				label={m.security_password_new_label()}
				autocomplete="new-password"
				error={nextError}
				help={nextHelp ? m.setup_password_help() : undefined}
				oninput={() => (edited.next = true)}
			/>

			<!-- The messages sit with the button, so an empty live region takes no space. Errors are
			announced at once, a field's too, which it also shows below itself; the saved message waits
			its turn. Each answer renders its message anew, so the same message is announced again. -->
			<div>
				<div role="alert">
					{#key form}
						{#if answer?.busy}
							<p class={[error, message]}>{m.error_server_busy()}</p>
						{:else if answer?.retryAfterSeconds}
							<p class={[error, message]}>
								{m.error_too_many_attempts({ count: Math.ceil(answer.retryAfterSeconds / 60) })}
							</p>
						{:else if fieldError}
							<p class={css({ srOnly: true })}>{fieldError}</p>
						{/if}
					{/key}
				</div>
				<div role="status">
					{#key form}
						{#if answer?.changed}
							<p class={[status, message]}>{m.security_password_changed()}</p>
						{/if}
					{/key}
				</div>

				<button
					type="submit"
					disabled={saving || signingOut}
					class={[
						button,
						css({
							bg: "primary",
							color: "background",
							_enabled: { _hover: { bg: "secondary" } },
							_disabled: { bg: "raised", color: "muted" },
						}),
					]}
				>
					{saving ? m.security_password_saving() : m.security_password_submit()}
				</button>
			</div>
		</form>
	</section>

	<section class={section} aria-labelledby="sessions-heading">
		<h2 class={heading} id="sessions-heading" tabindex="-1">{m.security_sessions_heading()}</h2>
		<!-- The done message sits with the count, so an empty live region takes no space. -->
		<div>
			<div role="status">
				{#key form}
					{#if ended !== undefined}
						<p class={[status, message]}>{m.security_sessions_ended({ count: ended })}</p>
					{/if}
				{/key}
			</div>
			{#if data.otherSessions > 0}
				<p class={message}>{m.security_sessions_count({ count: data.otherSessions })}</p>
				<form method="post" action="?/sessions" use:enhance={signOutElsewhere}>
					<button
						type="submit"
						disabled={signingOut || saving}
						class={[
							button,
							css({
								color: "text",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "control-border",
								_enabled: { _hover: { borderColor: "muted" } },
								_disabled: { color: "muted" },
							}),
						]}
					>
						{signingOut ? m.security_sessions_ending() : m.security_sessions_end()}
					</button>
				</form>
			{:else}
				<p class={css({ color: "muted" })}>{m.security_sessions_none()}</p>
			{/if}
		</div>
	</section>
</div>
