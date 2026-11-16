/** Room for a few password hashes or verifications at once. */
export type HashSlots = {
	/**
	 * Takes a slot, or gives undefined at once when every slot is busy, without waiting. The
	 * returned function frees the slot; calling it again does nothing.
	 */
	take(): (() => void) | undefined;
};

/** `size` slots, shared by everyone who takes one. */
export function createHashSlots(size: number): HashSlots {
	let busy = 0;
	return {
		take() {
			if (busy >= size) return undefined;
			busy++;
			let released = false;
			return () => {
				if (released) return;
				released = true;
				busy--;
			};
		},
	};
}

/**
 * The app's one set: at most 4 password hashes or verifications run at once, across the claim,
 * signing in, recovery and the password change, so a spread-out attack can't stall a small
 * server (SPEC-sign-in.md, "Signing in"). A refused slot is answered "Too many requests" with
 * `Retry-After: 5`.
 */
export const hashSlots = createHashSlots(4);

/** How long a request refused a slot waits before trying again, in seconds. */
export const HASH_SLOT_RETRY_SECONDS = 5;
