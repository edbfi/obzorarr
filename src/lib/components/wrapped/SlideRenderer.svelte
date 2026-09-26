<script lang="ts">
import {
	BingeSlide,
	ContentTypeSlide,
	CustomSlide as CustomSlideComponent,
	DecadeSlide,
	DistributionSlide,
	FirstLastSlide,
	FunFactSlide,
	GenresSlide,
	MarathonSlide,
	PercentileSlide,
	RewatchSlide,
	SeriesCompletionSlide,
	StreakSlide,
	TopMoviesSlide,
	TopShowsSlide,
	TopViewersSlide,
	TotalTimeSlide,
	WeekdayPatternsSlide,
	YearComparisonSlide
} from '$lib/components/slides';
import type { SlideMessagingContext } from '$lib/components/slides/messaging-context';
import { createPersonalContext } from '$lib/components/slides/messaging-context';
import type { SlideRenderConfig, SlideType } from '$lib/components/slides/types';
import type { CustomSlide } from '$lib/slides/types';
import type { ServerStats, UserStats } from '$lib/stats/types';

interface Props {
	slide: SlideRenderConfig;
	stats: UserStats | ServerStats;
	customSlides?: Map<number, CustomSlide>;
	active?: boolean;
	onAnimationComplete?: () => void;
	class?: string;
	messagingContext?: SlideMessagingContext;
}

let {
	slide,
	stats,
	customSlides,
	active = true,
	onAnimationComplete,
	class: klass = '',
	messagingContext = createPersonalContext()
}: Props = $props();

function isUserStats(s: UserStats | ServerStats): s is UserStats {
	return 'userId' in s && 'percentileRank' in s;
}

const customSlideData = $derived(
	slide.type === 'custom' && slide.customSlideId !== undefined
		? customSlides?.get(slide.customSlideId)
		: undefined
);

const percentileRank = $derived(isUserStats(stats) ? stats.percentileRank : 50);
const totalUsers = $derived(!isUserStats(stats) ? stats.totalUsers : undefined);

const topViewers = $derived(!isUserStats(stats) ? stats.topViewers : []);
</script>

<div class="slide-renderer {klass}">
	{#if slide.type === 'total-time'}
		<TotalTimeSlide
			totalWatchTimeMinutes={stats.totalWatchTimeMinutes}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'top-movies'}
		<TopMoviesSlide topMovies={stats.topMovies} {active} {onAnimationComplete} {messagingContext} />
	{:else if slide.type === 'top-shows'}
		<TopShowsSlide topShows={stats.topShows} {active} {onAnimationComplete} {messagingContext} />
	{:else if slide.type === 'genres'}
		<GenresSlide topGenres={stats.topGenres} {active} {onAnimationComplete} {messagingContext} />
	{:else if slide.type === 'distribution'}
		<DistributionSlide
			watchTimeByMonth={stats.watchTimeByMonth}
			watchTimeByHour={stats.watchTimeByHour}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'percentile'}
		{#if isUserStats(stats)}
			<PercentileSlide
				{percentileRank}
				{totalUsers}
				{active}
				{onAnimationComplete}
				{messagingContext}
			/>
		{:else}
			<TopViewersSlide {topViewers} {active} {onAnimationComplete} />
		{/if}
	{:else if slide.type === 'binge'}
		<BingeSlide
			longestBinge={stats.longestBinge}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'first-last'}
		<FirstLastSlide
			firstWatch={stats.firstWatch}
			lastWatch={stats.lastWatch}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'fun-fact' && slide.funFact}
		<FunFactSlide
			fact={slide.funFact.fact}
			comparison={slide.funFact.comparison}
			icon={slide.funFact.icon}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'custom' && customSlideData}
		<CustomSlideComponent
			title={customSlideData.title}
			content={customSlideData.content}
			renderedHtml={customSlideData.renderedHtml}
			{active}
			{onAnimationComplete}
		/>
	{:else if slide.type === 'custom' && slide.customTitle && slide.customContent}
		<CustomSlideComponent
			title={slide.customTitle}
			content={slide.customContent}
			{active}
			{onAnimationComplete}
		/>
	{:else if slide.type === 'weekday-patterns'}
		<WeekdayPatternsSlide
			watchTimeByWeekday={stats.watchTimeByWeekday}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'content-type'}
		<ContentTypeSlide
			contentTypes={stats.contentTypes}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'decade'}
		<DecadeSlide
			decadeDistribution={stats.decadeDistribution}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'series-completion'}
		<SeriesCompletionSlide
			seriesCompletion={stats.seriesCompletion}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'rewatch'}
		<RewatchSlide
			topRewatches={stats.topRewatches}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'marathon'}
		<MarathonSlide
			marathonDay={stats.marathonDay}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'streak'}
		<StreakSlide
			watchStreak={stats.watchStreak}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else if slide.type === 'year-comparison'}
		<YearComparisonSlide
			yearComparison={stats.yearComparison}
			{active}
			{onAnimationComplete}
			{messagingContext}
		/>
	{:else}
		<div class="unknown-slide">
			<p>Unknown slide type: {slide.type}</p>
		</div>
	{/if}
</div>

<style>
.slide-renderer {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
}

.unknown-slide {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--muted-foreground);
	font-size: 1rem;
}
</style>
