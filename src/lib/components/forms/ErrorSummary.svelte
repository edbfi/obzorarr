<script lang="ts" module>
/** One problem a failed submit found: its message, and the field it is about, when it is one. */
export type Problem = { message: string; href?: string };
</script>

<script lang="ts">
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";

/**
 * What a failed submit found, the first thing in its form (D29): a heading, then each problem in
 * field order, a field's as a link to that field and a page-level one as text. Nothing when nothing
 * failed. It never takes focus by itself: the page's enhance callback calls `focus()` after each
 * failure, so a late script never moves focus, and without JavaScript nothing is focused.
 */
let {
	problems,
	level = 2,
}: {
	problems: Problem[];
	/** The heading's level: 2 on a page of one form, one below its section's heading inside one. */
	level?: 2 | 3;
} = $props();
/** The heading's and list's ids, unique to this summary. */
const id = $props.id();

let summary = $state<HTMLElement>();

/** Moves focus to the summary, which announces its heading and problems. */
export function focus(): void {
	summary?.focus();
}
</script>

{#if problems.length > 0}
	<!-- A region named by its heading, its problems its description: what focus announces. -->
	<section
		bind:this={summary}
		tabindex="-1"
		aria-labelledby="{id}-title"
		aria-describedby="{id}-problems"
		class={css({
			display: "flex",
			flexDirection: "column",
			gap: "sm",
			padding: "lg",
			bg: "surface",
			borderWidth: "[2px]",
			borderStyle: "solid",
			borderColor: "danger",
			borderRadius: "control",
			// A long word, such as Danish's "Opsætningskoden", wraps rather than scrolling the page at
			// 200% zoom.
			overflowWrap: "anywhere",
			// Focus arrives here by script after a failure, which `:focus-visible` may not match.
			_focus: {
				outlineStyle: "solid",
				outlineWidth: "[2px]",
				outlineColor: "secondary",
				outlineOffset: "[2px]",
			},
		})}
	>
		<svelte:element this={`h${level}`} id="{id}-title" class={css({ textStyle: "h3" })}>
			{m.error_summary_title()}
		</svelte:element>
		<ul
			id="{id}-problems"
			class={css({ display: "flex", flexDirection: "column", gap: "xs", color: "danger" })}
		>
			{#each problems as problem (problem.href ?? problem.message)}
				<li class={css({ fontWeight: "semibold" })}>
					{#if problem.href}
						<a
							href={problem.href}
							class={css({
								color: "danger",
								textDecorationLine: "underline",
								textUnderlineOffset: "[0.2em]",
								_hover: { textDecorationThickness: "[2px]" },
							})}
						>
							{problem.message}
						</a>
					{:else}
						{problem.message}
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
