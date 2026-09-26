<script lang="ts">
import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
import { enhance } from '$app/forms';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let showCheckmark = $state(false);
let showContent = $state(false);
let showParticles = $state(false);

let isNavigating = $state(false);

$effect(() => {
	const checkmarkTimer = setTimeout(() => {
		showCheckmark = true;
	}, 100);

	const contentTimer = setTimeout(() => {
		showContent = true;
	}, 600);

	const particlesTimer = setTimeout(() => {
		showParticles = true;
	}, 300);

	return () => {
		clearTimeout(checkmarkTimer);
		clearTimeout(contentTimer);
		clearTimeout(particlesTimer);
	};
});

const summaryItems = $derived([
	{
		icon: 'server',
		label: 'Server',
		value: data.configSummary.serverName
	},
	{
		icon: 'palette',
		label: 'Dashboard Theme',
		value: data.configSummary.uiTheme
	},
	{
		icon: 'palette',
		label: 'Wrapped Theme',
		value: data.configSummary.wrappedTheme
	},
	{
		icon: 'shield',
		label: 'Privacy Mode',
		value: data.configSummary.anonymizationMode
	},
	{
		icon: 'shield',
		label: 'Logo Mode',
		value: data.configSummary.logoMode
	},
	{
		icon: 'share',
		label: 'Default Sharing',
		value: data.configSummary.shareMode
	},
	{
		icon: 'share',
		label: 'User Control',
		value: data.configSummary.allowUserControl
	},
	{
		icon: 'sparkles',
		label: 'Fun Facts',
		value: data.configSummary.funFacts
	}
]);
</script>

