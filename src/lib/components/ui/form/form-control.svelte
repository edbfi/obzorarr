<script lang="ts">
import type { Snippet } from 'svelte';
import { type FormControlAttributes, formControlAttributes, getFormField } from './form-context.js';

interface Props {
	/**
	 * `props` goes on the control element. `labelId` is the id of the field's
	 * `Form.Label`; pass it as `aria-labelledby` to controls a `<label for>` cannot
	 * name, such as a `role="radiogroup"` element.
	 */
	children?: Snippet<[{ props: FormControlAttributes; labelId: string }]>;
}

let { children }: Props = $props();

const field = getFormField();
const controlProps = $derived(formControlAttributes(field));
</script>

{@render children?.({ props: controlProps, labelId: field.ids.label })}
