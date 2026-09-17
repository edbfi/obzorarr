declare global {
	namespace NodeJS {
		interface Process {
			/** Emitted by svelte-adapter-bun after it stops accepting requests. */
			once(event: 'sveltekit:shutdown', listener: () => void): this;
			emit(event: 'sveltekit:shutdown'): boolean;
		}
	}
}

export {};
