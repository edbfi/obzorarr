<script lang="ts">
import { animate } from 'motion';
import type { Snippet } from 'svelte';

interface Props {
	title: string;
	subtitle?: string;
	children: Snippet;
	footer?: Snippet;
	class?: string;
}

let { title, subtitle, children, footer, class: className = '' }: Props = $props();

let cardRef: HTMLElement | undefined = $state();

$effect(() => {
	if (!cardRef) return;

	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads
	(animate as any)(
		cardRef,
		{
			opacity: [0, 1],
			transform: ['translateY(30px) scale(0.98)', 'translateY(0) scale(1)']
		},
		{
			duration: 0.6,
			easing: [0.22, 1, 0.36, 1]
		}
	);
});
</script>

<div bind:this={cardRef} class="onboarding-card {className}">
	<div class="card-glow"></div>
	<div class="card-inner">
		<header class="card-header">
			{#if title}
				<h1 class="card-title">{title}</h1>
			{/if}
			{#if subtitle}
				<p class="card-subtitle">{subtitle}</p>
			{/if}
		</header>

		<div class="card-content">
			{@render children()}
		</div>

		{#if footer}
			<footer class="card-footer">
				{@render footer()}
			</footer>
		{/if}
	</div>
</div>

<style>
.onboarding-card {
	position: relative;
	width: 100%;
	max-width: 560px;
	margin: 0 auto;
	opacity: 0;
}

.card-glow {
	position: absolute;
	inset: -1px;
	background: linear-gradient(
		135deg,
		oklch(var(--primary) / 0.15) 0%,
		oklch(var(--primary) / 0.05) 50%,
		oklch(var(--primary) / 0.1) 100%
	);
	border-radius: 20px;
	filter: blur(20px);
	opacity: 0.6;
	z-index: 0;
	pointer-events: none;
}

.card-inner {
	position: relative;
	z-index: 1;
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 20px;
	overflow: hidden;
	box-shadow:
		0 4px 24px rgba(0, 0, 0, 0.3),
		0 1px 0 rgba(255, 255, 255, 0.05) inset;
}

.card-header {
	padding: 2rem 2rem 0;
	text-align: center;
}

.card-title {
	font-size: 1.75rem;
	font-weight: 700;
	letter-spacing: -0.02em;
	color: rgba(255, 255, 255, 0.95);
	margin: 0;
	line-height: 1.2;
}

.card-subtitle {
	margin: 0.75rem 0 0;
	font-size: 0.95rem;
	color: rgba(255, 255, 255, 0.55);
	line-height: 1.5;
	max-width: 400px;
	margin-left: auto;
	margin-right: auto;
}

.card-content {
	padding: 2rem;
}

.card-footer {
	padding: 1.25rem 2rem 2rem;
	display: flex;
	justify-content: flex-end;
	gap: 0.75rem;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	background: rgba(0, 0, 0, 0.15);
}

@media (max-width: 640px) {
	.onboarding-card {
		max-width: 100%;
	}

	.card-inner {
		border-radius: 16px;
	}

	.card-header {
		padding: 1.5rem 1.5rem 0;
	}

	.card-title {
		font-size: 1.5rem;
	}

	.card-subtitle {
		font-size: 0.875rem;
	}

	.card-content {
		padding: 1.5rem;
	}

	.card-footer {
		padding: 1rem 1.5rem 1.5rem;
		flex-direction: column-reverse;
	}

	.card-footer :global(button) {
		width: 100%;
	}
}
</style>
