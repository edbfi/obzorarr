<script lang="ts">
import type { Label as LabelPrimitive } from 'bits-ui';
import { Label } from '$lib/components/ui/label/index.js';
import { cn } from '$lib/utils.js';
import { getFormField } from './form-context.js';

let {
	ref = $bindable(null),
	children,
	class: className,
	...restProps
}: Omit<LabelPrimitive.RootProps, 'for' | 'id'> = $props();

const field = getFormField();
const hasErrors = $derived(field.errors.length > 0);
</script>

<Label
	bind:ref
	{...restProps}
	id={field.ids.label}
	for={field.ids.control}
	data-slot="form-label"
	data-form-error={hasErrors ? '' : undefined}
	class={cn('data-[form-error]:text-destructive', className)}
>
	{@render children?.()}
</Label>
