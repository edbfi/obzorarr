<script lang="ts">
import { Dialog } from "@ark-ui/svelte/dialog";
import { Portal } from "@ark-ui/svelte/portal";
import LogOutIcon from "@lucide/svelte/icons/log-out";
import { firstVisible, refocusIfLost } from "#lib/components/layout/focus-fallback.ts";
import { shellModals } from "#lib/components/layout/shell-modals.svelte.ts";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";

/**
 * Sign out behind its confirmation (SPEC-sign-in.md, "Signing out"): the confirmation traps focus,
 * closes on Escape, makes the shell behind it inert and gives focus back to Sign out; confirming
 * posts to `/admin/sign-out`. Sign out is itself a form's submit button, so without JavaScript it
 * still signs out, without asking; with it, the click opens the confirmation instead. In the rail
 * (`rail`), the button shows its icon and keeps its name for screen readers.
 */
let { rail = false }: { rail?: boolean } = $props();

let open = $state(false);
// Only once the page has script does Sign out open a confirmation; before that it signs out.
let hydrated = $state(false);
$effect(() => {
	hydrated = true;
});
let trigger = $state<HTMLButtonElement>();
const modals = shellModals();
$effect(() => {
	if (open && modals) return modals.hold();
});
// When the confirmation closes, focus is never left on the page's body.
$effect(() => {
	if (open) return () => refocusIfLost(focusAfter);
});

/** Focus goes back to this Sign out, or, once it is hidden, to one the page shows, or to Menu. */
const focusAfter = () =>
	firstVisible(
		trigger,
		...document.querySelectorAll("[data-sign-out]"),
		document.querySelector("[data-admin-menu]"),
	);

const button = css({
	minHeight: "controlHeight",
	paddingInline: "lg",
	borderRadius: "control",
	textStyle: "label",
	cursor: "pointer",
	transitionProperty: "background-color, border-color, color",
	transitionDuration: "press",
});
/** In the rail, the trigger shows only its icon, centred. */
const railTrigger = css({ tabletOnly: { justifyContent: "center", paddingInline: "[0]" } });
const railLabel = css({ tabletOnly: { srOnly: true } });
</script>

<form method="post" action="/admin/sign-out">
	<button
		bind:this={trigger}
		type="submit"
		data-sign-out
		aria-haspopup={hydrated ? "dialog" : undefined}
		aria-expanded={hydrated ? open : undefined}
		onclick={(event) => {
			event.preventDefault();
			open = true;
		}}
		class={[
			css({
				display: "flex",
				alignItems: "center",
				gap: "sm",
				width: "[100%]",
				minHeight: "controlHeight",
				paddingInline: "md",
				borderRadius: "control",
				textStyle: "label",
				color: "muted",
				cursor: "pointer",
				_hover: { color: "text", bg: "raised" },
			}),
			rail ? railTrigger : undefined,
		]}
	>
		<LogOutIcon size={20} aria-hidden="true" />
		<span class={rail ? railLabel : undefined}>
			{m.admin_sign_out()}
		</span>
	</button>
</form>

<Dialog.Root bind:open role="alertdialog" lazyMount unmountOnExit finalFocusEl={focusAfter}>
	<Portal>
		<Dialog.Backdrop class={css({ position: "fixed", inset: "[0]", bg: "scrim" })} />
		<Dialog.Positioner
			class={css({
				position: "fixed",
				inset: "[0]",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "lg",
			})}
		>
			<Dialog.Content
				class={css({
					width: "[100%]",
					maxWidth: "[400px]",
					padding: "xl",
					bg: "surface",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border",
					borderRadius: "dialog",
					boxShadow: "dialog",
				})}
			>
				<Dialog.Title class={css({ textStyle: "h3", textWrap: "balance" })}>
					{m.admin_sign_out_title()}
				</Dialog.Title>
				<form
					method="post"
					action="/admin/sign-out"
					class={css({
						display: "flex",
						flexWrap: "wrap",
						justifyContent: "flex-end",
						gap: "md",
						marginBlockStart: "xl",
					})}
				>
					<Dialog.CloseTrigger
						type="button"
						class={[
							button,
							css({
								color: "text",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "control-border",
								_hover: { borderColor: "muted" },
							}),
						]}
					>
						{m.admin_sign_out_cancel()}
					</Dialog.CloseTrigger>
					<button
						type="submit"
						class={[
							button,
							css({ bg: "primary", color: "background", _hover: { bg: "secondary" } }),
						]}
					>
						{m.admin_sign_out()}
					</button>
				</form>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog.Root>
