<script lang="ts">
// The summary end card (SPEC-recap-spike.md, "The three slides"): the member's year on the cinema
// screen, with three figures and their decorative icons and the "Members only" badge; below it, in
// the aisle, a disabled Share recap and Back to overview.
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Film from "@lucide/svelte/icons/film";
import Flame from "@lucide/svelte/icons/flame";
import Lock from "@lucide/svelte/icons/lock";
import Share2 from "@lucide/svelte/icons/share-2";
import Tv from "@lucide/svelte/icons/tv";
import { m } from "#lib/paraglide/messages.js";
import { formatNumber } from "#lib/shared/i18n/format.ts";
import { css } from "#styled-system/css";
import CinemaScreen from "./CinemaScreen.svelte";
import { splitAroundCount } from "./count-emphasis.ts";

interface Props {
	member: string;
	year: number;
	movies: number;
	series: number;
	longestStreakDays: number;
}

let { member, year, movies, series, longestStreakDays }: Props = $props();

interface Figure {
	icon: typeof Film;
	label?: string;
	message: string;
	count: number;
}

const figures: Figure[] = $derived([
	{ icon: Film, message: m.recap_spike_summary_movies({ count: movies }), count: movies },
	{ icon: Tv, message: m.recap_spike_summary_series({ count: series }), count: series },
	{
		icon: Flame,
		label: m.recap_spike_summary_streak_label(),
		message: m.recap_spike_summary_streak_days({ count: longestStreakDays }),
		count: longestStreakDays,
	},
]);

const action = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "sm",
	minHeight: "controlHeight",
	paddingInline: "lg",
	borderRadius: "control",
	borderWidth: "1px",
	textStyle: "label",
	textAlign: "center",
	flex: "[1 1 200px]",
	maxWidth: "[280px]",
});
</script>

<div class={css({ flex: "1", display: "flex", flexDirection: "column", width: "[100%]" })}>
	<CinemaScreen>
		<p class={css({ textStyle: "label", color: "muted" })}>{m.recap_spike_summary_eyebrow()}</p>
		<h2
			tabindex="-1"
			class={css({
				marginTop: "sm",
				textStyle: "display",
				textWrap: "balance",
				overflowWrap: "anywhere",
				// The story moves focus here, but a heading is no control: no ring.
				_focus: { outline: "none" },
			})}
		>
			{m.recap_spike_summary_title({ name: member, year })}
		</h2>
		<p
			class={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "xs",
				marginTop: "md",
				paddingBlock: "xs",
				paddingInline: "md",
				borderRadius: "full",
				borderWidth: "1px",
				borderColor: "secondary/40",
				bg: "secondary/16",
				textStyle: "caption",
				fontWeight: "semibold",
				color: "text",
			})}
		>
			<Lock size={20} strokeWidth={2} aria-hidden="true" />
			{m.recap_spike_members_only()}
		</p>

		<ul
			class={css({
				display: "grid",
				gridTemplateColumns: { base: "minmax(0, 1fr)", tablet: "repeat(3, minmax(0, 1fr))" },
				gap: { base: "lg", tablet: "[0]" },
				width: "[100%]",
				maxWidth: "[720px]",
				marginTop: "xl",
			})}
		>
			{#each figures as figure, index (index)}
				{@const split = splitAroundCount(figure.message, formatNumber(figure.count))}
				<li
					class={css({
						display: "grid",
						justifyItems: "center",
						rowGap: "xs",
						paddingInline: { tablet: "lg" },
						"&:not(:first-child)": {
							borderInlineStartWidth: { tablet: "1px" },
							borderColor: "text/8",
						},
					})}
				>
					<span class={css({ color: "secondary", display: "flex" })}>
						<figure.icon size={20} strokeWidth={2} aria-hidden="true" />
					</span>
					{#if figure.label}
						<span class={css({ textStyle: "label", color: "muted" })}>{figure.label}</span>
					{/if}
					<span class={css({ textStyle: "h3", color: "muted", overflowWrap: "anywhere" })}
						>{#if split}
							{split.before}<span
								class={css({
									// Beside its word on a phone, above it from a tablet up.
									display: { base: "inline", tablet: "block" },
									textStyle: "display",
									color: "text",
									fontVariantNumeric: "tabular-nums",
								})}
								>{split.count}</span
							>{split.after}
						{:else}
							{figure.message}
						{/if}</span
					>
				</li>
			{/each}
		</ul>
	</CinemaScreen>

	<!-- The aisle below the screen: the summary's actions. -->
	<div
		class={css({
			display: "flex",
			flexWrap: "wrap",
			justifyContent: "center",
			gap: "md",
			paddingTop: "xl",
		})}
	>
		<!-- Sharing comes with `recap`; here the button shows where it goes, visibly labelled. -->
		<button
			type="button"
			disabled
			class={[
				action,
				css({ bg: "raised", borderColor: "border", color: "muted", cursor: "not-allowed" }),
			]}
		>
			<Share2 size={20} strokeWidth={2} aria-hidden="true" />
			{m.recap_spike_share()}
		</button>
		<a
			href="/"
			class={[
				action,
				css({ borderColor: "control-border", color: "text", _hover: { bg: "raised" } }),
			]}
		>
			<ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
			{m.recap_spike_back()}
		</a>
	</div>
</div>
