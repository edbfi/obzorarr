<script lang="ts">
import { Dialog } from "@ark-ui/svelte/dialog";
import { Portal } from "@ark-ui/svelte/portal";
import MenuIcon from "@lucide/svelte/icons/menu";
import XIcon from "@lucide/svelte/icons/x";
import AdminSidebar from "#lib/components/layout/AdminSidebar.svelte";
import { firstVisible } from "#lib/components/layout/focus-fallback.ts";
import { shellModals } from "#lib/components/layout/shell-modals.svelte.ts";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { afterNavigate } from "$app/navigation";

/**
 * The admin shell below 768px (SPEC-sign-in.md, "The admin shell"): a menu button that opens the
 * sidebar as a drawer, which traps focus, closes on Escape and gives focus back to the button.
 * `open` lets the shell make its page inert while the drawer is open. Following a link closes it,
 * and so does a window widened to 768px, where the sidebar takes over; a confirmation opened from
 * the drawer makes the drawer inert behind it.
 */
let { username, open = $bindable(false) }: { username: string; open?: boolean } = $props();

const modals = shellModals();

/** Focus goes back to Menu, or, once the sidebar has taken over, into the sidebar. */
const focusAfter = () =>
	firstVisible(
		document.querySelector("[data-admin-menu]"),
		document.querySelector("#admin-sidebar [data-sign-out]"),
		document.querySelector("#admin-sidebar a"),
	);

afterNavigate(() => {
	open = false;
});

$effect(() => {
	const wide = window.matchMedia("(min-width: 768px)");
	const closeWhenWide = () => {
		if (wide.matches) open = false;
	};
	wide.addEventListener("change", closeWhenWide);
	return () => wide.removeEventListener("change", closeWhenWide);
});
</script>

<Dialog.Root bind:open lazyMount unmountOnExit finalFocusEl={focusAfter}>
	<Dialog.Trigger
		data-admin-menu
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
					width: "sidebar",
					maxWidth: "[100vw]",
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
				<!-- A wrapper, not the content itself, is made inert, so the drawer's own focus trap
				keeps working. -->
				<div id="admin-drawer" inert={(modals?.open ?? 0) > 0} class={css({ height: "[100%]" })}>
					<AdminSidebar {username}>
						{#snippet close()}
							<Dialog.CloseTrigger
								aria-label={m.admin_menu_close()}
								class={css({
									display: "grid",
									placeItems: "center",
									flex: "none",
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
						{/snippet}
					</AdminSidebar>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog.Root>
