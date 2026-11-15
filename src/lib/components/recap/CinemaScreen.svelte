<script lang="ts">
// The cinema every step plays in (SPEC-recap-spike.md, "The three slides"): a screen lit by the
// projector, the light it throws back onto the room, and the seats along its foot. A step renders its content on
// the screen; nothing sits behind that content but the screen's light.
import type { Snippet } from "svelte";
import { css } from "#styled-system/css";

interface Props {
	/** What the screen shows. */
	children: Snippet;
}

let { children }: Props = $props();

// Panda extracts styles statically, so each row's colours are a class written out here: both rows
// are dark against the screen, and the back row's rim catches more of its light.
const seatStyles = {
	back: css({ fill: "background", stroke: "border" }),
	front: css({ fill: "background", stroke: "raised" }),
};

/** Two rows of seat backs, the front one overlapping the back, wider than the screen. */
const rows = [
	{ y: 0, width: 34, height: 46, gap: 6, count: 14, style: seatStyles.back },
	{ y: 22, width: 44, height: 58, gap: 8, count: 12, style: seatStyles.front },
];
const viewWidth = 500;

function seats(row: (typeof rows)[number]) {
	const span = row.count * row.width + (row.count - 1) * row.gap;
	const start = (viewWidth - span) / 2;
	return Array.from({ length: row.count }, (_, index) => start + index * (row.width + row.gap));
}
</script>

<div
	class={css({
		position: "relative",
		flex: "1",
		display: "flex",
		flexDirection: "column",
		width: "[100%]",
		maxWidth: "[1040px]",
		marginInline: "auto",
	})}
>
	<div
		class={css({
			position: "relative",
			flex: "1",
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			textAlign: "center",
			paddingInline: { base: "lg", tablet: "section" },
			paddingTop: { base: "xl", tablet: "section" },
			// Room for the seats along the screen's foot, so they never sit behind the content.
			paddingBottom: { base: "[64px]", tablet: "[96px]" },
			// Its own stacking context, so its layers never rise above the story's sticky bars.
			isolation: "isolate",
			borderRadius: "sm",
			borderWidth: "1px",
			borderColor: "text/8",
			bgGradient: "to-b",
			gradientFrom: "surface",
			gradientTo: "surface/70",
			// The projector's light on the screen, brightest where it lands at the top.
			_before: {
				content: '""',
				position: "absolute",
				inset: "[0]",
				borderRadius: "[inherit]",
				bgGradient: "beam",
				opacity: "[0.07]",
				pointerEvents: "none",
			},
			// Where the projection lands, the screen is brightest.
			_after: {
				content: '""',
				position: "absolute",
				inset: "[0]",
				borderRadius: "[inherit]",
				bgRadial: "[ellipse 70% 70% at 50% 42%]",
				gradientFrom: "text/6",
				gradientTo: "text/0",
				pointerEvents: "none",
			},
		})}
	>
		<!-- Above the screen's light, which `::after` would otherwise paint over it. -->
		<div
			class={css({
				position: "relative",
				zIndex: "[1]",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				width: "[100%]",
				minWidth: "[0]",
			})}
		>
			{@render children()}
		</div>
		<!-- The light the screen throws back onto the room below it. -->
		<div
			aria-hidden="true"
			class={css({
				position: "absolute",
				insetInline: "[10%]",
				bottom: "[-40px]",
				height: "[80px]",
				bgRadial: "[ellipse 50% 50% at 50% 50%]",
				gradientFrom: "secondary/16",
				gradientTo: "secondary/0",
				pointerEvents: "none",
			})}
		></div>
		<svg
			aria-hidden="true"
			viewBox="0 0 {viewWidth} 70"
			preserveAspectRatio="xMidYMin slice"
			class={css({
				position: "absolute",
				zIndex: "[1]",
				insetInline: "[0]",
				bottom: "[-8px]",
				width: "[100%]",
				height: { base: "[56px]", tablet: "[76px]" },
			})}
		>
			{#each rows as row (row.y)}
				{#each seats(row) as x (x)}
					<rect
						{x}
						y={row.y}
						width={row.width}
						height={row.height}
						rx={row.width * 0.32}
						stroke-width="1.2"
						class={row.style}
					/>
				{/each}
			{/each}
		</svg>
	</div>
</div>
