<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cn, type WithElementRef } from '$lib/utils.js';
import { getFormField } from './form-context.js';

let {
	ref = $bindable(null),
	class: className,
	children,
	...restProps
}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'id'> = $props();

const field = getFormField();
const hasErrors = $derived(field.errors.length > 0);
</script>

<div
	bind:this={ref}
	{...restProps}
	id={field.ids.description}
	data-slot="form-description"
	data-form-error={hasErrors ? '' : undefined}
	class={cn('text-muted-foreground text-sm', className)}
>
	{@render children?.()}
</div>
