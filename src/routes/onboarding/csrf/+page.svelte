<script lang="ts">
import CheckIcon from '@lucide/svelte/icons/check';
import ExternalLink from '@lucide/svelte/icons/external-link';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import { animate, stagger } from 'motion';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import { Button } from '$lib/components/ui/button';
import { submitAction } from '$lib/utils/submit-action';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

function getInitialOrigin(): string {
	return data.csrfConfig.value || data.detection.detectedOrigin;
}

function isDetectedOrigin(origin: string): boolean {
	return origin === data.detection.detectedOrigin;
}

const initialOrigin = getInitialOrigin();
const initialOriginVerified = isDetectedOrigin(initialOrigin);
let csrfOriginInput = $state<string>(initialOrigin);

let testResult = $state<'idle' | 'testing' | 'success' | 'failure'>(
	initialOriginVerified ? 'success' : 'idle'
);
let testError = $state<string | null>(null);
let testedOrigin = $state<string | null>(initialOriginVerified ? initialOrigin : null);

let previousInput = $state<string>(initialOrigin);
$effect(() => {
	if (csrfOriginInput !== previousInput) {
		previousInput = csrfOriginInput;
		if (isDetectedOrigin(csrfOriginInput)) {
			testResult = 'success';
			testError = null;
			testedOrigin = csrfOriginInput;
		} else if (testResult !== 'idle') {
			testResult = 'idle';
			testError = null;
			testedOrigin = null;
		}
	}
});

async function runTest() {
	if (!csrfOriginInput) return;

	testResult = 'testing';
	testError = null;

	const formData = new FormData();
	formData.set('csrfOrigin', csrfOriginInput);

	try {
		const result = await submitAction<{ testError?: string }>('?/testOrigin', formData);

		if (result.type === 'success') {
			testResult = 'success';
			testedOrigin = csrfOriginInput ?? null;
		} else if (result.type === 'failure') {
			testResult = 'failure';
			testError = result.data.testError ?? 'Test failed';
		} else {
			testResult = 'failure';
			testError = 'Unexpected response';
		}
	} catch {
		testResult = 'failure';
		testError = 'Network error while testing the origin.';
	}
}

let iconRef: HTMLElement | undefined = $state();
let contentRef: HTMLElement | undefined = $state();
let animatedElements = new WeakSet<Element>();

$effect(() => {
	if (!iconRef) return;
	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads that TypeScript cannot infer correctly
	const animation = (animate as any)(
		iconRef,
		{
			opacity: [0, 1],
			transform: ['scale(0.8)', 'scale(1)']
		},
		{ duration: 0.5, easing: [0.22, 1, 0.36, 1] }
	);
	return () => animation.stop?.();
});

$effect(() => {
	if (!contentRef) return;

	const rafId = requestAnimationFrame(() => {
		if (!contentRef) return;
		const items = contentRef.querySelectorAll('.animate-item');
		const newItems = Array.from(items).filter((item) => !animatedElements.has(item));

		if (newItems.length === 0) return;

		newItems.forEach((item) => animatedElements.add(item));

		// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads that TypeScript cannot infer correctly
		(animate as any)(
			newItems,
			{ opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] },
			{ duration: 0.4, delay: stagger(0.08), easing: [0.22, 1, 0.36, 1] }
		);
	});

	return () => cancelAnimationFrame(rafId);
});

function useDetectedOrigin() {
	csrfOriginInput = data.detection.detectedOrigin;
}
</script>

