<script lang="ts">
import EyeIcon from "@lucide/svelte/icons/eye";
import EyeOffIcon from "@lucide/svelte/icons/eye-off";
import { onMount } from "svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";

/**
 * A labelled password field with the control that shows what was typed, shared by the owner's
 * credential forms. Its error and helper sit below it, linked by `aria-describedby`; the field is
 * invalid only while it has an error.
 */
let {
	id,
	name = id,
	label,
	autocomplete,
	error,
	help,
	shown = $bindable(false),
	input = $bindable(),
	oninput,
}: {
	id: string;
	name?: string;
	label: string;
	autocomplete: "new-password" | "current-password";
	error?: string | undefined;
	help?: string | undefined;
	/** Whether the field shows what was typed. */
	shown?: boolean;
	input?: HTMLInputElement | undefined;
	oninput?: () => void;
} = $props();

// The control that shows the password needs script, so it appears only once the page has it.
let hydrated = $state(false);
onMount(() => {
	hydrated = true;
});

const describedBy = $derived(
	[error ? `${id}-error` : undefined, help ? `${id}-help` : undefined].filter(Boolean).join(" ") ||
		undefined,
);
</script>

<div class={css({ display: "flex", flexDirection: "column", gap: "sm" })}>
	<label class={css({ textStyle: "label" })} for={id}>{label}</label>
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
			bind:this={input}
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
			{id}
			{name}
			size="1"
			type={shown ? "text" : "password"}
			{autocomplete}
			aria-invalid={error ? "true" : undefined}
			aria-describedby={describedBy}
			{oninput}
		>
		{#if hydrated}
			<button
				type="button"
				aria-controls={id}
				aria-label={shown
					? m.credentials_password_hide_label()
					: m.credentials_password_show_label()}
				onclick={() => (shown = !shown)}
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
				{#if shown}
					<EyeOffIcon size={20} aria-hidden="true" />
					{m.credentials_password_hide()}
				{:else}
					<EyeIcon size={20} aria-hidden="true" />
					{m.credentials_password_show()}
				{/if}
			</button>
		{/if}
	</div>
	{#if error}
		<p
			class={css({ textStyle: "caption", color: "danger", fontWeight: "semibold" })}
			id="{id}-error"
		>
			{error}
		</p>
	{/if}
	{#if help}
		<p class={css({ textStyle: "caption", color: "muted" })} id="{id}-help">{help}</p>
	{/if}
</div>
