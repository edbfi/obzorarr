<script lang="ts">
// The recap spike (SPEC-recap-spike.md): the story with its three steps, on the fixture's figures.
// Temporary: the PR that records D19's verdict deletes it.
import MonthlyHoursSlide from "#lib/components/recap/MonthlyHoursSlide.svelte";
import Story from "#lib/components/recap/Story.svelte";
import SummaryCard from "#lib/components/recap/SummaryCard.svelte";
import TotalTimeSlide from "#lib/components/recap/TotalTimeSlide.svelte";
import { m } from "#lib/paraglide/messages.js";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.recap_spike_page_title({ year: data.year })}</title>
</svelte:head>

{#snippet totalTime()}
	<TotalTimeSlide hours={data.hours} year={data.year} />
{/snippet}

{#snippet monthlyHours()}
	<MonthlyHoursSlide monthlyHours={data.monthlyHours} year={data.year} />
{/snippet}

{#snippet summary()}
	<SummaryCard
		member={data.member}
		year={data.year}
		movies={data.movies}
		series={data.series}
		longestStreakDays={data.longestStreakDays}
	/>
{/snippet}

<main>
	<Story
		title={m.recap_spike_story_label({ year: data.year })}
		steps={[totalTime, monthlyHours, summary]}
	/>
</main>
