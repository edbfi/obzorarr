<script lang="ts" generics="T extends Record<string, unknown>, U extends FormPath<T>">
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { fromStore } from 'svelte/store';
import type { FormPath, SuperForm } from 'sveltekit-superforms';
import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
import {
	extractErrorArray,
	type FormFieldConstraints,
	formFieldIds,
	getValueAtPath,
	setFormField
} from './form-context.js';

interface FieldSnippetProps {
	constraints: FormFieldConstraints;
	errors: string[];
	tainted: boolean;
	value: T[U & keyof T];
}

type Props = WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> & {
	form: SuperForm<T>;
	name: U;
	/** Set when the field renders a `Form.Description`, so `Control` can reference it. */
	description?: boolean;
	children?: Snippet<[FieldSnippetProps]>;
};

let {
	ref = $bindable(null),
	class: className,
	form,
	name,
	description = false,
	children: childrenProp,
	...restProps
}: Props = $props();

const formId = $derived(fromStore(form.formId));
const formErrors = $derived(fromStore(form.errors));
const formConstraints = $derived(fromStore(form.constraints));
const formTainted = $derived(fromStore(form.tainted));
const formData = $derived(fromStore(form.form));

const ids = $derived(formFieldIds(formId.current, name));
const errors = $derived(extractErrorArray(getValueAtPath(name, formErrors.current)));
const constraints = $derived(
	(getValueAtPath(name, formConstraints.current) ?? {}) as FormFieldConstraints
);
const tainted = $derived(
	formTainted.current ? getValueAtPath(name, formTainted.current) === true : false
);
const value = $derived(getValueAtPath(name, formData.current) as T[U & keyof T]);

setFormField({
	get name() {
		return name;
	},
	get ids() {
		return ids;
	},
	get errors() {
		return errors;
	},
	get constraints() {
		return constraints;
	},
	get tainted() {
		return tainted;
	},
	get hasDescription() {
		return description;
	}
});
</script>

<div bind:this={ref} data-slot="form-item" class={cn('space-y-2', className)} {...restProps}>
	{@render childrenProp?.({ constraints, errors, tainted, value })}
</div>
