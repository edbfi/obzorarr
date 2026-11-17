<script lang="ts">
import MessageWithCode, { CODE } from "#lib/components/i18n/MessageWithCode.svelte";
import { css } from "#styled-system/css";
import { deleteAcrossDash, formatTokenInput } from "./token-format.ts";

/**
 * A console token's field, shared by the claim and recovery: it reads like the console line the
 * token came from, `xxxx-xxxx-xxxx` as it is typed, in any case, and isn't a password field. Its
 * error and helper sit below it, linked by `aria-describedby`; the helper's `help` comes from a
 * message whose placeholder is `CODE`, where the format is set as code.
 */
let {
	id,
	name = id,
	label,
	error,
	help,
	input = $bindable(),
	oninput,
}: {
	id: string;
	name?: string;
	label: string;
	error?: string | undefined;
	help: (format: string) => string;
	input?: HTMLInputElement | undefined;
	oninput?: () => void;
} = $props();

const describedBy = $derived(
	[error ? `${id}-error` : undefined, `${id}-help`].filter(Boolean).join(" "),
);

/** The token reads like the console line it came from: xxxx-xxxx-xxxx as it is typed. */
function formatToken(event: Event & { currentTarget: HTMLInputElement }) {
	oninput?.();
	const field = event.currentTarget;
	const next = formatTokenInput(field.value, field.selectionStart ?? field.value.length);
	field.value = next.value;
	if (document.activeElement === field) field.setSelectionRange(next.caret, next.caret);
}

/** Backspace or Delete next to a dash removes the character beyond it. */
function stepOverDash(event: InputEvent & { currentTarget: HTMLInputElement }) {
	const field = event.currentTarget;
	const caret = field.selectionStart;
	if (caret === null || caret !== field.selectionEnd) return;
	const direction =
		event.inputType === "deleteContentBackward"
			? "backward"
			: event.inputType === "deleteContentForward"
				? "forward"
				: undefined;
	if (direction === undefined) return;
	const next = deleteAcrossDash(field.value, caret, direction);
	if (next === undefined) return;
	event.preventDefault();
	oninput?.();
	field.value = next.value;
	field.setSelectionRange(next.caret, next.caret);
}
</script>

<div class={css({ display: "flex", flexDirection: "column", gap: "sm" })}>
	<label class={css({ textStyle: "label" })} for={id}>{label}</label>
	<input
		bind:this={input}
		class={css({
			minHeight: "controlHeight",
			paddingInline: "md",
			bg: "surface",
			color: "text",
			caretColor: "primary",
			fontFamily: "mono",
			fontSize: "body",
			fontVariantNumeric: "tabular-nums",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "control-border",
			borderRadius: "control",
			transitionProperty: "border-color",
			transitionDuration: "feedback",
			_hover: { borderColor: "muted" },
			"&[aria-invalid=true]": { borderColor: "danger" },
		})}
		{id}
		{name}
		type="text"
		autocomplete="off"
		autocapitalize="none"
		spellcheck="false"
		aria-invalid={error ? "true" : undefined}
		aria-describedby={describedBy}
		oninput={formatToken}
		onbeforeinput={stepOverDash}
	>
	{#if error}
		<p
			class={css({ textStyle: "caption", color: "danger", fontWeight: "semibold" })}
			id="{id}-error"
		>
			{error}
		</p>
	{/if}
	<p class={css({ textStyle: "caption", color: "muted" })} id="{id}-help">
		<MessageWithCode message={help(CODE)} code="xxxx-xxxx-xxxx" />
	</p>
</div>
