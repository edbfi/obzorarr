import 'node:process';

declare module 'node:process' {
	interface ProcessEventMap {
		/** Emitted by svelte-adapter-bun after it stops accepting requests. */
		'sveltekit:shutdown': [];
	}
}
