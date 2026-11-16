<script lang="ts">
import { Dialog } from "@ark-ui/svelte/dialog";
import { Portal } from "@ark-ui/svelte/portal";
import LogOutIcon from "@lucide/svelte/icons/log-out";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";

/**
 * Sign out behind its confirmation (SPEC-sign-in.md, "Signing out"): the confirmation traps focus,
 * closes on Escape and gives focus back to Sign out; confirming posts to `/admin/sign-out`. In the
 * rail (`rail`), the button shows its icon and keeps its name for screen readers.
 */
let { rail = false }: { rail?: boolean } = $props();

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

<Dialog.Root>
	<Dialog.Trigger
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
	</Dialog.Trigger>
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
