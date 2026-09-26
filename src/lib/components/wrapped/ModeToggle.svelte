<script lang="ts">
type ViewMode = 'story' | 'scroll';

interface Props {
	mode: ViewMode;
	onModeChange: (newMode: ViewMode) => void;
	class?: string;
}

let { mode, onModeChange, class: klass = '' }: Props = $props();

const targetMode = $derived<ViewMode>(mode === 'story' ? 'scroll' : 'story');
const label = $derived(mode === 'story' ? 'Switch to Scroll Mode' : 'Switch to Story Mode');
const displayText = $derived(mode === 'story' ? 'Scroll' : 'Story');

function handleClick(): void {
	onModeChange(targetMode);
}

function handleKeyDown(event: KeyboardEvent): void {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		handleClick();
	}
}
</script>

<button
	type="button"
	class="mode-toggle {klass}"
	onclick={handleClick}
	onkeydown={handleKeyDown}
	aria-label={label}
	title={label}
>
	{#if mode === 'story'}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12 3v18" />
			<path d="M8 7l4-4 4 4" />
			<path d="M8 17l4 4 4-4" />
		</svg>
	{:else}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M8 4v16" />
			<path d="M16 4v16" />
		</svg>
	{/if}
	<span class="toggle-label">{displayText}</span>
</button>

<style>
.mode-toggle {
	position: fixed;
	top: 1rem;
	right: 4rem;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	/* WCAG 2.1 SC 2.5.5: keep both axes at or above 44×44 logical px. */
	min-width: var(--min-tap-size);
	min-height: var(--min-tap-size);
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(8px);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 2rem;
	color: var(--foreground, white);
	cursor: pointer;
	font-family: inherit;
	transition:
		background-color 0.2s,
		transform 0.2s,
		border-color 0.2s;
}

.mode-toggle:hover {
	background: rgba(0, 0, 0, 0.9);
	border-color: rgba(255, 255, 255, 0.2);
	transform: scale(1.05);
}

.mode-toggle:focus-visible {
	outline: 3px solid #ffffff;
	outline-offset: 3px;
	border-color: #ffffff;
	box-shadow:
		0 0 0 6px rgba(0, 0, 0, 0.85),
		0 0 0 8px var(--primary, #dc2626);
}

.mode-toggle:active {
	transform: scale(0.98);
}

.mode-toggle svg {
	width: 1.25rem;
	height: 1.25rem;
	flex-shrink: 0;
}

.toggle-label {
	font-size: 0.875rem;
	font-weight: 500;
	white-space: nowrap;
}

@media (max-width: 768px) {
	.mode-toggle {
		top: 0.75rem;
		right: 3rem;
		padding: 0.5rem;
		/* Force the circular mobile button to the tap-target floor —
				   the previous min-width/-height inherited from the default
				   layout were being clipped by padding alone. */
		width: var(--min-tap-size);
		height: var(--min-tap-size);
		border-radius: 50%;
	}

	.toggle-label {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
}

@media (min-width: 1024px) {
	.mode-toggle {
		right: 4.5rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.mode-toggle {
		transition: none;
	}

	.mode-toggle:hover,
	.mode-toggle:active {
		transform: none;
	}
}
</style>
