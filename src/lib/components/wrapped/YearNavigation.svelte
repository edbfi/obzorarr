<script lang="ts">
import { goto } from '$app/navigation';

interface Props {
	currentYear: number;
	availableYears: number[];
	userIdentifier?: number | string | null;
	yearIdentifiers?: Record<number, string | number>;
	class?: string;
}

let {
	currentYear,
	availableYears,
	userIdentifier = null,
	yearIdentifiers,
	class: klass = ''
}: Props = $props();

const sortedYears = $derived([...availableYears].sort((a, b) => b - a));
const currentIndex = $derived(sortedYears.indexOf(currentYear));
const hasPrevious = $derived(currentIndex >= 0 && currentIndex < sortedYears.length - 1);
const hasNext = $derived(currentIndex > 0);
const previousYear = $derived<number | null>(
	hasPrevious ? (sortedYears[currentIndex + 1] ?? null) : null
);
const nextYear = $derived<number | null>(hasNext ? (sortedYears[currentIndex - 1] ?? null) : null);

function buildUrl(year: number): string {
	if (yearIdentifiers?.[year] != null) {
		return `/wrapped/${year}/u/${yearIdentifiers[year]}`;
	}
	if (userIdentifier != null) {
		return `/wrapped/${year}/u/${userIdentifier}`;
	}
	return `/wrapped/${year}`;
}

function navigateTo(year: number | null): void {
	if (year != null) {
		goto(buildUrl(year));
	}
}

function handleKeyDown(event: KeyboardEvent, year: number | null): void {
	if ((event.key === 'Enter' || event.key === ' ') && year != null) {
		event.preventDefault();
		navigateTo(year);
	}
}
</script>

<nav class="year-nav {klass}" aria-label="Year navigation">
	<button
		type="button"
		class="nav-btn prev"
		onclick={() => navigateTo(previousYear)}
		onkeydown={(e) => handleKeyDown(e, previousYear)}
		disabled={!hasPrevious}
		aria-label={previousYear ? `Go to ${previousYear}` : 'No previous year'}
		title={previousYear ? `Go to ${previousYear}` : 'No previous year'}
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M15 18l-6-6 6-6" />
		</svg>
	</button>

	<span class="year-display" aria-current="page">
		<span class="year-text">{currentYear}</span>
	</span>

	<button
		type="button"
		class="nav-btn next"
		onclick={() => navigateTo(nextYear)}
		onkeydown={(e) => handleKeyDown(e, nextYear)}
		disabled={!hasNext}
		aria-label={nextYear ? `Go to ${nextYear}` : 'No next year'}
		title={nextYear ? `Go to ${nextYear}` : 'No next year'}
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M9 18l6-6-6-6" />
		</svg>
	</button>
</nav>

<style>
.year-nav {
	position: fixed;
	bottom: 1rem;
	left: 1rem;
	z-index: 100;
	display: flex;
	align-items: center;
	gap: 0.125rem;
	padding: 0.25rem;
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(8px);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 2rem;
	font-family: inherit;
}

.nav-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2.25rem;
	height: 2.25rem;
	padding: 0;
	background: transparent;
	border: none;
	border-radius: 50%;
	color: rgba(255, 255, 255, 0.9);
	cursor: pointer;
	transition:
		background-color 0.2s,
		transform 0.15s,
		color 0.2s;
}

.nav-btn:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.1);
	color: white;
	transform: scale(1.1);
}

.nav-btn:focus-visible {
	outline: 2px solid var(--primary, #dc2626);
	outline-offset: 2px;
}

.nav-btn:active:not(:disabled) {
	transform: scale(0.95);
}

.nav-btn:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.nav-btn svg {
	width: 1.125rem;
	height: 1.125rem;
	flex-shrink: 0;
}

.year-display {
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 3.5rem;
	padding: 0 0.5rem;
}

.year-text {
	font-size: 0.9375rem;
	font-weight: 700;
	letter-spacing: 0.02em;
	color: white;
	font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
	.year-nav {
		bottom: 0.75rem;
		left: 0.75rem;
		gap: 0;
		padding: 0.125rem;
	}

	.nav-btn {
		width: 2.75rem;
		height: 2.75rem;
	}

	.year-display {
		min-width: 0;
		padding: 0 0.25rem;
	}

	.year-text {
		font-size: 0.8125rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.nav-btn {
		transition: none;
	}

	.nav-btn:hover:not(:disabled),
	.nav-btn:active:not(:disabled) {
		transform: none;
	}
}
</style>
