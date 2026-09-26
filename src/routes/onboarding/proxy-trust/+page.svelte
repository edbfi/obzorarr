<script lang="ts">
import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
import CheckIcon from '@lucide/svelte/icons/check';
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
import { prefersReducedMotion } from 'svelte/motion';
import { fade } from 'svelte/transition';
import browserAddressUnavailableDiagram from '$lib/assets/onboarding/proxy-trust/browser-address-unavailable.png';
import checkingDiagram from '$lib/assets/onboarding/proxy-trust/checking.png';
import correctWithoutTrustDiagram from '$lib/assets/onboarding/proxy-trust/correct-without-trust.png';
import diagnosticFailedDiagram from '$lib/assets/onboarding/proxy-trust/diagnostic-failed.png';
import environmentDisabledBrokenDiagram from '$lib/assets/onboarding/proxy-trust/environment-disabled-broken.png';
import environmentDisabledCorrectDiagram from '$lib/assets/onboarding/proxy-trust/environment-disabled-correct.png';
import environmentDisabledNeededDiagram from '$lib/assets/onboarding/proxy-trust/environment-disabled-needed.png';
import environmentEnabledBrokenDiagram from '$lib/assets/onboarding/proxy-trust/environment-enabled-broken.png';
import environmentEnabledWorkingDiagram from '$lib/assets/onboarding/proxy-trust/environment-enabled-working.png';
import forwardedAddressConflictDiagram from '$lib/assets/onboarding/proxy-trust/forwarded-address-conflict.png';
import forwardedMatchBoundaryUnverifiedDiagram from '$lib/assets/onboarding/proxy-trust/forwarded-match-boundary-unverified.png';
import headersMissingDiagram from '$lib/assets/onboarding/proxy-trust/headers-missing.png';
import hostInvalidDiagram from '$lib/assets/onboarding/proxy-trust/host-invalid.png';
import hostMissingDiagram from '$lib/assets/onboarding/proxy-trust/host-missing.png';
import hostUnsafeDiagram from '$lib/assets/onboarding/proxy-trust/host-unsafe.png';
import protocolInvalidDiagram from '$lib/assets/onboarding/proxy-trust/protocol-invalid.png';
import protocolMissingDiagram from '$lib/assets/onboarding/proxy-trust/protocol-missing.png';
import trustEnabledBrokenDiagram from '$lib/assets/onboarding/proxy-trust/trust-enabled-broken.png';
import trustWorkingDiagram from '$lib/assets/onboarding/proxy-trust/trust-working.png';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import { Button } from '$lib/components/ui/button';
import {
	diagramForReverseProxyDiagnostic,
	documentationForGuide,
	presentReverseProxyDiagnostic,
	REVERSE_PROXY_COPY,
	REVERSE_PROXY_PROVIDER_GUIDES,
	type ReverseProxyDiagramId
} from '$lib/copy/reverse-proxy';
import type { ReverseProxyDiagnostic } from '$lib/security/reverse-proxy';
import { submitAction } from '$lib/utils/submit-action';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();
let browserOrigin = $state('');
let diagnostic = $state<ReverseProxyDiagnostic | null>(null);
let diagnosticStatus = $state<'idle' | 'checking' | 'success' | 'failure'>('idle');
let diagnosticError = $state<string | null>(null);
let savedState = $state<'idle' | 'verifying' | 'unverified'>('idle');
let showDetails = $state(false);
let copiedGuide = $state<string | null>(null);
let runToken = 0;
let initialRun = false;
let handledTrustProxySuccess = false;
let failedDiagramSource: string | null = $state(null);

const DIAGNOSTIC_DIAGRAMS: Record<ReverseProxyDiagramId, string> = {
	'browser-address-unavailable': browserAddressUnavailableDiagram,
	'correct-without-trust': correctWithoutTrustDiagram,
	'environment-disabled-broken': environmentDisabledBrokenDiagram,
	'environment-disabled-correct': environmentDisabledCorrectDiagram,
	'environment-disabled-needed': environmentDisabledNeededDiagram,
	'environment-enabled-broken': environmentEnabledBrokenDiagram,
	'environment-enabled-working': environmentEnabledWorkingDiagram,
	'forwarded-address-conflict': forwardedAddressConflictDiagram,
	'forwarded-match-boundary-unverified': forwardedMatchBoundaryUnverifiedDiagram,
	'headers-missing': headersMissingDiagram,
	'host-invalid': hostInvalidDiagram,
	'host-missing': hostMissingDiagram,
	'host-unsafe': hostUnsafeDiagram,
	'protocol-invalid': protocolInvalidDiagram,
	'protocol-missing': protocolMissingDiagram,
	'trust-enabled-broken': trustEnabledBrokenDiagram,
	'trust-working': trustWorkingDiagram
};

