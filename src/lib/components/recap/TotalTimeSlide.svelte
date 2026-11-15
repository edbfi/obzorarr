<script lang="ts">
// The total-time step (SPEC-recap-spike.md, "The three slides"): the total as a whole sentence on
// the cinema screen, its count at poster size in the projector's white light, then "Movie Buff".
// As it enters, the sentence and "Movie Buff" rise together, and the count comes into focus.
import { m } from "#lib/paraglide/messages.js";
import { formatNumber } from "#lib/shared/i18n/format.ts";
import { css } from "#styled-system/css";
import CinemaScreen from "./CinemaScreen.svelte";
import { splitAroundCount } from "./count-emphasis.ts";

interface Props {
	/** The hours of everything the member played. */
	hours: number;
	year: number;
}

let { hours, year }: Props = $props();

const message = $derived(m.recap_spike_total_time({ count: hours, year }));
const split = $derived(splitAroundCount(message, formatNumber(hours)));
</script>

<CinemaScreen>
	<h2
		tabindex="-1"
		class={css({
			textStyle: "h1",
			color: "muted",
			textWrap: "balance",
			overflowWrap: "anywhere",
			maxWidth: "readingMax",
			// The story moves focus here, but a heading is no control: no ring.
			_focus: { outline: "none" },
			_motionSafe: { animationStyle: "recapRise" },
		})}
	>
		{#if split}
			{split.before}<span
				class={css({
					display: "block",
					textStyle: "display",
					fontSize: "poster",
					color: "text",
					fontVariantNumeric: "tabular-nums",
					_motionSafe: { animationStyle: "recapFocus" },
				})}
				>{split.count}</span
			>{split.after}
		{:else}
			{message}
		{/if}
	</h2>
	<p
		class={css({
			marginTop: "xl",
			textStyle: "h2",
			color: "primary",
			_motionSafe: { animationStyle: "recapRise" },
			// A short rule above, as a title card's.
			_before: {
				content: '""',
				display: "block",
				width: "[32px]",
				height: "[1px]",
				marginInline: "auto",
				marginBottom: "md",
				bg: "secondary",
			},
		})}
	>
		{m.recap_spike_total_badge()}
	</p>
</CinemaScreen>
