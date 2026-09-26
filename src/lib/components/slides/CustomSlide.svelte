<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { CustomSlideProps } from './types';

interface Props extends CustomSlideProps {
	renderedHtml?: string;
}

let {
	title,
	content,
	renderedHtml,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children
}: Props = $props();

let container: HTMLElement | undefined = $state();
let titleEl: HTMLElement | undefined = $state();
let contentEl: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		if (titleEl) titleEl.style.opacity = '1';
		if (contentEl) contentEl.style.opacity = '1';
		onAnimationComplete?.();
		return;
	}

	const animations: ReturnType<typeof animate>[] = [];

	const containerAnim = animate(
		container,
		{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
		{ type: 'spring', ...SPRING_PRESETS.gentle }
	);
	animations.push(containerAnim);

	if (titleEl) {
		const titleAnim = animate(
			titleEl,
			{ opacity: [0, 1] },
			{ duration: 0.4, delay: DELAY_PRESETS.short }
		);
		animations.push(titleAnim);
	}

	if (contentEl) {
		const contentAnim = animate(
			contentEl,
			{ opacity: [0, 1] },
			{ duration: 0.4, delay: DELAY_PRESETS.medium }
		);
		animations.push(contentAnim);

		contentAnim.finished.then(() => {
			onAnimationComplete?.();
		});
	} else {
		containerAnim.finished.then(() => {
			onAnimationComplete?.();
		});
	}

	return () => {
		animations.forEach((a) => a.stop());
	};
});
</script>

<BaseSlide {active} class="custom-slide {klass}">
	<div bind:this={container} class="content">
		<h2 bind:this={titleEl} class="title">{title}</h2>

		<div bind:this={contentEl} class="markdown-content">
			{#if renderedHtml}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderedHtml}
			{:else}
				<p>{content}</p>
			{/if}
		</div>

		{#if children}
			<div class="extra">
				{@render children()}
			</div>
		{/if}
	</div>
</BaseSlide>

<style>
.content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2.5rem;
	z-index: 1;
	max-width: var(--content-max-md, 750px);
	width: 100%;
}

.title {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.05em;
	text-align: center;
	text-shadow: 0 0 30px oklch(var(--primary) / 0.3);
}

.markdown-content {
	font-size: 1.1875rem;
	line-height: 1.7;
	color: oklch(var(--foreground));
	text-align: left;
	width: 100%;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.markdown-content :global(h1),
.markdown-content :global(h2),
.markdown-content :global(h3) {
	color: oklch(var(--primary));
	margin-top: 1.5rem;
	margin-bottom: 0.75rem;
}

.markdown-content :global(h1) {
	font-size: 1.75rem;
}

.markdown-content :global(h2) {
	font-size: 1.5rem;
}

.markdown-content :global(h3) {
	font-size: 1.25rem;
}

.markdown-content :global(p) {
	margin-bottom: 1rem;
}

.markdown-content :global(ul),
.markdown-content :global(ol) {
	margin-bottom: 1rem;
	padding-left: 1.5rem;
}

.markdown-content :global(li) {
	margin-bottom: 0.5rem;
}

.markdown-content :global(strong) {
	color: oklch(var(--primary));
	font-weight: 700;
}

.markdown-content :global(em) {
	font-style: italic;
}

.markdown-content :global(a) {
	color: oklch(var(--primary));
	text-decoration: underline;
	text-underline-offset: 2px;
}

.markdown-content :global(a:hover) {
	opacity: 0.8;
}

.markdown-content :global(blockquote) {
	border-left: 4px solid oklch(var(--primary));
	padding-left: 1rem;
	margin: 1rem 0;
	font-style: italic;
	color: oklch(var(--muted-foreground));
}

.markdown-content :global(code) {
	background: rgba(255, 255, 255, 0.1);
	padding: 0.125rem 0.25rem;
	border-radius: 0.25rem;
	font-family: monospace;
	font-size: 0.9em;
}

.markdown-content :global(pre) {
	background: rgba(0, 0, 0, 0.3);
	padding: 1rem;
	border-radius: 0.5rem;
	overflow-x: auto;
	margin: 1rem 0;
}

.markdown-content :global(pre code) {
	background: none;
	padding: 0;
}

.markdown-content :global(hr) {
	border: none;
	border-top: 1px solid oklch(var(--border));
	margin: 2rem 0;
}

.extra {
	margin-top: 1rem;
}

@media (max-width: 767px) {
	.content {
		max-width: 100%;
	}

	.title {
		font-size: 1.5rem;
	}

	.markdown-content {
		font-size: 1rem;
	}

	.markdown-content :global(h1) {
		font-size: 1.5rem;
	}

	.markdown-content :global(h2) {
		font-size: 1.25rem;
	}

	.markdown-content :global(h3) {
		font-size: 1.125rem;
	}
}

@media (min-width: 768px) and (max-width: 1023px) {
	.content {
		max-width: var(--content-max-md, 800px);
	}

	.title {
		font-size: 2rem;
	}

	.markdown-content {
		font-size: 1.1875rem;
		line-height: 1.75;
	}

	.markdown-content :global(h1) {
		font-size: 1.875rem;
	}

	.markdown-content :global(h2) {
		font-size: 1.625rem;
	}

	.markdown-content :global(h3) {
		font-size: 1.375rem;
	}
}

@media (min-width: 1024px) {
	.content {
		max-width: var(--content-max-lg, 950px);
		gap: 3rem;
	}

	.title {
		font-size: 2.25rem;
	}

	.markdown-content {
		font-size: 1.25rem;
		line-height: 1.8;
	}

	.markdown-content :global(h1) {
		font-size: 2rem;
	}

	.markdown-content :global(h2) {
		font-size: 1.75rem;
	}

	.markdown-content :global(h3) {
		font-size: 1.5rem;
	}

	.markdown-content :global(p) {
		margin-bottom: 1.25rem;
	}

	.markdown-content :global(blockquote) {
		padding-left: 1.25rem;
	}

	.markdown-content :global(pre) {
		padding: 1.25rem;
	}
}
</style>