<OnboardingCard title="Security Settings" subtitle="Set the origin URL that CSRF checks accept">
	<div class="csrf-content" bind:this={contentRef}>
		<div class="icon-container" bind:this={iconRef}>
			<div class="icon-wrapper">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
		</div>

		<div class="detection-card animate-item">
			<div class="detection-header">
				<svg
					aria-hidden="true"
					class="detection-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 16v-4" stroke-linecap="round" />
					<path d="M12 8h.01" stroke-linecap="round" />
				</svg>
				<span class="detection-title">Connection Details</span>
			</div>
			<div class="detection-content">
				<div class="detection-row">
					<span class="detection-label">Access Type</span>
					<span class="detection-value {data.detection.isReverseProxy ? 'proxy' : 'direct'}">
						{#if data.detection.isReverseProxy}
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M3 12h4m10 0h4" stroke-linecap="round" />
								<rect
									x="8"
									y="8"
									width="8"
									height="8"
									rx="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Reverse Proxy
						{:else}
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<rect
									x="2"
									y="3"
									width="20"
									height="14"
									rx="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<line x1="8" y1="21" x2="16" y2="21" stroke-linecap="round" />
								<line x1="12" y1="17" x2="12" y2="21" stroke-linecap="round" />
							</svg>
							Direct Access
						{/if}
					</span>
				</div>
				<div class="detection-row">
					<span class="detection-label">Detected Origin</span>
					<span class="detection-value origin">{data.detection.detectedOrigin}</span>
				</div>
			</div>
		</div>

		{#if data.csrfConfig.isLocked}
			<div class="preconfigured-card animate-item">
				<div class="preconfigured-icon">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<div class="preconfigured-info">
					<div class="preconfigured-header">
						<span class="preconfigured-title">CSRF Origin</span>
						<span class="preconfigured-badge">
							<svg
								aria-hidden="true"
								class="lock-icon"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
								<path d="M7 11V7a5 5 0 0110 0v4" />
							</svg>
							ENV
						</span>
					</div>
					<span class="preconfigured-url">{data.csrfConfig.value}</span>
				</div>
				<div class="preconfigured-check">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
					>
						<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
			</div>

			<p class="info-text animate-item">
				The <code>ORIGIN</code> environment variable sets CSRF protection, so you cannot change it
				here.
			</p>

			<div class="locked-docs animate-item">
				<a
					href="https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html"
					target="_blank"
					rel="noopener noreferrer"
				>
					<span>Learn about CSRF protection</span>
					<ExternalLink class="link-icon" />
				</a>
			</div>
		{:else}
			<div class="input-section animate-item">
				<label for="csrfOrigin" class="input-label">CSRF Origin URL</label>
				<div class="input-wrapper">
					<input
						type="url"
						id="csrfOrigin"
						name="csrfOrigin"
						bind:value={csrfOriginInput}
						placeholder="https://your-domain.com"
						class="origin-input"
						class:error={form?.error}
					>
					{#if csrfOriginInput !== data.detection.detectedOrigin}
						<Button type="button" class="use-detected-btn tap-target" onclick={useDetectedOrigin}>
							Detect URL
						</Button>
					{/if}
					<Button
						type="button"
						onclick={runTest}
						disabled={testResult === 'testing' || !csrfOriginInput}
						aria-busy={testResult === 'testing'}
						class={`test-btn tap-target ${testResult === 'success' ? 'success' : ''}`}
					>
						{#if testResult === 'testing'}
							<LoaderCircleIcon class="size-3.5 animate-spin" aria-hidden="true" />
							Testing...
						{:else if testResult === 'success'}
							<CheckIcon class="size-3.5" strokeWidth={2.5} />
							Verified
						{:else}
							Test URL
						{/if}
					</Button>
				</div>
				{#if form?.error}
					<span class="error-message">{form.error}</span>
				{/if}
				{#if testResult === 'failure' && testError}
					<div class="test-result error">
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="12" cy="12" r="10" />
							<line x1="15" y1="9" x2="9" y2="15" stroke-linecap="round" />
							<line x1="9" y1="9" x2="15" y2="15" stroke-linecap="round" />
						</svg>
						<span>{testError}</span>
					</div>
				{:else if testResult === 'success'}
					<div class="test-result success">
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
						<span>Origin verified. CSRF checks will accept this URL.</span>
					</div>
				{/if}
				<p class="input-hint">
					Enter the public URL where users reach Obzorarr. Obzorarr rejects form posts that come
					from any other origin.
				</p>
			</div>

			<div class="info-callout animate-item">
				<svg
					aria-hidden="true"
					class="callout-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<div class="callout-content">
					<span class="callout-title">What CSRF protection does</span>
					<span class="callout-text">
						{#if data.detection.isReverseProxy}
							You are connecting through a reverse proxy. Set the origin to the URL your users see
							so Obzorarr checks form posts against that URL.
						{:else}
							Obzorarr checks that form posts come from your own domain. Set this now if you plan to
							add a reverse proxy later.
						{/if}
					</span>
					<div class="callout-links">
						<a
							href="https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html"
							target="_blank"
							rel="noopener noreferrer"
							class="edu-link"
						>
							<span>Learn about CSRF</span>
							<ExternalLink class="link-icon" />
						</a>
						{#if data.detection.isReverseProxy}
							<span class="links-divider"></span>
							<span class="proxy-docs-label">Proxy docs</span>
							<div class="proxy-links">
								<a
									href="https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/"
									target="_blank"
									rel="noopener noreferrer"
								>
									Nginx<ExternalLink class="link-icon-sm" />
								</a>
								<span class="dot-sep">·</span>
								<a
									href="https://nginxproxymanager.com/advanced-config/"
									target="_blank"
									rel="noopener noreferrer"
								>
									NPM<ExternalLink class="link-icon-sm" />
								</a>
								<span class="dot-sep">·</span>
								<a
									href="https://httpd.apache.org/docs/2.4/howto/reverse_proxy.html"
									target="_blank"
									rel="noopener noreferrer"
								>
									Apache<ExternalLink class="link-icon-sm" />
								</a>
								<span class="dot-sep">·</span>
								<a
									href="https://caddyserver.com/docs/caddyfile/directives/reverse_proxy"
									target="_blank"
									rel="noopener noreferrer"
								>
									Caddy<ExternalLink class="link-icon-sm" />
								</a>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="button-group">
			<form method="POST" action="?/skipCsrf" class="skip-form">
				<SubmitButton class="skip-btn tap-target" formnovalidate>
					{#snippet children()}
						{data.csrfConfig.isLocked ? 'Continue' : 'Skip'}
					{/snippet}
				</SubmitButton>
			</form>
			{#if !data.csrfConfig.isLocked}
				<form method="POST" action="?/saveOrigin" class="save-form">
					<input type="hidden" name="csrfOrigin" value={csrfOriginInput ?? ''}>
					<SubmitButton
						class="save-btn tap-target"
						disabled={!csrfOriginInput || testResult !== 'success'}
					>
						{#snippet children()}
							Save & Continue
						{/snippet}
					</SubmitButton>
				</form>
			{/if}
		</div>
	{/snippet}
</OnboardingCard>

<style>
.csrf-content {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	width: 100%;
}

.icon-container {
	display: flex;
	justify-content: center;
	margin-bottom: 0.5rem;
}

.icon-wrapper {
	width: 72px;
	height: 72px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
	border-radius: 18px;
	color: oklch(0.6261 0.1859 259.6);
}

.icon-wrapper svg {
	width: 40px;
	height: 40px;
}

.detection-card {
	background: rgba(255, 255, 255, 0.03);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 12px;
	padding: 1rem 1.25rem;
}

.detection-header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-bottom: 0.875rem;
	padding-bottom: 0.75rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.detection-icon {
	width: 18px;
	height: 18px;
	color: rgba(255, 255, 255, 0.5);
}

.detection-title {
	font-size: 0.8rem;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.6);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.detection-content {
	display: flex;
	flex-direction: column;
	gap: 0.625rem;
}

.detection-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 1rem;
}

.detection-label {
	font-size: 0.875rem;
	color: rgba(255, 255, 255, 0.5);
}

.detection-value {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.875rem;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
}

.detection-value svg {
	width: 14px;
	height: 14px;
}

.detection-value.proxy {
	color: oklch(0.6684 0.1625 259.49);
}

.detection-value.direct {
	color: oklch(0.7946 0.1951 150.81);
}

.detection-value.origin {
	font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.7);
}

.preconfigured-card {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1.125rem 1.25rem;
	background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%);
	border: 1px solid rgba(34, 197, 94, 0.2);
	border-radius: 12px;
	width: fit-content;
	max-width: 100%;
	margin: 0 auto;
	position: relative;
	overflow: hidden;
}

.preconfigured-card::before {
	content: "";
	position: absolute;
	inset: 0;
	background: radial-gradient(ellipse at top left, rgba(34, 197, 94, 0.1) 0%, transparent 50%);
	pointer-events: none;
}

.preconfigured-icon {
	flex-shrink: 0;
	width: 44px;
	height: 44px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(34, 197, 94, 0.12);
	border-radius: 11px;
	color: oklch(0.7946 0.1951 150.81);
	position: relative;
}

.preconfigured-icon svg {
	width: 24px;
	height: 24px;
}

.preconfigured-info {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	min-width: 0;
}

.preconfigured-header {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	flex-wrap: wrap;
}

.preconfigured-title {
	font-size: 0.95rem;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.95);
}

.preconfigured-badge {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.2rem 0.5rem;
	font-size: 0.65rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	background: rgba(34, 197, 94, 0.15);
	color: oklch(0.8116 0.1789 152.1);
	border-radius: 5px;
	border: 1px solid rgba(34, 197, 94, 0.3);
}

.preconfigured-badge .lock-icon {
	width: 10px;
	height: 10px;
}

.preconfigured-url {
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.45);
	font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
	letter-spacing: -0.01em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.preconfigured-check {
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(34, 197, 94, 0.15);
	border-radius: 50%;
	color: oklch(0.7946 0.1951 150.81);
}

.preconfigured-check svg {
	width: 15px;
	height: 15px;
}

.info-text {
	font-size: 0.875rem;
	color: rgba(255, 255, 255, 0.5);
	line-height: 1.5;
	text-align: center;
}

.info-text code {
	font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
	font-size: 0.8rem;
	background: rgba(255, 255, 255, 0.08);
	padding: 0.125rem 0.375rem;
	border-radius: 4px;
	color: rgba(255, 255, 255, 0.7);
}

.input-section {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.input-label {
	font-size: 0.875rem;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.8);
}

.input-wrapper {
	position: relative;
	display: flex;
	gap: 0.5rem;
}

.origin-input {
	flex: 1;
	padding: 0.75rem 1rem;
	background: rgba(255, 255, 255, 0.05);
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 8px;
	font-size: 0.9rem;
	color: rgba(255, 255, 255, 0.95);
	font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
	transition:
		border-color 0.2s,
		background 0.2s;
}

.origin-input::placeholder {
	color: rgba(255, 255, 255, 0.3);
}

.origin-input:focus {
	outline: none;
	border-color: rgba(59, 130, 246, 0.5);
	background: rgba(255, 255, 255, 0.07);
}

.origin-input.error {
	border-color: rgba(239, 68, 68, 0.5);
}

:global(.use-detected-btn) {
	flex-shrink: 0;
	padding: 0.5rem 0.75rem;
	background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.08) 100%);
	border: 1px solid rgba(59, 130, 246, 0.25);
	border-radius: 6px;
	font-size: 0.75rem;
	font-weight: 500;
	color: oklch(0.6684 0.1625 259.49);
	cursor: pointer;
	box-shadow:
		0 1px 2px rgba(0, 0, 0, 0.1),
		inset 0 1px 0 rgba(255, 255, 255, 0.05);
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

:global(.use-detected-btn:hover) {
	background: linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(59, 130, 246, 0.12) 100%);
	border-color: rgba(59, 130, 246, 0.4);
	box-shadow:
		0 4px 12px rgba(59, 130, 246, 0.15),
		inset 0 1px 0 rgba(255, 255, 255, 0.08);
	transform: translateY(-1px);
}

:global(.use-detected-btn:active) {
	transform: translateY(0) scale(0.98);
}

:global(.use-detected-btn:focus-visible) {
	outline: 2px solid oklch(0.6684 0.1625 259.49);
	outline-offset: 2px;
}

:global(.test-btn) {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem 2rem;
	background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.08) 100%);
	border: 1px solid rgba(34, 197, 94, 0.25);
	border-radius: 6px;
	font-size: 0.75rem;
	font-weight: 500;
	color: oklch(0.7946 0.1951 150.81);
	cursor: pointer;
	box-shadow:
		0 1px 2px rgba(0, 0, 0, 0.1),
		inset 0 1px 0 rgba(255, 255, 255, 0.05);
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

:global(.test-btn:hover:not(:disabled):not(.success)) {
	background: linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(34, 197, 94, 0.12) 100%);
	border-color: rgba(34, 197, 94, 0.4);
	box-shadow:
		0 4px 12px rgba(34, 197, 94, 0.15),
		inset 0 1px 0 rgba(255, 255, 255, 0.08);
	transform: translateY(-1px);
}

:global(.test-btn:active:not(:disabled):not(.success)) {
	transform: translateY(0) scale(0.98);
}

:global(.test-btn:focus-visible) {
	outline: 2px solid oklch(0.7946 0.1951 150.81);
	outline-offset: 2px;
}

:global(.test-btn:disabled) {
	opacity: 0.4;
	cursor: not-allowed;
	filter: grayscale(0.3);
}

:global(.test-btn.success) {
	background: linear-gradient(135deg, rgba(34, 197, 94, 0.25) 0%, rgba(34, 197, 94, 0.15) 100%);
	border-color: rgba(34, 197, 94, 0.5);
	box-shadow:
		0 0 0 1px rgba(34, 197, 94, 0.1),
		0 4px 16px rgba(34, 197, 94, 0.2),
		inset 0 1px 0 rgba(255, 255, 255, 0.1);
	cursor: default;
}

:global(.test-btn.success svg) {
	animation: checkmark-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes checkmark-pop {
	0% {
		opacity: 0;
		transform: scale(0.5);
	}
	100% {
		opacity: 1;
		transform: scale(1);
	}
}

.test-result {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	border-radius: 8px;
	font-size: 0.85rem;
	line-height: 1.4;
}

.test-result svg {
	flex-shrink: 0;
	width: 18px;
	height: 18px;
	margin-top: 0.1rem;
}

.test-result.success {
	background: rgba(34, 197, 94, 0.1);
	border: 1px solid rgba(34, 197, 94, 0.2);
	color: oklch(0.7946 0.1951 150.81);
}

.test-result.error {
	background: rgba(239, 68, 68, 0.1);
	border: 1px solid rgba(239, 68, 68, 0.2);
	color: oklch(0.6356 0.2082 25.38);
}

.error-message {
	font-size: 0.8rem;
	color: oklch(0.6356 0.2082 25.38);
}

.input-hint {
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.45);
	line-height: 1.5;
}

.info-callout {
	display: flex;
	gap: 0.875rem;
	padding: 1rem 1.125rem;
	background: rgba(59, 130, 246, 0.06);
	border: 1px solid rgba(59, 130, 246, 0.15);
	border-radius: 10px;
}

.callout-icon {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	color: oklch(0.6261 0.1859 259.6);
	margin-top: 0.125rem;
}

.callout-content {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.callout-title {
	font-size: 0.85rem;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.9);
}

.callout-text {
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.55);
	line-height: 1.5;
}

.callout-links {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.625rem;
	margin-top: 0.875rem;
	padding-top: 0.875rem;
	border-top: 1px solid rgba(59, 130, 246, 0.12);
}

.edu-link {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.375rem 0.625rem;
	background: rgba(59, 130, 246, 0.08);
	border: 1px solid rgba(59, 130, 246, 0.18);
	border-radius: 6px;
	color: oklch(0.695 0.1481 259.5);
	text-decoration: none;
	font-size: 0.75rem;
	font-weight: 500;
	transition: all 0.2s ease;
}

.edu-link:hover {
	background: rgba(59, 130, 246, 0.14);
	border-color: rgba(59, 130, 246, 0.28);
	transform: translateY(-1px);
}

.edu-link:focus-visible {
	outline: 2px solid oklch(0.6684 0.1625 259.49);
	outline-offset: 2px;
}

.callout-links :global(.link-icon) {
	width: 12px;
	height: 12px;
	opacity: 0.75;
}

.links-divider {
	display: block;
	width: 100%;
	height: 1px;
	background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
	margin: 0.25rem 0;
}

.proxy-docs-label {
	font-size: 0.65rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: rgba(255, 255, 255, 0.4);
}

.proxy-links {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.375rem;
}

.proxy-links a {
	display: inline-flex;
	align-items: center;
	gap: 0.2rem;
	color: oklch(0.6703 0.1523 259.49);
	text-decoration: none;
	font-size: 0.7rem;
	font-weight: 500;
	padding: 0.25rem 0.375rem;
	border-radius: 4px;
	transition: all 0.15s ease;
}

.proxy-links a:hover {
	background: rgba(59, 130, 246, 0.1);
	color: oklch(0.7313 0.1288 259.57);
}

.proxy-links a:focus-visible {
	outline: 2px solid oklch(0.6684 0.1625 259.49);
	outline-offset: 1px;
}

.callout-links :global(.link-icon-sm) {
	width: 10px;
	height: 10px;
	opacity: 0.6;
}

.dot-sep {
	color: rgba(255, 255, 255, 0.2);
	font-size: 0.65rem;
	user-select: none;
}

.locked-docs {
	display: flex;
	justify-content: center;
}

.locked-docs a {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem 0.875rem;
	background: rgba(59, 130, 246, 0.06);
	border: 1px solid rgba(59, 130, 246, 0.15);
	border-radius: 8px;
	color: oklch(0.695 0.1481 259.5);
	text-decoration: none;
	font-size: 0.8rem;
	font-weight: 500;
	transition: all 0.2s ease;
}

.locked-docs a:hover {
	background: rgba(59, 130, 246, 0.12);
	border-color: rgba(59, 130, 246, 0.25);
	transform: translateY(-1px);
}

.locked-docs a:focus-visible {
	outline: 2px solid oklch(0.6684 0.1625 259.49);
	outline-offset: 2px;
}

.locked-docs :global(.link-icon) {
	width: 13px;
	height: 13px;
	opacity: 0.7;
}

.button-group {
	display: flex;
	gap: 0.75rem;
	width: 100%;
}

.skip-form,
.save-form {
	display: flex;
	margin: 0;
	min-width: 0;
}

.skip-form {
	flex: 1;
}

.save-form {
	flex: 2;
}

:global(.skip-btn) {
	width: 100%;
	padding: 0.875rem 1.5rem;
	background: rgba(255, 255, 255, 0.06);
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 10px;
	font-size: 0.9rem;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.7);
	cursor: pointer;
	transition:
		background 0.2s,
		border-color 0.2s;
}

:global(.skip-btn:hover:not(:disabled)) {
	background: rgba(255, 255, 255, 0.1);
	border-color: rgba(255, 255, 255, 0.2);
}

:global(.skip-btn:disabled) {
	opacity: 0.5;
	cursor: not-allowed;
}

:global(.save-btn) {
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.875rem 1.5rem;
	background: linear-gradient(
		135deg,
		oklch(0.5869 0.2079 260) 0%,
		oklch(0.5516 0.2278 260.85) 100%
	);
	border: none;
	border-radius: 10px;
	font-size: 0.9rem;
	font-weight: 600;
	color: white;
	cursor: pointer;
	transition:
		opacity 0.2s,
		transform 0.2s;
}

:global(.save-btn:hover:not(:disabled)) {
	opacity: 0.9;
	transform: translateY(-1px);
}

:global(.save-btn:disabled) {
	opacity: 0.5;
	cursor: not-allowed;
	transform: none;
}

@media (max-width: 480px) {
	.detection-row {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
	}

	.preconfigured-card {
		padding: 1rem;
		gap: 0.875rem;
	}

	.preconfigured-icon {
		width: 38px;
		height: 38px;
	}

	.preconfigured-icon svg {
		width: 20px;
		height: 20px;
	}

	.preconfigured-title {
		font-size: 0.875rem;
	}

	.preconfigured-url {
		font-size: 0.75rem;
	}

	.button-group {
		flex-direction: column;
	}

	.skip-form,
	.save-form {
		flex: none;
	}

	:global(.skip-btn),
	:global(.save-btn) {
		flex: none;
	}

	.input-wrapper {
		flex-direction: column;
	}

	:global(.use-detected-btn) {
		width: 100%;
		padding: 0.625rem;
	}

	.callout-links {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.links-divider {
		display: none;
	}

	.proxy-docs-label {
		margin-top: 0.25rem;
	}

	.proxy-links {
		gap: 0.5rem;
	}

	.locked-docs a {
		width: 100%;
		justify-content: center;
	}
}
</style>