<OnboardingCard title="" subtitle="">
	{#snippet children()}
		<div class="completion-container">
			<div class="particles-container" class:active={showParticles}>
				{#each Array(20) as _, i}
					<div
						class="particle"
						style="
							--delay: {Math.random() * 3}s;
							--duration: {3 + Math.random() * 4}s;
							--x-start: {Math.random() * 100}%;
							--x-end: {(Math.random() - 0.5) * 40}px;
							--size: {2 + Math.random() * 4}px;
							--opacity: {0.3 + Math.random() * 0.5};
						"
					></div>
				{/each}
			</div>

			<div class="success-icon-container" class:animate={showCheckmark}>
				<div class="success-glow"></div>
				<div class="success-ring"></div>
				<svg aria-hidden="true" class="success-checkmark" viewBox="0 0 52 52">
					<circle class="checkmark-circle" cx="26" cy="26" r="24" fill="none" />
					<path class="checkmark-check" fill="none" d="M14 27l7 7 16-16" />
				</svg>
			</div>

			<div class="completion-header" class:visible={showContent}>
				<h1 class="completion-title">Setup Complete!</h1>
				<p class="completion-subtitle">Your Plex Wrapped is ready</p>
			</div>

			{#if data.notice === 'ai-key-missing'}
				<div class="completion-notice" class:visible={showContent} role="status">
					<svg
						class="notice-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
					<span>
						Fun facts use the built-in templates because you have not added an OpenAI key. Add one
						in <strong>Admin → Settings → Connections</strong> for AI-generated fun facts.
					</span>
				</div>
			{/if}

			<div class="summary-section" class:visible={showContent}>
				<h2 class="summary-title">Your Configuration</h2>
				<div class="summary-grid">
					{#each summaryItems as item, i}
						<div class="summary-card" style="--delay: {i * 80}ms">
							<div class="summary-icon {item.icon}">
								{#if item.icon === 'server'}
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<rect x="2" y="3" width="20" height="6" rx="1" />
										<rect x="2" y="11" width="20" height="6" rx="1" />
										<circle cx="6" cy="6" r="1" fill="currentColor" />
										<circle cx="6" cy="14" r="1" fill="currentColor" />
									</svg>
								{:else if item.icon === 'palette'}
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<circle cx="12" cy="12" r="10" />
										<circle cx="12" cy="8" r="2" fill="currentColor" />
										<circle cx="8" cy="14" r="2" fill="currentColor" />
										<circle cx="16" cy="14" r="2" fill="currentColor" />
									</svg>
								{:else if item.icon === 'shield'}
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
									</svg>
								{:else if item.icon === 'share'}
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<circle cx="18" cy="5" r="3" />
										<circle cx="6" cy="12" r="3" />
										<circle cx="18" cy="19" r="3" />
										<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
										<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
									</svg>
								{:else if item.icon === 'sparkles'}
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
									>
										<path d="M12 3l1.4 4.2L18 8.6l-4.6 1.4L12 15l-1.4-5L6 8.6l4.6-1.4L12 3z" />
										<path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
										<path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z" />
									</svg>
								{/if}
							</div>
							<div class="summary-content">
								<span class="summary-label">{item.label}</span>
								<span class="summary-value">{item.value}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			{#if data.syncStatus.running}
				<div class="sync-status" class:visible={showContent}>
					<div class="sync-indicator">
						<div class="sync-pulse"></div>
						<div class="sync-dot"></div>
					</div>
					<div class="sync-text">
						<span class="sync-label">Sync running in background</span>
						<span class="sync-detail">
							{#if data.syncStatus.progress}
								{data.syncStatus.progress.recordsProcessed.toLocaleString()}
								records processed
							{:else}
								Processing your viewing history...
							{/if}
						</span>
					</div>
				</div>
			{:else if data.syncStatus.historyCount > 0}
				<div class="sync-complete" class:visible={showContent}>
					<svg
						aria-hidden="true"
						class="sync-complete-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span>{data.syncStatus.historyCount.toLocaleString()} viewing records synced</span>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="footer-content" class:visible={showContent}>
			<form
				method="POST"
				action="?/goToDashboard"
				use:enhance
				onsubmit={() => {
	isNavigating = true;
}}
			>
				<SubmitButton class="btn-dashboard tap-target" submitting={isNavigating}>
					{#snippet children()}
						<span>Go to Dashboard</span>
						<ArrowRightIcon class="arrow-icon" />
					{/snippet}
					{#snippet submittingLabel()}
						<span>Loading dashboard…</span>
					{/snippet}
				</SubmitButton>
			</form>
			<p class="footer-note">You can change these settings anytime from the admin panel</p>
		</div>
	{/snippet}
</OnboardingCard>

<style>
.completion-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	position: relative;
	padding: 1rem 0;
	min-height: 380px;
}

.particles-container {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
	opacity: 0;
	transition: opacity 1s ease;
}

.particles-container.active {
	opacity: 1;
}

.particle {
	position: absolute;
	bottom: -20px;
	left: var(--x-start);
	width: var(--size);
	height: var(--size);
	background: radial-gradient(circle, oklch(var(--primary)) 0%, oklch(var(--accent)) 100%);
	border-radius: 50%;
	opacity: 0;
	animation: float-up var(--duration) ease-out var(--delay) infinite;
}

@keyframes float-up {
	0% {
		opacity: 0;
		transform: translateY(0) translateX(0) scale(0);
	}
	10% {
		opacity: var(--opacity);
		transform: translateY(-20px) translateX(0) scale(1);
	}
	90% {
		opacity: var(--opacity);
	}
	100% {
		opacity: 0;
		transform: translateY(-400px) translateX(var(--x-end)) scale(0.5);
	}
}

.success-icon-container {
	position: relative;
	width: 100px;
	height: 100px;
	margin-bottom: 1.5rem;
}

.success-glow {
	position: absolute;
	inset: -20px;
	background: radial-gradient(circle, oklch(var(--primary) / 0.4) 0%, transparent 70%);
	border-radius: 50%;
	opacity: 0;
	transform: scale(0.5);
	transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.success-icon-container.animate .success-glow {
	opacity: 1;
	transform: scale(1);
	animation: glow-pulse 2s ease-in-out infinite;
}

@keyframes glow-pulse {
	0%,
	100% {
		opacity: 0.6;
		transform: scale(1);
	}
	50% {
		opacity: 0.8;
		transform: scale(1.1);
	}
}

.success-ring {
	position: absolute;
	inset: 0;
	border: 3px solid oklch(var(--primary) / 0.3);
	border-radius: 50%;
	opacity: 0;
	transform: scale(0.8);
	transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s;
}

.success-icon-container.animate .success-ring {
	opacity: 1;
	transform: scale(1);
}

.success-checkmark {
	width: 100%;
	height: 100%;
	position: relative;
	z-index: 1;
}

.checkmark-circle {
	stroke: oklch(var(--primary));
	stroke-width: 2;
	stroke-dasharray: 166;
	stroke-dashoffset: 166;
	transition: stroke-dashoffset 0.6s cubic-bezier(0.65, 0, 0.45, 1) 0.1s;
}

.success-icon-container.animate .checkmark-circle {
	stroke-dashoffset: 0;
}

.checkmark-check {
	stroke: oklch(var(--primary));
	stroke-width: 3;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-dasharray: 48;
	stroke-dashoffset: 48;
	transition: stroke-dashoffset 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.5s;
}

.success-icon-container.animate .checkmark-check {
	stroke-dashoffset: 0;
}

.completion-header {
	margin-bottom: 2rem;
	opacity: 0;
	transform: translateY(20px);
	transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.completion-header.visible {
	opacity: 1;
	transform: translateY(0);
}

.completion-title {
	margin: 0;
	font-size: 1.75rem;
	font-weight: 700;
	background: linear-gradient(
		135deg,
		oklch(var(--primary)) 0%,
		oklch(var(--accent)) 50%,
		oklch(var(--primary)) 100%
	);
	background-size: 200% auto;
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
	animation: shimmer 3s linear infinite;
	font-family: "DM Sans", system-ui, sans-serif;
}

@keyframes shimmer {
	to {
		background-position: 200% center;
	}
}

.completion-subtitle {
	margin: 0.5rem 0 0;
	font-size: 1rem;
	color: rgba(255, 255, 255, 0.6);
}

.completion-notice {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
	width: 100%;
	padding: 0.875rem 1rem;
	margin-bottom: 1rem;
	background: rgba(234, 179, 8, 0.08);
	border: 1px solid rgba(234, 179, 8, 0.35);
	border-radius: 0.5rem;
	color: rgba(254, 240, 138, 0.95);
	font-size: 0.875rem;
	line-height: 1.45;
	opacity: 0;
	transform: translateY(8px);
	transition:
		opacity 0.5s ease,
		transform 0.5s ease;
}

.completion-notice.visible {
	opacity: 1;
	transform: translateY(0);
}

.completion-notice .notice-icon {
	flex: none;
	width: 1.125rem;
	height: 1.125rem;
	margin-top: 0.0625rem;
	color: rgba(234, 179, 8, 0.85);
}

.summary-section {
	width: 100%;
	opacity: 0;
	transform: translateY(20px);
	transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
}

.summary-section.visible {
	opacity: 1;
	transform: translateY(0);
}

.summary-title {
	margin: 0 0 1rem;
	font-size: 0.75rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	color: rgba(255, 255, 255, 0.4);
}

.summary-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 0.75rem;
}

@media (max-width: 480px) {
	.summary-grid {
		grid-template-columns: 1fr;
	}
}

.summary-card {
	display: flex;
	align-items: center;
	gap: 0.875rem;
	padding: 0.875rem 1rem;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid oklch(var(--primary) / 0.1);
	border-radius: 0.875rem;
	text-align: left;
	opacity: 0;
	transform: translateY(10px);
	animation: card-in 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	animation-delay: calc(0.6s + var(--delay));
}

@keyframes card-in {
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.summary-icon {
	width: 2.25rem;
	height: 2.25rem;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 0.625rem;
	flex-shrink: 0;
}

.summary-icon svg {
	width: 1.125rem;
	height: 1.125rem;
}

.summary-icon.server {
	background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1));
	color: #60a5fa;
}

.summary-icon.palette {
	background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(139, 92, 246, 0.1));
	color: #a78bfa;
}

.summary-icon.shield {
	background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1));
	color: #4ade80;
}

.summary-icon.share {
	background: linear-gradient(135deg, oklch(var(--primary) / 0.2), oklch(var(--accent) / 0.1));
	color: oklch(var(--primary));
}

.summary-content {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	min-width: 0;
}

.summary-label {
	font-size: 0.7rem;
	color: rgba(255, 255, 255, 0.45);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.summary-value {
	font-size: 0.875rem;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.sync-status {
	display: flex;
	align-items: center;
	gap: 0.875rem;
	margin-top: 1.5rem;
	padding: 0.875rem 1.25rem;
	background: oklch(var(--primary) / 0.08);
	border: 1px solid oklch(var(--primary) / 0.2);
	border-radius: 0.875rem;
	opacity: 0;
	transform: translateY(10px);
	transition: all 0.5s ease 0.8s;
}

.sync-status.visible {
	opacity: 1;
	transform: translateY(0);
}

.sync-indicator {
	position: relative;
	width: 1rem;
	height: 1rem;
	flex-shrink: 0;
}

.sync-pulse {
	position: absolute;
	inset: 0;
	background: oklch(var(--primary));
	border-radius: 50%;
	animation: pulse-ring 1.5s ease-out infinite;
}

@keyframes pulse-ring {
	0% {
		transform: scale(0.8);
		opacity: 0.8;
	}
	100% {
		transform: scale(2);
		opacity: 0;
	}
}

.sync-dot {
	position: absolute;
	inset: 3px;
	background: oklch(var(--primary));
	border-radius: 50%;
}

.sync-text {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	text-align: left;
}

.sync-label {
	font-size: 0.875rem;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
}

.sync-detail {
	font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.5);
}

.sync-complete {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	margin-top: 1.5rem;
	padding: 0.75rem 1rem;
	background: rgba(34, 197, 94, 0.1);
	border: 1px solid rgba(34, 197, 94, 0.2);
	border-radius: 0.75rem;
	font-size: 0.875rem;
	color: #4ade80;
	opacity: 0;
	transform: translateY(10px);
	transition: all 0.5s ease 0.8s;
}

.sync-complete.visible {
	opacity: 1;
	transform: translateY(0);
}

.sync-complete-icon {
	width: 1.125rem;
	height: 1.125rem;
	flex-shrink: 0;
}

.footer-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
	width: 100%;
	opacity: 0;
	transform: translateY(10px);
	transition: all 0.5s ease;
}

.footer-content.visible {
	opacity: 1;
	transform: translateY(0);
}

/* SubmitButton child-renders the real <button>, so the dashboard CTA
		   palette and paired arrow hover effect must be hoisted. */
:global(.btn-dashboard) {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.625rem;
	width: 100%;
	max-width: 280px;
	padding: 1rem 2rem;
	background: oklch(var(--primary));
	border: none;
	border-radius: 0.875rem;
	color: oklch(var(--primary-foreground));
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	box-shadow:
		0 4px 20px oklch(var(--primary) / 0.3),
		0 0 40px oklch(var(--primary) / 0.1);
}

:global(.btn-dashboard:hover) {
	transform: translateY(-3px);
	box-shadow:
		0 8px 30px oklch(var(--primary) / 0.4),
		0 0 60px oklch(var(--primary) / 0.15);
}

:global(.btn-dashboard:active) {
	transform: translateY(-1px);
}

:global(.arrow-icon) {
	width: 1.25rem;
	height: 1.25rem;
	transition: transform 0.25s ease;
}

:global(.btn-dashboard:hover .arrow-icon) {
	transform: translateX(4px);
}

.footer-note {
	margin: 0;
	font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.4);
}
</style>
