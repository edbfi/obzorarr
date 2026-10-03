import { flushSync, mount, unmount } from 'svelte';
import { writable } from 'svelte/store';
import type { SuperForm } from 'sveltekit-superforms';
import FormAccessibilityFixture from './FormAccessibilityFixture.svelte';
import type { FormAccessibilityFixtureData } from './form-accessibility-schema';

/**
 * Entry point of the client bundle that `form-accessibility-dom.test.ts` builds
 * with the browser condition. It exposes the superForm stores the components read,
 * so the test can push errors in and out the way superForm does after a submit.
 */
export interface FixtureState {
	id: string;
	data: FormAccessibilityFixtureData;
	errors: Record<string, unknown>;
	constraints: Record<string, unknown>;
}

export function mountFixture(target: Element, state: FixtureState) {
	const stores = {
		form: writable(state.data),
		formId: writable(state.id),
		errors: writable(state.errors),
		constraints: writable(state.constraints),
		tainted: writable(undefined)
	};
	const component = mount(FormAccessibilityFixture, {
		target,
		props: { form: stores as unknown as SuperForm<FormAccessibilityFixtureData> }
	});
	flushSync();

	return {
		setErrors(errors: Record<string, unknown>) {
			stores.errors.set(errors);
			flushSync();
		},
		destroy() {
			unmount(component);
		}
	};
}
