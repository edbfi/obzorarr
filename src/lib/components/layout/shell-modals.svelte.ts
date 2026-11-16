import { getContext, setContext, untrack } from "svelte";

const KEY = Symbol("shell-modals");

/**
 * The admin shell's open confirmations, such as Sign out's: while one is open, the shell makes
 * everything behind it inert, the drawer it was opened from included (PRODUCT.md, "Accessibility
 * and inclusion"). Ark's dialogs trap focus and hide the rest from screen readers, but don't set
 * `inert`.
 */
export class ShellModals {
	open = $state(0);

	/**
	 * Counts one confirmation as open, until the returned function is called. The count changes
	 * untracked, so an effect that holds one doesn't also depend on it and run again.
	 */
	hold(): () => void {
		untrack(() => this.open++);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			untrack(() => this.open--);
		};
	}
}

/** Gives the shell's components one `ShellModals`; the shell's layout calls it. */
export function provideShellModals(): ShellModals {
	return setContext(KEY, new ShellModals());
}

/** The shell's `ShellModals`, or undefined outside the shell. */
export function shellModals(): ShellModals | undefined {
	return getContext(KEY);
}
