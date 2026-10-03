<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { cn, type WithElementRef } from '$lib/utils.js';
import { getFormField } from './form-context.js';

interface ErrorProps {
	'data-form-field-error': '';
	'data-form-error': '' | undefined;
}

type Props = Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'id' | 'children'> & {
	errorClasses?: string | undefined | null;
	children?: Snippet<[{ errors: string[]; errorProps: ErrorProps }]>;
};

let {
	ref = $bindable(null),
	class: className,
	errorClasses,
	children: childrenProp,
	...restProps
}: Props = $props();

const field = getFormField();
const hasErrors = $derived(field.errors.length > 0);
const errorProps = $derived<ErrorProps>({
	'data-form-field-error': '',
	'data-form-error': hasErrors ? '' : undefined
});
</script>

<!--
	Always rendered, empty or not: a live region inserted together with its text is
	often not announced, so the container stays in the DOM and only its content
	changes. Control references this id only while there are errors.
-->
<div
	bind:this={ref}
	{...restProps}
	id={field.ids.errors}
	aria-live="assertive"
	data-form-field-errors=""
	data-form-error={hasErrors ? '' : undefined}
	class={cn('text-destructive text-sm font-medium', className)}
>
	{#if childrenProp}
		{@render childrenProp({ errors: field.errors, errorProps })}
	{:else}
		{#each field.errors as error (error)}
			<div {...errorProps} class={cn(errorClasses)}>{error}</div>
		{/each}
	{/if}
</div>
