<script lang="ts">
import { Dialog } from "@ark-ui/svelte/dialog";
import { Portal } from "@ark-ui/svelte/portal";
import MenuIcon from "@lucide/svelte/icons/menu";
import XIcon from "@lucide/svelte/icons/x";
import AdminSidebar from "#lib/components/layout/AdminSidebar.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { afterNavigate } from "$app/navigation";

/**
 * The admin shell below 768px (SPEC-sign-in.md, "The admin shell"): a menu button that opens the
 * sidebar as a drawer, which traps focus, closes on Escape and gives focus back to the button.
 * `open` lets the shell make its page inert while the drawer is open; following a link closes it.
 */
let { username, open = $bindable(false) }: { username: string; open?: boolean } = $props();

afterNavigate(() => {
	open = false;
});
</script>

<Dialog.Root bind:open lazyMount unmountOnExit>
	<Dialog.Trigger
		class={css({
			display: "flex",
			alignItems: "center",
			gap: "sm",
			minHeight: "controlHeight",
			paddingInline: "md",
			borderRadius: "control",
			textStyle: "label",
			color: "text",
			cursor: "pointer",
			_hover: { bg: "raised" },
		})}
	>
		<MenuIcon size={20} aria-hidden="true" />
		{m.admin_menu()}
	</Dialog.Trigger>
	<Portal>
		<Dialog.Backdrop class={css({ position: "fixed", inset: "[0]", bg: "scrim" })} />
		<Dialog.Positioner
			class={css({ position: "fixed", insetBlock: "[0]", insetInlineStart: "[0]" })}
		>
			<Dialog.Content
				class={css({
					position: "relative",
					width: "sidebar",
					maxWidth: "[85vw]",
					height: "dvh",
					overflowY: "auto",
					bg: "surface",
					borderInlineEndWidth: "1px",
					borderInlineEndStyle: "solid",
					borderInlineEndColor: "border",
					boxShadow: "dialog",
				})}
			>
				<Dialog.Title class={css({ srOnly: true })}>{m.admin_menu()}</Dialog.Title>
				<Dialog.CloseTrigger
					aria-label={m.admin_menu_close()}
					class={css({
						position: "absolute",
						insetBlockStart: "md",
						insetInlineEnd: "md",
						display: "grid",
						placeItems: "center",
						width: "controlHeight",
						height: "controlHeight",
						borderRadius: "control",
						color: "muted",
						cursor: "pointer",
						_hover: { color: "text", bg: "raised" },
					})}
				>
					<XIcon size={20} aria-hidden="true" />
				</Dialog.CloseTrigger>
				<AdminSidebar {username} />
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog.Root>