const presentation = $derived(diagnostic ? presentReverseProxyDiagnostic(diagnostic) : null);
const diagramSource = $derived(
	diagnosticStatus === 'failure'
		? diagnosticFailedDiagram
		: diagnosticStatus === 'success' && diagnostic
			? DIAGNOSTIC_DIAGRAMS[diagramForReverseProxyDiagnostic(diagnostic)]
			: checkingDiagram
);
const diagramTransitionDuration = $derived(prefersReducedMotion.current ? 0 : 180);
const applicableProviderGuides = $derived(
	presentation && presentation.documentationIds.length > 1
		? REVERSE_PROXY_PROVIDER_GUIDES.filter((guide) =>
				presentation.documentationIds.includes(guide.documentationId)
			)
		: []
);
const canEnable = $derived(
	diagnosticStatus === 'success' &&
		diagnostic?.action === 'confirm-trust-boundary' &&
		!diagnostic.facts.trustProxy.isLocked &&
		savedState === 'idle'
);
const continueWarning = $derived(
	savedState === 'unverified' ||
		(diagnostic && ['review-proxy', 'unable-to-determine'].includes(diagnostic.action))
		? REVERSE_PROXY_COPY.continueWarning
		: null
);

async function runDiagnostic(afterSave = false) {
	if (diagnosticStatus === 'checking') return;
	failedDiagramSource = null;
	const token = ++runToken;
	browserOrigin = window.location.origin;
	diagnostic = null;
	diagnosticStatus = 'checking';
	diagnosticError = null;
	const formData = new FormData();
	formData.set('browserOrigin', browserOrigin);
	try {
		const result = await submitAction<{
			reverseProxyDiagnostic?: ReverseProxyDiagnostic;
			diagnosticError?: string;
		}>('?/diagnoseReverseProxy', formData);
		if (token !== runToken) return;
		if (result.type === 'success' && result.data.reverseProxyDiagnostic) {
			diagnostic = result.data.reverseProxyDiagnostic;
			diagnosticStatus = 'success';
			savedState = 'idle';
			return;
		}
		diagnosticStatus = 'failure';
		diagnosticError =
			result.type === 'failure'
				? (result.data.diagnosticError ?? 'Diagnostic failed')
				: 'Diagnostic response was incomplete';
		if (afterSave) savedState = 'unverified';
	} catch {
		if (token !== runToken) return;
		diagnosticStatus = 'failure';
		diagnosticError = 'Network error while running the diagnostic.';
		if (afterSave) savedState = 'unverified';
	}
}

function applyActionData() {
	if (form?.reverseProxyDiagnostic) {
		diagnostic = form.reverseProxyDiagnostic as ReverseProxyDiagnostic;
		diagnosticStatus = 'success';
		diagnosticError = null;
	}
	if (form?.diagnosticError) {
		diagnostic = null;
		diagnosticStatus = 'failure';
		diagnosticError = form.diagnosticError;
	}
	if (form?.trustProxySuccess && !handledTrustProxySuccess) {
		handledTrustProxySuccess = true;
		diagnostic = null;
		savedState = 'verifying';
		void runDiagnostic(true);
	} else if (!form?.trustProxySuccess) {
		handledTrustProxySuccess = false;
	}
}

$effect(() => {
	applyActionData();
	if (initialRun) return;
	initialRun = true;
	void runDiagnostic();
});

async function copyGuide(id: string, text: string) {
	try {
		await navigator.clipboard.writeText(text);
		copiedGuide = id;
	} catch {
		copiedGuide = `error:${id}`;
	}
}
</script>

<OnboardingCard
	title={REVERSE_PROXY_COPY.panelTitle}
	subtitle={REVERSE_PROXY_COPY.panelSubtitle}
	class="proxy-onboarding"
