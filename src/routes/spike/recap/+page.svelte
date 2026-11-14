<script lang="ts">
// The recap spike (SPEC-recap-spike.md): the story with its three steps, on the fixture's figures.
// Temporary: the PR that records D19's verdict deletes it.
import Story from "#lib/components/recap/Story.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const heading = css({
	textStyle: "h1",
	textWrap: "balance",
	maxWidth: "readingMax",
	alignSelf: "flex-start",
});
</script>

<svelte:head>
	<title>{m.recap_spike_page_title({ year: data.year })}</title>
</svelte:head>

{#snippet totalTime()}
	<h2 tabindex="-1" class={heading}>
		{m.recap_spike_total_time({ count: data.hours, year: data.year })}
	</h2>
{/snippet}

{#snippet monthlyHours()}
	<h2 tabindex="-1" class={heading}>{m.recap_spike_monthly_title({ year: data.year })}</h2>
{/snippet}

{#snippet summary()}
	<h2 tabindex="-1" class={heading}>
		{m.recap_spike_summary_title({ name: data.member, year: data.year })}
	</h2>
{/snippet}

<main>
	<Story
		title={m.recap_spike_story_label({ year: data.year })}
		steps={[totalTime, monthlyHours, summary]}
	/>
</main>
