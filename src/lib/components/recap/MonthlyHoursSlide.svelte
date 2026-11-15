<script lang="ts">
// The monthly-hours step (SPEC-recap-spike.md, "The three slides"): the twelve months on the cinema
// screen, as a list labelled by the step's heading. On a phone each month is a row (its name, a
// bar, its hours); from a tablet up the same list is projected as twelve columns. The list is the
// chart's text, so it needs no chart library.
import { m } from "#lib/paraglide/messages.js";
import { formatDateTime, formatNumber } from "#lib/shared/i18n/format.ts";
import { css } from "#styled-system/css";
import CinemaScreen from "./CinemaScreen.svelte";
import { splitAroundCount } from "./count-emphasis.ts";

interface Props {
	year: number;
	/** The hours of everything played in each month, January first. */
	monthlyHours: number[];
}

let { year, monthlyHours }: Props = $props();

const headingId = $props.id();

const months = $derived.by(() => {
	const busiest = Math.max(0, ...monthlyHours);
	return monthlyHours.map((hours, index) => {
		const message = m.recap_spike_monthly_hours({ count: hours });
		return {
			// A calendar value, so its name is formatted in UTC (SPEC-i18n.md, "Formatting").
			name: formatDateTime(new Date(Date.UTC(year, index, 1)), { month: "short", timeZone: "UTC" }),
			message,
			split: splitAroundCount(message, formatNumber(hours)),
			// Bars are proportional to the busiest month, which is marked.
			share: busiest > 0 ? hours / busiest : 0,
			busiest: busiest > 0 && hours === busiest,
		};
	});
});

/** The words around a column's count: read by a screen reader, hidden on a column. */
const columnHidden = css({ srOnly: { base: false, tablet: true } });
</script>

<CinemaScreen>
	<h2
		id={headingId}
		tabindex="-1"
		class={css({
			textStyle: "h1",
			textWrap: "balance",
			overflowWrap: "anywhere",
			maxWidth: "readingMax",
			// The story moves focus here, but a heading is no control: no ring.
			_focus: { outline: "none" },
		})}
	>
		{m.recap_spike_monthly_title({ year })}
	</h2>
	<ol
		aria-labelledby={headingId}
		class={css({
			display: "grid",
			width: "[100%]",
			marginTop: "xl",
			textAlign: "start",
			gridTemplateColumns: {
				base: "auto minmax(0, 1fr) auto",
				tablet: "repeat(12, minmax(0, 1fr))",
			},
			columnGap: { base: "lg", tablet: "md" },
			rowGap: "sm",
			height: { tablet: "[clamp(200px, 38dvh, 340px)]" },
		})}
	>
		{#each months as month, index (index)}
			<li
				data-busiest={month.busiest ? "" : undefined}
				class={css({
					display: "grid",
					alignItems: { base: "center", tablet: "end" },
					justifyItems: { tablet: "center" },
					gap: { tablet: "sm" },
					minHeight: { base: "[28px]" },
					gridColumn: { base: "1 / -1", tablet: "auto" },
					gridTemplateColumns: { base: "subgrid", tablet: "minmax(0, 1fr)" },
					gridTemplateRows: { tablet: "auto minmax(0, 1fr) auto" },
					gridTemplateAreas: { base: '"name bar hours"', tablet: '"hours" "bar" "name"' },
				})}
			>
				<span class={css({ gridArea: "name", textStyle: "label", color: "muted" })}
					>{month.name}</span
				>
				<span
					class={css({
						gridArea: "bar",
						display: "flex",
						flexDirection: { tablet: "column" },
						justifyContent: { tablet: "flex-end" },
						alignSelf: { tablet: "stretch" },
						width: "[100%]",
						height: { base: "[12px]", tablet: "auto" },
						borderRadius: { base: "full", tablet: "[3px 3px 0 0]" },
						bg: { base: "background/70", tablet: "transparent" },
						overflow: "hidden",
					})}
				>
					<span
						data-bar
						style:--share={month.share}
						class={css({
							display: "block",
							width: { base: "[calc(var(--share) * 100%)]", tablet: "[100%]" },
							height: { base: "[100%]", tablet: "[calc(var(--share) * 100%)]" },
							borderRadius: { base: "full", tablet: "[3px 3px 0 0]" },
							bgGradient: { base: "to-r", tablet: "to-t" },
							gradientFrom: "secondary/50",
							gradientTo: "secondary",
							"[data-busiest] &": { gradientTo: "primary/85" },
						})}
					></span>
				</span>
				<span
					class={css({
						gridArea: "hours",
						textStyle: "table",
						color: "text",
						textAlign: "end",
						fontVariantNumeric: "tabular-nums",
						whiteSpace: "nowrap",
					})}
					>{#if month.split}
						<span class={columnHidden}>{month.split.before}</span>{month.split.count}<span
							class={columnHidden}
							>{month.split.after}</span
						>
					{:else}
						{month.message}
					{/if}</span
				>
			</li>
		{/each}
	</ol>
</CinemaScreen>