>
	<div class="proxy-content">
		{#if form?.trustProxyError}
			<div class="inline-error" role="alert">{form.trustProxyError}</div>
		{/if}
		<div class="diagram-frame" aria-hidden="true">
			{#if failedDiagramSource !== diagramSource}
				{#key diagramSource}
					<img
						src={diagramSource}
						alt=""
						draggable="false"
						onerror={(event) => (failedDiagramSource = event.currentTarget.getAttribute('src'))}
						transition:fade={{ duration: diagramTransitionDuration }}
					>
				{/key}
			{/if}
		</div>
		{#if diagnosticStatus === 'checking'}
			<div class="status-card neutral" role="status" aria-live="polite" aria-busy="true">
				<LoaderCircleIcon class="size-5 animate-spin" aria-hidden="true" />
				<span
					>{savedState === 'verifying'
	? REVERSE_PROXY_COPY.savedVerifying
	: REVERSE_PROXY_COPY.rerunButtonInProgress}</span
				>
			</div>
		{:else if diagnosticStatus === 'failure'}
			<div class="status-card danger" role="alert">
				<span aria-hidden="true">!</span>
				<div>
					<strong>{REVERSE_PROXY_COPY.diagnosticFailedHeadline}</strong>
					<p>
						{savedState === 'unverified' ? REVERSE_PROXY_COPY.savedUnverified : diagnosticError}
					</p>
					<p>{REVERSE_PROXY_COPY.diagnosticFailedExplanation}</p>
					<Button
						type="button"
						class="tap-target"
						onclick={() => runDiagnostic(savedState === 'unverified')}
						>{REVERSE_PROXY_COPY.rerunButton}</Button
					>
				</div>
			</div>
		{:else if presentation && diagnostic}
			<div class="status-card {presentation.tone}" role="status" aria-live="polite">
				{#if presentation.tone === 'success'}
					<CheckIcon class="size-5" aria-hidden="true" />
				{:else}
					<span aria-hidden="true">!</span>
				{/if}
				<div>
					<strong>{presentation.headline}</strong>
					<p>{presentation.diagnosis}</p>
					<p><strong>{presentation.nextAction}</strong></p>
				</div>
			</div>

			{#if canEnable}
				<form method="POST" action="?/enableTrustProxy" class="enable-form">
					<input type="hidden" name="browserOrigin" value={browserOrigin}>
					<label
						><input type="checkbox" name="confirmRisk" value="true" required>
						{presentation.safetyNotice}</label
					>
					<SubmitButton class="tap-target"><span>Enable TRUST_PROXY</span></SubmitButton>
				</form>
			{/if}

			<button
				type="button"
				class="details-toggle tap-target"
				onclick={() => (showDetails = !showDetails)}
				aria-expanded={showDetails}
				aria-controls="proxy-technical-details"
			>
				{REVERSE_PROXY_COPY.detailsButton} <ChevronDownIcon class="size-4" aria-hidden="true" />
			</button>
			{#if showDetails}
				<div id="proxy-technical-details" class="details-panel">
					<dl>
						<div>
							<dt>Browser origin</dt>
							<dd>{diagnostic.facts.browserOrigin.origin ?? 'not available'}</dd>
						</div>
						<div>
							<dt>Effective app origin</dt>
							<dd>{diagnostic.facts.origins.effectiveApp ?? 'not available'}</dd>
						</div>
						<div>
							<dt>Forwarded origin</dt>
							<dd>{diagnostic.facts.origins.forwardedPair ?? 'not available'}</dd>
						</div>
						<div>
							<dt>Forwarded headers present</dt>
							<dd>{diagnostic.facts.forwardedHeaders.present.join(', ') || 'none'}</dd>
						</div>
						<div>
							<dt>Forwarded pair</dt>
							<dd>{presentation.pairLabel}</dd>
						</div>
						<div>
							<dt>TRUST_PROXY source</dt>
							<dd>
								{diagnostic.facts.trustProxy.source}{diagnostic.facts.trustProxy.isLocked ? ' (environment-controlled)' : ''}
							</dd>
						</div>
					</dl>
					<p>{presentation.consequence}</p>
					<p class="safety">{presentation.safetyNotice}</p>
					{#if applicableProviderGuides.length > 0}
						<div class="provider-guides">
							<h3>Repair steps by proxy</h3>
							{#each applicableProviderGuides as guide}
								<details class="provider-guide">
									<summary>{guide.label}</summary>
									<div class="provider-guide-content">
										<ol>
											{#each guide.steps as step}
												<li>{step}</li>
											{/each}
										</ol>
										{#if guide.config}
											<pre><code>{guide.config}</code></pre>
											<Button
												type="button"
												variant="outline"
												class="tap-target"
												onclick={() => copyGuide(guide.id, guide.config ?? '')}
											>
												Copy configuration
											</Button>
											<span class="copy-status" role="status" aria-live="polite">
												{copiedGuide === guide.id
	? `${guide.label} configuration copied`
	: copiedGuide === `error:${guide.id}`
		? `Could not copy the ${guide.label} configuration`
		: ''}
											</span>
										{/if}
										<a href={documentationForGuide(guide).url} target="_blank" rel="noreferrer">
											{guide.id === 'other'
	? 'Open Obzorarr configuration guidance'
	: `Open official ${guide.label} documentation`}
										</a>
									</div>
								</details>
							{/each}
						</div>
					{/if}
					<Button type="button" variant="outline" class="tap-target" onclick={() => runDiagnostic()}
						>{REVERSE_PROXY_COPY.rerunButton}</Button
					>
				</div>
			{/if}
		{/if}
	</div>
	{#snippet footer()}
		<form method="POST" action="?/goBack" class="mr-auto">
			<Button type="submit" variant="outline" class="tap-target"
				><ArrowLeftIcon class="size-[18px]" aria-hidden="true" />Previous</Button
			>
		</form>
		<div class="continue-area">
			{#if continueWarning}
				<p role="status">{continueWarning}</p>
			{/if}
			<form method="POST" action="?/continue">
				<SubmitButton class="tap-target"><span>Continue</span></SubmitButton>
			</form>
		</div>
	{/snippet}
</OnboardingCard>

<style>
.proxy-content,
.details-panel,
.continue-area {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	min-width: 0;
}
:global(.proxy-onboarding.proxy-onboarding) {
	max-width: 760px;
}
.diagram-frame {
	position: relative;
	display: grid;
	place-items: center;
	aspect-ratio: 2069 / 760;
	min-width: 0;
	overflow: hidden;
	border: 1px solid rgba(96, 165, 250, 0.18);
	border-radius: 0.875rem;
	background:
		radial-gradient(circle at 50% 45%, rgba(59, 130, 246, 0.1), transparent 68%),
		rgba(0, 0, 0, 0.12);
}
.diagram-frame img {
	grid-area: 1 / 1;
	width: 100%;
	height: 100%;
	object-fit: contain;
	user-select: none;
}
.status-card {
	display: flex;
	gap: 0.75rem;
	padding: 1rem;
	border: 1px solid rgba(255, 255, 255, 0.16);
	border-radius: 0.75rem;
	overflow-wrap: anywhere;
}
.status-card p {
	margin: 0.35rem 0 0;
}
.status-card :global(.tap-target) {
	margin-top: 0.75rem;
}
.status-card.success {
	border-color: rgba(34, 197, 94, 0.55);
}
.status-card.warning {
	border-color: rgba(245, 158, 11, 0.7);
}
.status-card.danger {
	border-color: rgba(239, 68, 68, 0.7);
}
.enable-form,
.details-panel {
	padding: 1rem;
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 0.75rem;
}
.enable-form {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}
.details-toggle {
	align-self: flex-start;
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
}
dl {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
	margin: 0;
}
dt {
	font-weight: 700;
}
dd {
	margin: 0.2rem 0 0;
	overflow-wrap: anywhere;
}
pre {
	overflow-x: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.provider-guides {
	display: grid;
	gap: 0.75rem;
}
.provider-guides h3 {
	margin: 0;
	font-size: 1rem;
}
.provider-guide {
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 0.625rem;
}
.provider-guide summary {
	cursor: pointer;
	padding: 0.75rem;
	font-weight: 700;
}
.provider-guide-content {
	display: grid;
	gap: 0.75rem;
	padding: 0 0.75rem 0.75rem;
}
.provider-guide-content ol {
	margin: 0;
	padding-left: 1.25rem;
}
.copy-status {
	min-height: 1.25rem;
	font-size: 0.875rem;
}
.safety,
.inline-error {
	padding: 0.75rem;
	border-left: 3px solid currentColor;
	overflow-wrap: anywhere;
}
.continue-area p {
	margin: 0;
	max-width: 32rem;
	overflow-wrap: anywhere;
}
@media (max-width: 480px) {
	.diagram-frame {
		width: calc(100% + 1.5rem);
		margin-inline: -0.75rem;
	}
	dl {
		grid-template-columns: 1fr;
	}
}
</style>
