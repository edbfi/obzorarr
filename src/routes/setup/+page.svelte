<script lang="ts">
import EyeIcon from "@lucide/svelte/icons/eye";
import EyeOffIcon from "@lucide/svelte/icons/eye-off";
import { onMount, tick } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import type { PageProps, SubmitFunction } from "./$types";
import { deleteAcrossDash, formatTokenInput } from "./token-format.ts";

let { form }: PageProps = $props();

let submitting = $state(false);
let showPassword = $state(false);
// The control that shows the password needs script, so it appears only once the page has it.
let hydrated = $state(false);
onMount(() => {
	hydrated = true;
});

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
 * username, clears the token and the password, and moves focus to the first field to fix.
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
		if (tokenInput) tokenInput.value = "";
		if (passwordInput) passwordInput.value = "";
		await tick();
		// The first field to fix; after a server failure, the token, which the message asks for.
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
				<input
					class={control}
					id="username"
					name="username"
					type="text"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					value={form?.username ?? ""}
					aria-invalid={usernameError ? "true" : undefined}
					oninput={() => (edited.username = true)}
					aria-describedby={describedBy("username", usernameError, false)}
				>
				{#if usernameError}
					<p class={error} id="username-error">{usernameError}</p>
				{/if}
			</div>

			<div class={field}>
				<label class={label} for="password">{m.setup_password_label()}</label>
				<!-- One bordered group holds the field and the control that shows what was typed. -->
				<div
					class={css({
						display: "flex",
						alignItems: "stretch",
						bg: "surface",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "control-border",
						borderRadius: "control",
						transitionProperty: "border-color",
						transitionDuration: "feedback",
						_hover: { borderColor: "muted" },
						"&:has([aria-invalid=true])": { borderColor: "danger" },
						// The field's focus ring goes round the whole group, as on the other fields.
						"&:has(input:focus-visible)": {
							outlineStyle: "solid",
							outlineWidth: "2px",
							outlineColor: "secondary",
							// DESIGN.md's 2px offset, as the global focus rule draws it.
							outlineOffset: "[2px]",
						},
					})}
				>
					<input
						bind:this={passwordInput}
						class={css({
							flex: "1",
							minHeight: "controlHeight",
							paddingInline: "md",
							bg: "transparent",
							color: "text",
							caretColor: "primary",
							borderRadius: "control",
							_focusVisible: { outlineStyle: "none" },
						})}
						id="password"
						name="password"
						size="1"
						type={showPassword ? "text" : "password"}
						autocomplete="new-password"
						aria-invalid={passwordError ? "true" : undefined}
						aria-describedby={describedBy("password", passwordError, passwordHelp)}
						oninput={() => (edited.password = true)}
					>
					{#if hydrated}
						<button
							type="button"
							aria-controls="password"
							aria-label={showPassword
								? m.setup_password_hide_label()
								: m.setup_password_show_label()}
							onclick={() => (showPassword = !showPassword)}
							class={css({
								flex: "none",
								display: "flex",
								alignItems: "center",
								gap: "xs",
								paddingInline: "md",
								textStyle: "label",
								color: "muted",
								cursor: "pointer",
								borderRadius: "control",
								_hover: { color: "text" },
								// Inside the group's border, so it never reads as a box beside the box.
								_focusVisible: { outlineOffset: "-xs" },
							})}
						>
							{#if showPassword}
								<EyeOffIcon size={20} aria-hidden="true" />
								{m.setup_password_hide()}
							{:else}
								<EyeIcon size={20} aria-hidden="true" />
								{m.setup_password_show()}
							{/if}
						</button>
					{/if}
				</div>
				{#if passwordError}
					<p class={error} id="password-error">{passwordError}</p>
				{/if}
				{#if passwordHelp}
					<p class={help} id="password-help">{m.setup_password_help()}</p>
				{/if}
			</div>

			{#if form?.failed}
				<p class={error} role="alert">{m.setup_failed()}</p>
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
	</main>
</div>
