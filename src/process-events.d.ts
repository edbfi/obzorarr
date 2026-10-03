declare global {
	namespace NodeJS {
		interface Process {
			/**
			 * Emitted by @sveltejs/adapter-bun on SIGTERM/SIGINT once in-flight requests have drained
			 * (or SHUTDOWN_TIMEOUT forced them closed); scripts/serve.ts then finishes the front's drain.
			 */
			once(event: 'sveltekit:shutdown', listener: () => void): this;
			emit(event: 'sveltekit:shutdown'): boolean;
		}
	}
}

export {};
