<script lang="ts">
import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import GlobeIcon from '@lucide/svelte/icons/globe';
import InfoIcon from '@lucide/svelte/icons/info';
import ScaleIcon from '@lucide/svelte/icons/scale';
import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import UsersRoundIcon from '@lucide/svelte/icons/users-round';
import VenetianMaskIcon from '@lucide/svelte/icons/venetian-mask';
import { animate } from 'motion';
import type { Component } from 'svelte';
import { tick, untrack } from 'svelte';
import { enhance } from '$app/forms';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import {
	CUSTOM_PRIVACY_PRESET,
	PRIVACY_PRESETS,
	PRIVACY_PREVIEW_ROW_TOOLTIPS,
	PRIVACY_PREVIEW_VALUE_TOOLTIPS,
	type PrivacyPreset,
	type PrivacyPresetId,
	type PrivacyPresetValues,
	type PrivacyPreviewRowKey,
	publicLandingLookupCopy,
	type ServerWrappedShareModeValue,
	shareDefaultCopy
} from '$lib/sharing/options';
import {
	customPresetSeedValues,
	derivePreview,
	matchPresetFull,
	PREVIEW_LOGO_VISIBILITY_LABELS,
	PREVIEW_NAME_DISPLAY_LABELS,
	PREVIEW_PER_USER_DEFAULT_LABELS,
	PREVIEW_RECAP_VISIBILITY_LABELS,
	resolvePresetSelection,
	shouldShowCustomPresetNote
} from '$lib/sharing/preset-logic';
import { handleFormToast } from '$lib/utils/form-toast';
import { submitAction } from '$lib/utils/submit-action';
import { loadThemeFonts } from '$lib/utils/theme-fonts';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

let uiTheme = $state(untrack(() => data.settings.uiTheme));
let wrappedTheme = $state(untrack(() => data.settings.wrappedTheme));
let anonymizationMode = $state(untrack(() => data.settings.anonymizationMode));
let wrappedLogoMode = $state(untrack(() => data.settings.wrappedLogoMode));
let defaultShareMode = $state(untrack(() => data.settings.defaultShareMode));
let allowUserControl = $state(untrack(() => data.settings.allowUserControl));
// Narrow to the server-wide union ('public' | 'private-oauth') the preset
// helpers expect; the load already maps any wider value down to these two.
let serverWrappedShareMode = $state<ServerWrappedShareModeValue>(
	untrack(() => (data.settings.serverWrappedShareMode === 'public' ? 'public' : 'private-oauth'))
);
let publicLandingLookup = $state(untrack(() => data.settings.publicLandingLookup));
let enableFunFacts = $state(false);

// Privacy presets: a card selects a recommended combination of the six privacy
// fields below. The active preset is recomputed from the live runes (so manual
// edits in Advanced Options flip it to "Custom"), never persisted as a field.
let advancedPrivacyOpen = $state(false);

// Tracks whether the admin has actively touched the privacy controls (picked a
// preset card or edited an Advanced Option). On a fresh install the seeded
// values can resolve to 'custom' before any interaction; the "Custom
// configuration" note AND the Custom card's selected styling are both gated on
// this flag so neither accuses the admin of off-preset choices they haven't made
// yet (ISSUE-001).
let privacyTouched = $state(false);

// Sticky "the admin explicitly clicked the Custom card" flag. While set, Custom
// stays highlighted even when the live values happen to match a shipped preset
// (which is exactly what happens right after Custom seeds Balanced on a first
// pick). Cleared by clicking any of the five real cards.
let customPresetChosen = $state(false);

let selectedPreset = $derived(
	matchPresetFull({
		anonymizationMode,
		defaultShareMode,
		serverWrappedShareMode,
		publicLandingLookup,
		allowUserControl,
		logoMode: wrappedLogoMode
	})
);

let privacyPreview = $derived(
	derivePreview({
		anonymizationMode,
		defaultShareMode,
		serverWrappedShareMode,
		publicLandingLookup,
		allowUserControl,
		logoMode: wrappedLogoMode
	})
);

function assignPresetValues(values: PrivacyPresetValues) {
	anonymizationMode = values.anonymizationMode;
	defaultShareMode = values.defaultShareMode;
	serverWrappedShareMode = values.serverWrappedShareMode;
	publicLandingLookup = values.publicLandingLookup;
	allowUserControl = values.allowUserControl;
	wrappedLogoMode = values.logoMode;
}

function applyPrivacyPreset(preset: PrivacyPreset) {
	privacyTouched = true;
	customPresetChosen = false;
	assignPresetValues(preset.values);
}

// Picking Custom seeds Balanced ONLY as the first interaction of the session;
// afterwards it moves the highlight and mutates nothing (customPresetSeedValues
// owns that rule).
function selectCustomPreset() {
	const seed = customPresetSeedValues(privacyTouched);
	if (seed) assignPresetValues(seed);
	privacyTouched = true;
	customPresetChosen = true;
}

// The card that renders as selected: the derived match, the sticky Custom flag,
// or nothing at all on an untouched fresh install.
let selectedPresetCard = $derived(
	resolvePresetSelection(selectedPreset, privacyTouched, customPresetChosen)
);

// WAI-ARIA radiogroup keyboard support for the preset selector. The cards are
// native <button role="radio"> (Space/Enter already activate them); this adds
// roving tabindex + arrow/Home/End navigation so the group behaves like a real
// radio group for assistive tech. `presetButtons` is populated by bind:this on
// each card, indexed by position in PRIVACY_PRESETS — with the Custom card
// occupying the final index (PRIVACY_PRESETS.length).
let presetButtons = $state<(HTMLButtonElement | undefined)[]>([]);

const CUSTOM_PRESET_INDEX = PRIVACY_PRESETS.length;

function selectPresetAtIndex(index: number): boolean {
	if (index === CUSTOM_PRESET_INDEX) {
		selectCustomPreset();
		return true;
	}
	const preset = PRIVACY_PRESETS[index];
	if (!preset) return false;
	applyPrivacyPreset(preset);
	return true;
}

// Index of the card that holds tabindex=0. When a card is selected, that card is
// the tab stop; when nothing is selected (untouched fresh install), the first
// card keeps the group reachable.
let presetTabIndex = $derived.by(() => {
	if (selectedPresetCard === 'custom') return CUSTOM_PRESET_INDEX;
	const i = PRIVACY_PRESETS.findIndex((p) => p.id === selectedPresetCard);
	return i === -1 ? 0 : i;
});

function handlePresetKeydown(event: KeyboardEvent, index: number) {
	const last = CUSTOM_PRESET_INDEX;
	let target: number;
	switch (event.key) {
		case 'ArrowRight':
		case 'ArrowDown':
			target = index === last ? 0 : index + 1;
			break;
		case 'ArrowLeft':
		case 'ArrowUp':
			target = index === 0 ? last : index - 1;
			break;
		case 'Home':
			target = 0;
			break;
		case 'End':
			target = last;
			break;
		default:
			return;
	}
	event.preventDefault();
	if (!selectPresetAtIndex(target)) return;
	presetButtons[target]?.focus();
}

const presetIcons: Record<PrivacyPresetId, Component> = {
	'maximum-privacy': ShieldCheckIcon,
	'internal-community': UsersRoundIcon,
	balanced: ScaleIcon,
	'public-showcase': GlobeIcon,
	'anonymous-public': VenetianMaskIcon
};

let funFactFrequency = $state(untrack(() => data.funFactConfig.mode || 'normal'));
let openaiApiKey = $state('');
let openaiBaseUrl = $state(
	untrack(() => data.openaiConfig?.baseUrl || 'https://api.openai.com/v1')
);
let openaiModel = $state(untrack(() => data.openaiConfig?.model || 'gpt-4o-mini'));
let aiPersona = $state(
	untrack(() => {
		const p = data.openaiConfig?.persona;
		return p === 'witty' || p === 'wholesome' || p === 'nerdy' || p === 'random' ? p : 'witty';
	})
);
let isTestingAI = $state(false);
let testAIResult = $state<{ type: 'success' | 'error'; message: string } | null>(null);
let submitError = $state<string | null>(null);
let apiKeyError = $state<string | null>(null);
let baseUrlError = $state<string | null>(null);
let visibleError = $derived(submitError ?? form?.error ?? null);

// ISSUE-004: warn when AI fun facts are enabled but no OpenAI key will be in
// effect — neither typed here nor already configured via env/DB (data.hasOpenAI).
// Non-blocking: onboarding still proceeds and the built-in template generator runs.
let showAiKeyWarning = $derived(enableFunFacts && !openaiApiKey.trim() && !data.hasOpenAI);

const aiPersonaOptions = [
	{ value: 'witty', label: 'Witty', description: 'Clever and humorous' },
	{ value: 'wholesome', label: 'Wholesome', description: 'Warm and kind' },
	{ value: 'nerdy', label: 'Nerdy', description: 'Data-driven and detailed' },
	{ value: 'random', label: 'Random', description: 'Mix of styles' }
] as const;

const themeClasses = [
	'theme-modern-minimal',
	'theme-supabase',
	'theme-doom-64',
	'theme-amber-minimal',
	'theme-soviet-red',
	'theme-obsidian-premium',
	'theme-aurora-premium',
	'theme-champagne-premium'
];

$effect(() => {
	const themeClass = `theme-${uiTheme}`;

	document.body.classList.remove(...themeClasses);

	document.body.classList.add(themeClass);

	loadThemeFonts(uiTheme);
});

let slideStates = $state<Record<string, boolean>>(
	untrack(() => Object.fromEntries(data.slideOptions.map((s) => [s.type, s.enabled])))
);

let enabledSlidesString = $derived(
	Object.entries(slideStates)
		.filter(([_, enabled]) => enabled)
		.map(([type]) => type)
		.join(',')
);

let isSubmitting = $state(false);

interface SubStep {
	id: string;
	label: string;
	icon: 'appearance' | 'privacy' | 'slides' | 'ai';
}

// Built-in templates make the fun-fact step useful even when OpenAI is absent.
let subSteps = $derived([
	{ id: 'appearance', label: 'Appearance', icon: 'appearance' },
	{ id: 'privacy', label: 'Privacy', icon: 'privacy' },
	{ id: 'slides', label: 'Slides', icon: 'slides' },
	{ id: 'ai', label: 'AI Features', icon: 'ai' }
] satisfies SubStep[]);

let currentSubStep = $state(0);
let contentRef: HTMLElement | undefined = $state();
let animationDirection = $state<'forward' | 'backward'>('forward');

let totalSubSteps = $derived(subSteps.length);
let isFirstSubStep = $derived(currentSubStep === 0);
let isLastSubStep = $derived(currentSubStep === totalSubSteps - 1);
// Navigation bounds `currentSubStep`, so the non-null assertion cannot fail.
let currentStepData = $derived(subSteps[currentSubStep]!);

function nextSubStep() {
	if (currentSubStep < totalSubSteps - 1) {
		animationDirection = 'forward';
		currentSubStep += 1;
	}
}

function prevSubStep() {
	if (currentSubStep > 0) {
		animationDirection = 'backward';
		currentSubStep -= 1;
	}
}

function goToSubStep(index: number) {
	if (index >= 0 && index < totalSubSteps && index !== currentSubStep) {
		animationDirection = index > currentSubStep ? 'forward' : 'backward';
		currentSubStep = index;
	}
}

$effect(() => {
	if (!contentRef) return;
	// Intentionally read currentSubStep so this effect re-runs when the carousel advances.
	const step = currentSubStep;

	const xOffset = animationDirection === 'forward' ? 30 : -30;

	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads
	const controls = (animate as any)(
		contentRef,
		{
			opacity: [0, 1],
			transform: [`translateX(${xOffset}px)`, 'translateX(0)']
		},
		{ duration: 0.3, easing: [0.22, 1, 0.36, 1] }
	);

	// Motion runs this entrance via a WAAPI animation with `fill: "both"`, which
	// keeps a *filling* composited layer on contentRef after it finishes. While
	// that layer is held, DOM inserted into this subtree later (e.g. the Advanced
	// Options panel toggled open by `{#if advancedPrivacyOpen}`) does not repaint
	// on the first state change — the click flips the rune but the panel only
	// becomes visible on the next interaction, the two-click bug (ISSUE-016).
	// Stopping the animation once finished bakes the final values as plain inline
	// styles and detaches the filling animation, releasing the stale layer so the
	// first click expands reliably.
	controls?.finished?.then(() => controls.stop?.()).catch(() => {});

	// Stop the active animation if the effect reruns (carousel advances) or the
	// component unmounts before `controls.finished` resolves, so the filling
	// composited layer is always released and never outlives this run.
	return () => controls?.stop?.();
});

const defaultColors = { primary: '#3b82f6', accent: '#60a5fa', bg: '#0f172a' };
const themeColors: Record<string, { primary: string; accent: string; bg: string }> = {
	'modern-minimal': { primary: '#3b82f6', accent: '#60a5fa', bg: '#0f172a' },
	supabase: { primary: '#3ecf8e', accent: '#24b47e', bg: '#1c1c1c' },
	'doom-64': { primary: '#dc2626', accent: '#ef4444', bg: '#0a0a0a' },
	'amber-minimal': { primary: '#f59e0b', accent: '#fbbf24', bg: '#1a1410' },
	'soviet-red': { primary: '#b91c1c', accent: '#991b1b', bg: '#1a0a0a' }
};

function getThemeColors(themeValue: string) {
	return themeColors[themeValue] ?? defaultColors;
}
</script>

<OnboardingCard
	title="Configure Obzorarr"
	subtitle="Set how Obzorarr looks and behaves. You can change all of it later."
>
	{#snippet children()}
		<div class="settings-container">
			{#if visibleError}
				<div class="error-banner" role="alert" aria-live="polite">
					<svg aria-hidden="true"
						class="error-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
					<span>{visibleError}</span>
				</div>
			{/if}

			<div class="substep-indicator">
				<div class="substep-info">
					<span class="substep-current">{currentStepData.label}</span>
					<span class="substep-count">{currentSubStep + 1} of {totalSubSteps}</span>
				</div>
				<div class="substep-dots">
					{#each subSteps as step, index}
						<button
							type="button"
							class="substep-dot"
							class:active={index === currentSubStep}
							class:completed={index < currentSubStep}
							onclick={() => goToSubStep(index)}
							aria-label="Go to {step.label}"
						>
							{#if index < currentSubStep}
								<svg aria-hidden="true"
									class="dot-check"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
								>
									<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<form
				id="onboarding-settings-form"
				novalidate
				method="POST"
				action="?/saveSettings"
				use:enhance={({ formData }) => {
					isSubmitting = true;
					submitError = null;
					apiKeyError = null;
					baseUrlError = null;
					// Authoritatively serialize the live runes state into the submitted
					// FormData. The hidden <input value={…}> mirrors update the value
					// *attribute*, but FormData reads the *property*; for fields toggled by
					// <button type="button" onclick> inside a destroyed/recreated {#if}
					// carousel branch the property can keep its initial (default) value, so
					// button-driven selections (UI/Wrapped theme, User Control, Public
					// Landing Lookup) were silently lost. Overwriting formData here makes the
					// submission reflect the runes state regardless of DOM divergence.
					formData.set('uiTheme', uiTheme);
					formData.set('wrappedTheme', wrappedTheme);
					formData.set('anonymizationMode', anonymizationMode);
					formData.set('logoMode', wrappedLogoMode);
					formData.set('defaultShareMode', defaultShareMode);
					formData.set('allowUserControl', allowUserControl ? 'true' : 'false');
					formData.set('serverWrappedShareMode', serverWrappedShareMode);
					formData.set('publicLandingLookup', publicLandingLookup ? 'true' : 'false');
					formData.set('enabledSlides', enabledSlidesString);
					formData.set('enableFunFacts', enableFunFacts ? 'true' : 'false');
					formData.set('funFactFrequency', enableFunFacts ? funFactFrequency : '');
					formData.set('openaiApiKey', enableFunFacts ? openaiApiKey : '');
					formData.set('openaiBaseUrl', enableFunFacts ? openaiBaseUrl : '');
					formData.set('openaiModel', enableFunFacts ? openaiModel : '');
					formData.set('aiPersona', enableFunFacts ? aiPersona : '');
					return async ({ result, update }) => {
						try {
							if (result.type === 'failure') {
								const payload = result.data as { error?: string } | undefined;
								const message = payload?.error ?? 'Could not save your settings. Try again.';
								submitError = message;
								const isBaseUrlError = /openai\s*base\s*url/i.test(message);
								const isApiKeyError =
									!isBaseUrlError && /openai\s*api\s*key/i.test(message);
								if (isBaseUrlError || isApiKeyError) {
									if (isBaseUrlError) {
										baseUrlError = message;
									} else {
										apiKeyError = message;
									}
									const aiIndex = subSteps.findIndex((s) => s.id === 'ai');
									if (aiIndex >= 0 && currentSubStep !== aiIndex) {
										goToSubStep(aiIndex);
									}
									await tick();
									const targetId = isBaseUrlError
										? 'onboarding-openai-base-url'
										: 'onboarding-openai-api-key';
									document.getElementById(targetId)?.focus();
								}
								handleFormToast({ error: message });
							} else if (result.type === 'error') {
								const message =
									result.error?.message ?? 'Could not save your settings. Try again.';
								submitError = message;
								handleFormToast({ error: message });
							}
							await update();
						} catch (err) {
							const message =
								err instanceof Error ? err.message : 'Could not save your settings. Try again.';
							submitError = message;
							handleFormToast({ error: message });
						} finally {
							isSubmitting = false;
						}
					};
				}}
			>
				<input type="hidden" name="uiTheme" value={uiTheme} />
				<input type="hidden" name="wrappedTheme" value={wrappedTheme} />
				<input type="hidden" name="anonymizationMode" value={anonymizationMode} />
				<input type="hidden" name="logoMode" value={wrappedLogoMode} />
				<input type="hidden" name="defaultShareMode" value={defaultShareMode} />
				<input type="hidden" name="allowUserControl" value={allowUserControl ? 'true' : 'false'} />
				<input type="hidden" name="serverWrappedShareMode" value={serverWrappedShareMode} />
				<input
					type="hidden"
					name="publicLandingLookup"
					value={publicLandingLookup ? 'true' : 'false'}
				/>
				<input type="hidden" name="enabledSlides" value={enabledSlidesString} />
				<input type="hidden" name="enableFunFacts" value={enableFunFacts ? 'true' : 'false'} />
				<input
					type="hidden"
					name="funFactFrequency"
					value={enableFunFacts ? funFactFrequency : ''}
				/>
				<input type="hidden" name="openaiApiKey" value={enableFunFacts ? openaiApiKey : ''} />
				<input type="hidden" name="openaiBaseUrl" value={enableFunFacts ? openaiBaseUrl : ''} />
				<input type="hidden" name="openaiModel" value={enableFunFacts ? openaiModel : ''} />
				<input type="hidden" name="aiPersona" value={enableFunFacts ? aiPersona : ''} />

				<div class="carousel-content" bind:this={contentRef}>
					{#if currentStepData.id === 'appearance'}
						<div class="step-header">
							<div class="step-icon appearance-icon">
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<circle cx="12" cy="12" r="3" />
									<path
										d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
									/>
								</svg>
							</div>
							<div class="step-title">
								<h3>Appearance</h3>
								<p>Choose your visual theme</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="setting-group">
								<span class="setting-label">Dashboard Theme</span>
								<p class="setting-description">Used on the dashboard and admin pages</p>
								<div class="theme-swatches">
									{#each data.themeOptions as option}
										{@const colors = getThemeColors(option.value)}
										<button
											type="button"
											class="theme-swatch"
											class:selected={uiTheme === option.value}
											aria-pressed={uiTheme === option.value}
											onclick={() => (uiTheme = option.value)}
											style="--swatch-primary: {colors.primary}; --swatch-accent: {colors.accent}; --swatch-bg: {colors.bg}"
										>
											<div class="swatch-preview">
												<div class="swatch-bar"></div>
												<div class="swatch-dots">
													<span></span><span></span><span></span>
												</div>
											</div>
											<span class="swatch-label">{option.label}</span>
										</button>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<span class="setting-label">Wrapped Presentation Theme</span>
								<p class="setting-description">Used on the animated year-end slideshow</p>
								<div class="theme-swatches">
									{#each data.themeOptions as option}
										{@const colors = getThemeColors(option.value)}
										<button
											type="button"
											class="theme-swatch"
											class:selected={wrappedTheme === option.value}
											aria-pressed={wrappedTheme === option.value}
											onclick={() => (wrappedTheme = option.value)}
											style="--swatch-primary: {colors.primary}; --swatch-accent: {colors.accent}; --swatch-bg: {colors.bg}"
										>
											<div class="swatch-preview">
												<div class="swatch-bar"></div>
												<div class="swatch-dots">
													<span></span><span></span><span></span>
												</div>
											</div>
											<span class="swatch-label">{option.label}</span>
										</button>
									{/each}
								</div>
							</div>
						</div>
					{:else if currentStepData.id === 'privacy'}
						<div class="step-header">
							<div class="step-icon privacy-icon">
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
									<path d="M9 12l2 2 4-4" />
								</svg>
							</div>
							<div class="step-title">
								<h3>Privacy & Sharing</h3>
								<p>Control visibility and access</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="setting-group preset-section">
								<span class="setting-label">Privacy Preset</span>
								<p class="setting-description">
									Pick a starting point, then adjust anything in Advanced Options.
								</p>
								<div class="preset-grid" role="radiogroup" aria-label="Privacy preset">
									{#each PRIVACY_PRESETS as preset, i (preset.id)}
										{@const PresetIcon = presetIcons[preset.id]}
										<!-- biome-ignore lint/a11y/useSemanticElements: These rich radio cards implement the radiogroup keyboard pattern. -->
<button
											type="button"
											class="preset-card"
											class:selected={selectedPresetCard === preset.id}
											role="radio"
											aria-checked={selectedPresetCard === preset.id}
											tabindex={i === presetTabIndex ? 0 : -1}
											bind:this={presetButtons[i]}
											onclick={() => applyPrivacyPreset(preset)}
											onkeydown={(e) => handlePresetKeydown(e, i)}
										>
											<span class="preset-card-icon">
												<PresetIcon />
											</span>
											<span class="preset-card-body">
												<span class="preset-card-label">
													{preset.label}
													<!-- ISSUE-003: presentational-only "Recommended" badge on the
													     Balanced card. Static markup keyed off the immutable preset
													     id — it binds to NO rune and does NOT touch selectedPreset, so
													     it never highlights a card or alters the no-interaction POST
													     payload (persist-parity holds by construction). -->
													{#if preset.id === 'balanced'}
														<span class="preset-card-badge">Recommended</span>
													{/if}
												</span>
												<span class="preset-card-desc">{preset.description}</span>
												<span class="preset-card-summary">{preset.exposureSummary}</span>
											</span>
										</button>
									{/each}
									<!-- Sixth card: client-only "Custom". Rendered outside the {#each} so
									     PRIVACY_PRESETS stays exactly the five shipped value-maps. It holds
									     the final roving-tabindex slot (CUSTOM_PRESET_INDEX) and carries no
									     exposureSummary — the live "What this means" panel below already
									     states what the current fields expose. -->
									<!-- biome-ignore lint/a11y/useSemanticElements: These rich radio cards implement the radiogroup keyboard pattern. -->
<button
										type="button"
										class="preset-card"
										class:selected={selectedPresetCard === 'custom'}
										role="radio"
										aria-checked={selectedPresetCard === 'custom'}
										tabindex={CUSTOM_PRESET_INDEX === presetTabIndex ? 0 : -1}
										bind:this={presetButtons[CUSTOM_PRESET_INDEX]}
										onclick={selectCustomPreset}
										onkeydown={(e) => handlePresetKeydown(e, CUSTOM_PRESET_INDEX)}
									>
										<span class="preset-card-icon">
											<SlidersHorizontalIcon />
										</span>
										<span class="preset-card-body">
											<span class="preset-card-label">{CUSTOM_PRIVACY_PRESET.label}</span>
											<span class="preset-card-desc">{CUSTOM_PRIVACY_PRESET.description}</span>
										</span>
									</button>
								</div>
								{#if shouldShowCustomPresetNote(selectedPreset, privacyTouched)}
									<p class="preset-custom-note" role="status">
										Custom configuration: your choices don’t match a preset.
									</p>
								{:else if selectedPreset === 'custom'}
									<p class="preset-custom-note preset-custom-note-neutral" role="status">
										No preset selected yet. Pick one above, or continue with the current
										defaults.
									</p>
								{/if}
							</div>

							{#snippet previewDt(key: PrivacyPreviewRowKey, label: string)}
								{@const tip = PRIVACY_PREVIEW_ROW_TOOLTIPS[key]}
								<dt>
									<Tooltip.Root>
										<Tooltip.Trigger class="preview-dt-trigger">
											{label}
											<InfoIcon class="preview-info-icon" aria-hidden="true" />
										</Tooltip.Trigger>
										<Tooltip.Content
											side="top"
											sideOffset={6}
											collisionPadding={16}
											portalProps={{ to: 'body' }}
										>
											<div class="flex flex-col gap-1.5 text-left">
												<p><span class="font-semibold">Admin:</span> {tip.admin}</p>
												<p><span class="font-semibold">Visitor:</span> {tip.visitor}</p>
												<p><span class="font-semibold">Member:</span> {tip.member}</p>
											</div>
										</Tooltip.Content>
									</Tooltip.Root>
								</dt>
							{/snippet}
							{#snippet previewDd(tip: string, label: string)}
								<dd>
									<Tooltip.Root>
										<Tooltip.Trigger class="preview-dd-trigger">
											{label}
											<InfoIcon class="preview-info-icon" aria-hidden="true" />
										</Tooltip.Trigger>
										<Tooltip.Content
											side="top"
											sideOffset={6}
											collisionPadding={16}
											portalProps={{ to: 'body' }}
										>
											<p class="text-left">{tip}</p>
										</Tooltip.Content>
									</Tooltip.Root>
								</dd>
							{/snippet}
							<div class="privacy-preview" aria-live="polite">
								<span class="preview-title">What this means</span>
								<Tooltip.Provider delayDuration={150}>
									<dl class="preview-rows">
										<div class="preview-row">
											{@render previewDt('namesInStats', 'Names in stats')}
											{@render previewDd(
												PRIVACY_PREVIEW_VALUE_TOOLTIPS.namesInStats[privacyPreview.nameDisplay],
												PREVIEW_NAME_DISPLAY_LABELS[privacyPreview.nameDisplay]
											)}
										</div>
										<div class="preview-row">
											{@render previewDt('newUserDefault', 'Personal link baseline')}
											{@render previewDd(
												PRIVACY_PREVIEW_VALUE_TOOLTIPS.newUserDefault[
													privacyPreview.perUserDefaultForNewUsers
												],
												PREVIEW_PER_USER_DEFAULT_LABELS[privacyPreview.perUserDefaultForNewUsers]
											)}
										</div>
										<div class="preview-row">
											{@render previewDt('serverWideRecap', 'Server-wide recap')}
											{@render previewDd(
												PRIVACY_PREVIEW_VALUE_TOOLTIPS.serverWideRecap[
													privacyPreview.serverRecapVisibility
												],
												PREVIEW_RECAP_VISIBILITY_LABELS[privacyPreview.serverRecapVisibility]
											)}
										</div>
										<div class="preview-row">
											{@render previewDt('landingLookupForm', 'Landing lookup form')}
											{@render previewDd(
												PRIVACY_PREVIEW_VALUE_TOOLTIPS.landingLookupForm[
													privacyPreview.landingLookupForm
												],
												privacyPreview.landingLookupForm === 'visible' ? 'Shown' : 'Hidden'
											)}
										</div>
										{#if privacyPreview.logoVisibility}
											<div class="preview-row">
												<dt>Wrapped logo</dt>
												{@render previewDd(
													PRIVACY_PREVIEW_VALUE_TOOLTIPS.wrappedLogo[privacyPreview.logoVisibility],
													PREVIEW_LOGO_VISIBILITY_LABELS[privacyPreview.logoVisibility]
												)}
											</div>
										{/if}
									</dl>
								</Tooltip.Provider>
								<div class="preview-boundary">
									<strong>Sign-in still guards everything else.</strong>
									{publicLandingLookupCopy.protectedBoundary}
									{shareDefaultCopy.summary}
								</div>
							</div>

							<div class="advanced-options">
								<button
									type="button"
									class="advanced-toggle"
									class:open={advancedPrivacyOpen}
									aria-expanded={advancedPrivacyOpen}
									onclick={() => (advancedPrivacyOpen = !advancedPrivacyOpen)}
								>
									<span>Advanced Options</span>
									<ChevronDownIcon class="advanced-chevron" />
								</button>
								{#if advancedPrivacyOpen}
									<!-- change events from the descendant radios bubble here, so editing
									     any granular control counts as interaction (see privacyTouched). -->
									<div class="advanced-content" onchange={() => (privacyTouched = true)}>
							<div class="setting-group">
								<span class="setting-label">User Identity in Stats</span>
								<p class="setting-description">How usernames appear in server-wide statistics</p>
								<div class="radio-cards">
									{#each data.anonymizationOptions as option}
										<label class="radio-card" class:selected={anonymizationMode === option.value}>
											<input
												type="radio"
												name="anonymizationModeRadio"
												value={option.value}
												bind:group={anonymizationMode}
											/>
											<div class="radio-card-content">
												<div class="radio-indicator">
													<div class="radio-dot"></div>
												</div>
												<div class="radio-text">
													<span class="radio-label">{option.label}</span>
													<span class="radio-description">{option.description}</span>
												</div>
											</div>
										</label>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<span class="setting-label">Wrapped Page Logo</span>
								<p class="setting-description">Control logo visibility on Wrapped pages</p>
								<div class="radio-cards">
									{#each data.wrappedLogoOptions as option}
										<label class="radio-card" class:selected={wrappedLogoMode === option.value}>
											<input
												type="radio"
												name="logoModeRadio"
												value={option.value}
												bind:group={wrappedLogoMode}
											/>
											<div class="radio-card-content">
												<div class="radio-indicator">
													<div class="radio-dot"></div>
												</div>
												<div class="radio-text">
													<span class="radio-label">{option.label}</span>
													<span class="radio-description">{option.description}</span>
												</div>
											</div>
										</label>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<span class="setting-label">Default Sharing Mode</span>
								<p class="setting-description">
									{shareDefaultCopy.summary} {shareDefaultCopy.explicitRows}
								</p>
								<div class="radio-cards">
									{#each data.shareModeOptions as option}
										<label class="radio-card" class:selected={defaultShareMode === option.value}>
											<input
												type="radio"
												name="defaultShareModeRadio"
												value={option.value}
												checked={defaultShareMode === option.value}
												onchange={() => (defaultShareMode = option.value)}
											/>
											<div class="radio-card-content">
												<div class="radio-indicator">
													<div class="radio-dot"></div>
												</div>
												<div class="radio-text">
													<span class="radio-label">{option.label}</span>
													<span class="radio-description">{option.description}</span>
												</div>
											</div>
										</label>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<span class="setting-label">Server-wide Wrapped Sharing</span>
								<p class="setting-description">
									Who can view the server-wide /wrapped recap
								</p>
								<div class="radio-cards">
									{#each data.serverWrappedShareModeOptions as option}
										<label
											class="radio-card"
											class:selected={serverWrappedShareMode === option.value}
										>
											<input
												type="radio"
												name="serverWrappedShareModeRadio"
												value={option.value}
												checked={serverWrappedShareMode === option.value}
												onchange={() => (serverWrappedShareMode = option.value)}
											/>
											<div class="radio-card-content">
												<div class="radio-indicator">
													<div class="radio-dot"></div>
												</div>
												<div class="radio-text">
													<span class="radio-label">{option.label}</span>
													<span class="radio-description">{option.description}</span>
												</div>
											</div>
										</label>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<label class="toggle-row">
									<div class="toggle-text">
										<span class="toggle-label">Allow User Control</span>
										<span class="toggle-description"
											>Let users change their own sharing settings</span
										>
									</div>
									<button
										type="button"
										class="toggle-switch"
										class:active={allowUserControl}
										onclick={() => {
											privacyTouched = true;
											allowUserControl = !allowUserControl;
										}}
										aria-pressed={allowUserControl}
										aria-label="Allow User Control"
									>
										<span class="toggle-knob"></span>
									</button>
								</label>
							</div>

							<div class="setting-group">
								<label class="toggle-row">
									<div class="toggle-text">
										<span class="toggle-label">{publicLandingLookupCopy.label}</span>
										<span class="toggle-description">
											{publicLandingLookup
												? publicLandingLookupCopy.enabledDescription
												: publicLandingLookupCopy.disabledDescription}
										</span>
									</div>
									<button
										type="button"
										class="toggle-switch"
										class:active={publicLandingLookup}
										onclick={() => {
											privacyTouched = true;
											publicLandingLookup = !publicLandingLookup;
										}}
										aria-pressed={publicLandingLookup}
										aria-label={publicLandingLookupCopy.label}
									>
										<span class="toggle-knob"></span>
									</button>
								</label>
							</div>
							<p class="setting-description">{publicLandingLookupCopy.protectedBoundary}</p>
									</div>
								{/if}
							</div>
						</div>
					{:else if currentStepData.id === 'slides'}
						<div class="step-header">
							<div class="step-icon slides-icon">
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<rect x="2" y="3" width="20" height="14" rx="2" />
									<path d="M8 21h8M12 17v4" />
								</svg>
							</div>
							<div class="step-title">
								<h3>Slides</h3>
								<p>Choose which slides to display</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="slides-grid">
								{#each data.slideOptions as slide, i}
									<label
										class="slide-toggle"
										class:enabled={slideStates[slide.type]}
										style="--delay: {i * 30}ms"
									>
										<div class="slide-info">
											<span class="slide-name">{slide.label}</span>
										</div>
										<button
											type="button"
											class="toggle-switch small"
											class:active={slideStates[slide.type]}
											onclick={() => (slideStates[slide.type] = !slideStates[slide.type])}
											aria-pressed={slideStates[slide.type]}
											aria-label="Toggle {slide.label}"
										>
											<span class="toggle-knob"></span>
										</button>
									</label>
								{/each}
							</div>
						</div>
					{:else if currentStepData.id === 'ai'}
						<div class="step-header">
							<div class="step-icon ai-icon">
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path
										d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"
									/>
									<circle cx="8" cy="14" r="1" />
									<circle cx="16" cy="14" r="1" />
								</svg>
							</div>
							<div class="step-title">
								<h3>AI Features</h3>
								<p>Fun facts written by an OpenAI model</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="setting-group">
								<label class="toggle-row">
									<div class="toggle-text">
										<span class="toggle-label">Enable AI Fun Facts</span>
										<span class="toggle-description"
											>Generate personalized fun facts about viewing habits</span
										>
									</div>
									<button
										type="button"
										class="toggle-switch"
										class:active={enableFunFacts}
										onclick={() => (enableFunFacts = !enableFunFacts)}
										aria-pressed={enableFunFacts}
										aria-label="Enable AI Fun Facts"
									>
										<span class="toggle-knob"></span>
									</button>
								</label>
							</div>

							{#if enableFunFacts}
								<div class="setting-group frequency-group">
									<span class="setting-label">Fun Fact Frequency</span>
									<div class="frequency-options">
										{#each data.funFactOptions as option}
											<label
												class="frequency-option"
												class:selected={funFactFrequency === option.value}
											>
												<input
													type="radio"
													name="frequencyRadio"
													value={option.value}
													bind:group={funFactFrequency}
												/>
												<span class="frequency-label">{option.label}</span>
												<span class="frequency-desc">{option.description}</span>
											</label>
										{/each}
									</div>
								</div>

								<div class="setting-group">
									<label class="field-label" for="onboarding-openai-api-key">OpenAI API Key</label>
									<p class="setting-description">
										Obzorarr stores your key on the server and never returns it to the browser.
									</p>
									<input
										id="onboarding-openai-api-key"
										class="text-input"
										class:has-error={Boolean(apiKeyError)}
										type="password"
										bind:value={openaiApiKey}
										maxlength="512"
										placeholder="sk-..."
										autocomplete="off"
										aria-invalid={apiKeyError ? 'true' : 'false'}
										aria-describedby={apiKeyError ? 'onboarding-openai-api-key-error' : undefined}
									/>
									{#if apiKeyError}
										<p id="onboarding-openai-api-key-error" class="field-error" role="alert">
											{apiKeyError}
										</p>
									{/if}
									{#if showAiKeyWarning}
										<p class="ai-key-warning" role="status">
											Enter an OpenAI API key to use AI fun facts. Without a key, Obzorarr
											falls back to the built-in templates.
										</p>
									{/if}
								</div>

								<div class="setting-group">
									<label class="field-label" for="onboarding-openai-base-url">Base URL</label>
									<input
										id="onboarding-openai-base-url"
										class="text-input"
										class:has-error={Boolean(baseUrlError)}
										type="url"
										bind:value={openaiBaseUrl}
										maxlength="512"
										placeholder="https://api.openai.com/v1"
										aria-invalid={baseUrlError ? 'true' : 'false'}
										aria-describedby={baseUrlError
											? 'onboarding-openai-base-url-error'
											: undefined}
									/>
									{#if baseUrlError}
										<p id="onboarding-openai-base-url-error" class="field-error" role="alert">
											{baseUrlError}
										</p>
									{/if}
								</div>

								<div class="setting-group">
									<label class="field-label" for="onboarding-openai-model">Model</label>
									<input
										id="onboarding-openai-model"
										class="text-input"
										type="text"
										bind:value={openaiModel}
										maxlength="100"
										placeholder="gpt-4o-mini (default)"
									/>
									<div class="test-connection-row">
										<button
											type="button"
											class="btn-test"
											disabled={isTestingAI || !openaiApiKey.trim()}
											onclick={async () => {
												isTestingAI = true;
												testAIResult = null;
												const formData = new FormData();
												formData.set('openaiApiKey', openaiApiKey);
												formData.set('openaiBaseUrl', openaiBaseUrl);
												formData.set('openaiModel', openaiModel);
												try {
													const result = await submitAction<{
														success?: boolean;
														message?: string;
														error?: string;
													}>('?/testAIConnection', formData);
													if (result.type === 'success' || result.type === 'failure') {
														const payload = result.data;
														handleFormToast(payload);
														testAIResult = payload.error
															? { type: 'error', message: payload.error }
															: {
																	type: 'success',
																	message: payload.message ?? 'Connection succeeded'
																};
													} else if (result.type === 'error') {
														const message =
															result.error.message ?? 'The connection test failed';
														handleFormToast({ error: message });
														testAIResult = { type: 'error', message };
													} else {
														const message = 'Unexpected response from server';
														handleFormToast({ error: message });
														testAIResult = { type: 'error', message };
													}
												} catch {
													const message =
														'Could not run the connection test. Check your network and try again.';
													handleFormToast({ error: message });
													testAIResult = { type: 'error', message };
												} finally {
													isTestingAI = false;
												}
											}}
										>
											{#if isTestingAI}
												<span class="spinner"></span>
												Testing...
											{:else}
												Test Connection
											{/if}
										</button>
										{#if testAIResult}
											<div class="inline-result" class:error={testAIResult.type === 'error'}>
												{testAIResult.message}
											</div>
										{/if}
									</div>
								</div>

								<div class="setting-group">
									<span class="setting-label">AI Persona</span>
									<p class="setting-description">Tone for AI-generated fun facts</p>
									<div class="frequency-options">
										{#each aiPersonaOptions as option}
											<label
												class="frequency-option"
												class:selected={aiPersona === option.value}
											>
												<input
													type="radio"
													name="aiPersonaRadio"
													value={option.value}
													bind:group={aiPersona}
												/>
												<span class="frequency-label">{option.label}</span>
												<span class="frequency-desc">{option.description}</span>
											</label>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<button
					type="submit"
					form="onboarding-settings-form"
					class="hidden-submit"
					disabled={isSubmitting}
					aria-hidden="true"
					tabindex="-1">Save</button
				>
			</form>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="footer-actions">
			<Button
				type="button"
				class="btn-nav btn-prev tap-target"
				disabled={isFirstSubStep || isSubmitting}
				title={isFirstSubStep ? 'You are on the first step' : undefined}
				aria-label={isFirstSubStep
					? 'Previous step (unavailable, this is the first step)'
					: 'Go to previous step'}
				onclick={prevSubStep}
			>
				<ArrowLeftIcon class="nav-arrow" />
				Previous
			</Button>

			<form method="POST" action="?/skipSettings" use:enhance class="skip-form">
				<SubmitButton class="btn-skip-link tap-target" disabled={isSubmitting}>
					{#snippet children()}
						Skip setup
					{/snippet}
				</SubmitButton>
			</form>

			{#if isLastSubStep}
				<SubmitButton
					form="onboarding-settings-form"
					class="btn-nav btn-save tap-target"
					submitting={isSubmitting}
				>
					{#snippet children()}
						Save & Continue
						<ArrowRightIcon class="nav-arrow" />
					{/snippet}
					{#snippet submittingLabel()}
						Saving...
					{/snippet}
				</SubmitButton>
			{:else}
				<Button
					type="button"
					class="btn-nav btn-next tap-target"
					disabled={isSubmitting}
					onclick={nextSubStep}
				>
					Next
					<ArrowRightIcon class="nav-arrow" />
				</Button>
			{/if}
		</div>
	{/snippet}
</OnboardingCard>

<style>
		.settings-container {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		.error-banner {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.875rem 1rem;
			background: rgba(239, 68, 68, 0.15);
			border: 1px solid rgba(239, 68, 68, 0.3);
			border-radius: 0.75rem;
			color: #fca5a5;
			font-size: 0.875rem;
			margin-bottom: 0.5rem;
		}

		.error-icon {
			width: 1.25rem;
			height: 1.25rem;
			flex-shrink: 0;
			color: #f87171;
		}

		.hidden-submit {
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

		.substep-indicator {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding: 0.875rem 1rem;
			background: rgba(0, 0, 0, 0.2);
			border: 1px solid oklch(var(--primary) / 0.1);
			border-radius: 0.875rem;
			margin-bottom: 1rem;
		}

		.substep-info {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
		}

		.substep-current {
			font-size: 0.9rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.95);
			font-family: 'DM Sans', system-ui, sans-serif;
		}

		.substep-count {
			font-size: 0.75rem;
			color: rgba(255, 255, 255, 0.45);
			font-variant-numeric: tabular-nums;
		}

		.substep-dots {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.substep-dot {
			width: 1.75rem;
			height: 1.75rem;
			border-radius: 50%;
			border: 2px solid rgba(255, 255, 255, 0.15);
			background: rgba(0, 0, 0, 0.2);
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
		}

		.substep-dot:hover {
			border-color: rgba(255, 255, 255, 0.3);
			background: rgba(255, 255, 255, 0.05);
		}

		.substep-dot.completed {
			border-color: oklch(0.7205 0.192 149.49);
			background: linear-gradient(135deg, oklch(0.7205 0.192 149.49) 0%, oklch(0.5988 0.1576 149.72) 100%);
		}

		.substep-dot.active {
			border-color: oklch(var(--primary));
			background: linear-gradient(135deg, oklch(var(--primary)) 0%, oklch(var(--accent)) 100%);
			box-shadow: 0 0 12px oklch(var(--primary) / 0.4);
		}

		.dot-check {
			width: 0.875rem;
			height: 0.875rem;
			color: white;
		}

		.carousel-content {
			min-height: 320px;
		}

		.step-header {
			display: flex;
			align-items: center;
			gap: 1rem;
			margin-bottom: 1.5rem;
			padding-bottom: 1rem;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		}

		.step-icon {
			width: 3rem;
			height: 3rem;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 0.875rem;
			flex-shrink: 0;
		}

		.step-icon svg {
			width: 1.5rem;
			height: 1.5rem;
		}

		.step-icon.appearance-icon {
			background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.1));
			color: #fbbf24;
		}

		.step-icon.privacy-icon {
			background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1));
			color: #60a5fa;
		}

		.step-icon.slides-icon {
			background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(139, 92, 246, 0.1));
			color: #a78bfa;
		}

		.step-icon.ai-icon {
			background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1));
			color: #4ade80;
		}

		.step-title h3 {
			margin: 0;
			font-size: 1.125rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.95);
			font-family: 'DM Sans', system-ui, sans-serif;
		}

		.step-title p {
			margin: 0.25rem 0 0;
			font-size: 0.85rem;
			color: rgba(255, 255, 255, 0.5);
		}

		.step-fields {
			display: flex;
			flex-direction: column;
			gap: 1.25rem;
		}

		.footer-actions {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			width: 100%;
		}

		.skip-form {
			position: absolute;
			left: 50%;
			transform: translateX(-50%);
		}

		/* `.btn-skip-link` styled as a low-emphasis text link (underline-
		   on-hover, transparent background). Hoisted to :global so
		   SubmitButton's child-rendered <button> inherits the link-style
		   palette + hover treatment + :disabled fade. */
		:global(.btn-skip-link) {
			background: transparent;
			border: none;
			color: rgba(255, 255, 255, 0.4);
			font-size: 0.8rem;
			cursor: pointer;
			padding: 0.5rem 1rem;
			transition: color 0.2s ease;
			text-decoration: underline;
			text-decoration-color: transparent;
			text-underline-offset: 2px;
		}

		:global(.btn-skip-link:hover:not(:disabled)) {
			color: rgba(255, 255, 255, 0.6);
			text-decoration-color: currentColor;
		}

		:global(.btn-skip-link:disabled) {
			opacity: 0.5;
			cursor: not-allowed;
		}

		/* The save control is SubmitButton-rendered while previous/next are native
		   buttons, so the shared footer layout must be global. */
		:global(.btn-nav) {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.75rem 1.25rem;
			border-radius: 0.75rem;
			font-size: 0.875rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		}

		:global(.btn-prev) {
			background: transparent;
			border: 1px solid rgba(255, 255, 255, 0.15);
			color: rgba(255, 255, 255, 0.7);
		}

		:global(.btn-prev:hover:not(:disabled)) {
			background: rgba(255, 255, 255, 0.05);
			border-color: rgba(255, 255, 255, 0.25);
			color: rgba(255, 255, 255, 0.9);
		}

		:global(.btn-prev:disabled) {
			opacity: 0.35;
			cursor: not-allowed;
		}

		:global(.btn-next) {
			background: oklch(var(--primary) / 0.15);
			border: 1px solid oklch(var(--primary) / 0.3);
			color: oklch(var(--primary));
		}

		:global(.btn-next:hover:not(:disabled)) {
			background: oklch(var(--primary) / 0.25);
			border-color: oklch(var(--primary) / 0.5);
			transform: translateX(2px);
		}

		:global(.btn-save) {
			background: linear-gradient(135deg, oklch(var(--primary)) 0%, oklch(var(--accent)) 100%);
			border: none;
			color: oklch(var(--primary-foreground));
			font-weight: 600;
			box-shadow: 0 4px 16px oklch(var(--primary) / 0.25);
		}

		:global(.btn-save:hover:not(:disabled)) {
			transform: translateY(-2px);
			box-shadow: 0 6px 24px oklch(var(--primary) / 0.35);
		}

		:global(.btn-save:disabled) {
			opacity: 0.7;
			cursor: not-allowed;
			transform: none;
		}

		:global(.nav-arrow) {
			width: 1rem;
			height: 1rem;
			transition: transform 0.2s ease;
		}

		:global(.btn-next:hover:not(:disabled) .nav-arrow) {
			transform: translateX(2px);
		}

		:global(.btn-prev:hover:not(:disabled) .nav-arrow) {
			transform: translateX(-2px);
		}
		.setting-group {
			margin-top: 1.25rem;
		}

		.setting-group:first-child {
			margin-top: 0;
		}

		.setting-label {
			display: block;
			font-size: 0.875rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.9);
			margin-bottom: 0.25rem;
		}

		.setting-description {
			display: block;
			font-size: 0.8rem;
			color: rgba(255, 255, 255, 0.45);
			margin-bottom: 0.75rem;
		}

		.ai-key-warning {
			margin: 0.625rem 0 0;
			padding: 0.625rem 0.75rem;
			font-size: 0.78rem;
			line-height: 1.4;
			color: #fcd34d;
			background: rgba(245, 158, 11, 0.12);
			border: 1px solid rgba(245, 158, 11, 0.35);
			border-radius: 0.625rem;
		}


		.preset-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
			gap: 0.625rem;
		}

		.preset-card {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 0.625rem;
			padding: 0.875rem;
			text-align: left;
			background: rgba(0, 0, 0, 0.2);
			border: 1.5px solid rgba(255, 255, 255, 0.08);
			border-radius: 0.875rem;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.preset-card:hover {
			background: rgba(0, 0, 0, 0.3);
			border-color: rgba(255, 255, 255, 0.16);
			transform: translateY(-2px);
		}

		.preset-card.selected {
			border-color: oklch(var(--primary));
			background: oklch(var(--primary) / 0.1);
			box-shadow: 0 0 18px oklch(var(--primary) / 0.25);
		}

		.preset-card-icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 2.25rem;
			height: 2.25rem;
			border-radius: 0.625rem;
			background: oklch(var(--primary) / 0.12);
			color: oklch(var(--primary));
			transition: all 0.25s ease;
		}

		.preset-card-icon :global(svg) {
			width: 1.25rem;
			height: 1.25rem;
		}

		.preset-card.selected .preset-card-icon {
			background: linear-gradient(135deg, oklch(var(--primary)), oklch(var(--accent)));
			color: oklch(var(--primary-foreground));
		}

		.preset-card-body {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
		}

		.preset-card-label {
			display: inline-flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 0.375rem;
			font-size: 0.875rem;
			font-weight: 600;
			color: rgba(255, 255, 255, 0.92);
		}

		/* ISSUE-003: presentational "Recommended" badge on the Balanced card.
		   Themed via the OKLCH custom properties (oklch(var(--token))) so it tracks
		   the active dashboard theme without referencing preset selection state. */
		.preset-card-badge {
			display: inline-flex;
			align-items: center;
			padding: 0.0625rem 0.4rem;
			border-radius: 999px;
			background: oklch(var(--primary) / 0.16);
			border: 1px solid oklch(var(--primary) / 0.35);
			color: oklch(var(--primary));
			font-size: 0.6rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			line-height: 1.2;
		}

		.preset-card-desc {
			font-size: 0.75rem;
			line-height: 1.4;
			color: rgba(255, 255, 255, 0.5);
		}

		.preset-card-summary {
			font-size: 0.7rem;
			line-height: 1.35;
			color: oklch(var(--primary) / 0.85);
			font-variant: small-caps;
			letter-spacing: 0.02em;
		}

		.preset-custom-note {
			margin: 0.75rem 0 0;
			font-size: 0.78rem;
			color: rgba(255, 255, 255, 0.6);
			font-style: italic;
		}

		.preset-custom-note-neutral {
			font-style: normal;
			color: rgba(255, 255, 255, 0.45);
		}

		.privacy-preview {
			margin-top: 1.25rem;
			padding: 1rem;
			background: rgba(0, 0, 0, 0.22);
			border: 1px solid oklch(var(--primary) / 0.18);
			border-radius: 0.875rem;
		}

		.preview-title {
			display: block;
			font-size: 0.7rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: oklch(var(--primary) / 0.9);
			margin-bottom: 0.75rem;
		}

		.preview-rows {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			margin: 0;
		}

		.preview-row {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: 1rem;
			padding-bottom: 0.5rem;
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		}

		.preview-row:last-child {
			padding-bottom: 0;
			border-bottom: none;
		}

		.preview-boundary {
			display: grid;
			gap: 0.35rem;
			margin-top: 0.85rem;
			padding-top: 0.85rem;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			font-size: 0.76rem;
			line-height: 1.5;
			color: rgba(255, 255, 255, 0.68);
		}

		.preview-boundary strong {
			color: rgba(255, 255, 255, 0.9);
		}

		.preview-row dt {
			font-size: 0.78rem;
			color: rgba(255, 255, 255, 0.5);
		}

		/* Tooltip trigger on each preview label: a borderless inline button so the
		   label + info icon read as one help target (hover or keyboard focus). The
		   class lands on the bits-ui Trigger's rendered <button>, so it must be
		   :global — scoped under .preview-row to stay effectively local. */
		.preview-row :global(.preview-dt-trigger) {
			display: inline-flex;
			align-items: center;
			gap: 0.3rem;
			padding: 0;
			background: none;
			border: none;
			font: inherit;
			color: inherit;
			cursor: help;
			text-align: left;
			border-radius: 0.25rem;
		}

		.preview-row :global(.preview-dt-trigger:hover) {
			color: rgba(255, 255, 255, 0.8);
		}

		.preview-row :global(.preview-dt-trigger:focus-visible) {
			outline: 2px solid oklch(var(--primary) / 0.6);
			outline-offset: 2px;
		}

		.preview-row :global(.preview-info-icon) {
			width: 0.85rem;
			height: 0.85rem;
			flex-shrink: 0;
			opacity: 0.65;
		}

		.preview-row dd {
			margin: 0;
			font-size: 0.8rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.9);
			text-align: right;
		}

		/* Tooltip trigger on each preview VALUE: mirrors .preview-dt-trigger so the
		   value + info icon read as one help target. Inherits the dd's font weight +
		   color so the selected value still reads as the emphasized right column. */
		.preview-row :global(.preview-dd-trigger) {
			display: inline-flex;
			align-items: center;
			gap: 0.3rem;
			padding: 0;
			background: none;
			border: none;
			font: inherit;
			color: inherit;
			cursor: help;
			text-align: right;
			border-radius: 0.25rem;
		}

		.preview-row :global(.preview-dd-trigger:hover) {
			color: #fff;
		}

		.preview-row :global(.preview-dd-trigger:focus-visible) {
			outline: 2px solid oklch(var(--primary) / 0.6);
			outline-offset: 2px;
		}

		.advanced-options {
			margin-top: 1.25rem;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			padding-top: 1rem;
		}

		.advanced-toggle {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
			width: 100%;
			padding: 0.625rem 0.875rem;
			background: rgba(0, 0, 0, 0.18);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 0.75rem;
			color: rgba(255, 255, 255, 0.78);
			font-size: 0.82rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.advanced-toggle:hover {
			background: rgba(0, 0, 0, 0.28);
			color: rgba(255, 255, 255, 0.95);
		}

		.advanced-toggle :global(.advanced-chevron) {
			width: 1rem;
			height: 1rem;
			transition: transform 0.25s ease;
		}

		.advanced-toggle.open :global(.advanced-chevron) {
			transform: rotate(180deg);
		}

		.advanced-content {
			display: flex;
			flex-direction: column;
			gap: 1.25rem;
			margin-top: 1rem;
			animation: fadeSlide 0.25s ease;
		}

		.theme-swatches {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
			gap: 0.625rem;
		}

		.theme-swatch {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.5rem;
			padding: 0.625rem;
			background: rgba(0, 0, 0, 0.2);
			border: 2px solid transparent;
			border-radius: 0.75rem;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.theme-swatch:hover {
			background: rgba(0, 0, 0, 0.3);
			transform: translateY(-2px);
		}

		.theme-swatch.selected {
			border-color: var(--swatch-primary);
			background: rgba(0, 0, 0, 0.35);
			box-shadow: 0 0 16px color-mix(in srgb, var(--swatch-primary) 30%, transparent);
		}

		.swatch-preview {
			width: 100%;
			aspect-ratio: 16/10;
			background: var(--swatch-bg);
			border-radius: 0.375rem;
			padding: 0.375rem;
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			overflow: hidden;
		}

		.swatch-bar {
			height: 4px;
			width: 70%;
			background: linear-gradient(90deg, var(--swatch-primary), var(--swatch-accent));
			border-radius: 2px;
		}

		.swatch-dots {
			display: flex;
			gap: 3px;
		}

		.swatch-dots span {
			width: 4px;
			height: 4px;
			border-radius: 50%;
			background: var(--swatch-primary);
			opacity: 0.6;
		}

		.swatch-label {
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.7);
			text-align: center;
			line-height: 1.2;
		}

		.radio-cards {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		.radio-card {
			position: relative;
			cursor: pointer;
		}

		.radio-card input {
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

		.radio-card:focus-within .radio-card-content {
			outline: 2px solid oklch(var(--primary));
			outline-offset: 2px;
		}

		.radio-card-content {
			display: flex;
			align-items: flex-start;
			gap: 0.875rem;
			padding: 0.875rem 1rem;
			background: rgba(0, 0, 0, 0.15);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 0.75rem;
			transition: all 0.25s ease;
		}

		.radio-card:hover .radio-card-content {
			background: rgba(0, 0, 0, 0.25);
			border-color: rgba(255, 255, 255, 0.12);
		}

		.radio-card.selected .radio-card-content {
			background: oklch(var(--primary) / 0.08);
			border-color: oklch(var(--primary) / 0.35);
		}

		.radio-indicator {
			width: 1.125rem;
			height: 1.125rem;
			border: 2px solid rgba(255, 255, 255, 0.25);
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			margin-top: 0.125rem;
			transition: all 0.25s ease;
		}

		.radio-card.selected .radio-indicator {
			border-color: oklch(var(--primary));
			background: oklch(var(--primary));
		}

		.radio-dot {
			width: 0.375rem;
			height: 0.375rem;
			border-radius: 50%;
			background: transparent;
			transition: all 0.2s ease;
		}

		.radio-card.selected .radio-dot {
			background: oklch(var(--primary-foreground));
		}

		.radio-text {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
		}

		.radio-label {
			font-size: 0.875rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.9);
		}

		.radio-description {
			font-size: 0.75rem;
			color: rgba(255, 255, 255, 0.45);
		}

		.toggle-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding: 0.875rem 1rem;
			background: rgba(0, 0, 0, 0.15);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 0.75rem;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.toggle-row:hover {
			background: rgba(0, 0, 0, 0.25);
		}

		.toggle-text {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
		}

		.toggle-label {
			font-size: 0.875rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.9);
		}

		.toggle-description {
			font-size: 0.75rem;
			color: rgba(255, 255, 255, 0.45);
		}

		.toggle-switch {
			position: relative;
			width: 2.75rem;
			height: 1.5rem;
			background: rgba(255, 255, 255, 0.1);
			border: none;
			border-radius: 0.75rem;
			cursor: pointer;
			flex-shrink: 0;
			transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.toggle-switch.small {
			width: 2.25rem;
			height: 1.25rem;
		}

		.toggle-switch:hover {
			background: rgba(255, 255, 255, 0.15);
		}

		.toggle-switch.active {
			background: linear-gradient(135deg, oklch(var(--primary)), oklch(var(--accent)));
		}

		.toggle-knob {
			position: absolute;
			top: 3px;
			left: 3px;
			width: calc(1.5rem - 6px);
			height: calc(1.5rem - 6px);
			background: white;
			border-radius: 50%;
			box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
			transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.toggle-switch.small .toggle-knob {
			width: calc(1.25rem - 6px);
			height: calc(1.25rem - 6px);
		}

		.toggle-switch.active .toggle-knob {
			transform: translateX(1.25rem);
		}

		.toggle-switch.small.active .toggle-knob {
			transform: translateX(1rem);
		}

		.slides-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 0.5rem;
		}

		@media (max-width: 480px) {
			.slides-grid {
				grid-template-columns: 1fr;
			}
		}

		.slide-toggle {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.75rem;
			padding: 0.75rem 1rem;
			background: rgba(0, 0, 0, 0.15);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 0.625rem;
			cursor: pointer;
			transition: all 0.25s ease;
			animation: slideIn 0.3s ease both;
			animation-delay: var(--delay);
		}

		@keyframes slideIn {
			from {
				opacity: 0;
				transform: translateY(8px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		.slide-toggle:hover {
			background: rgba(0, 0, 0, 0.25);
		}

		.slide-toggle.enabled {
			border-color: oklch(var(--primary) / 0.2);
		}

		.slide-name {
			font-size: 0.8rem;
			color: rgba(255, 255, 255, 0.8);
		}

		.frequency-group {
			padding-left: 1.5rem;
			border-left: 2px solid oklch(var(--primary) / 0.2);
			animation: fadeSlide 0.3s ease;
		}

		@keyframes fadeSlide {
			from {
				opacity: 0;
				transform: translateX(-10px);
			}
			to {
				opacity: 1;
				transform: translateX(0);
			}
		}

		.frequency-options {
			display: flex;
			gap: 0.5rem;
			flex-wrap: wrap;
		}

		.frequency-option {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.25rem;
			padding: 0.625rem 1rem;
			background: rgba(0, 0, 0, 0.2);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 0.625rem;
			cursor: pointer;
			transition: all 0.2s ease;
			flex: 1;
			min-width: 80px;
		}

		.frequency-option input {
			position: absolute;
			opacity: 0;
			pointer-events: none;
		}

		.frequency-option:hover {
			background: rgba(0, 0, 0, 0.3);
		}

		.frequency-option.selected {
			background: oklch(var(--primary) / 0.1);
			border-color: oklch(var(--primary) / 0.4);
		}

		.frequency-label {
			font-size: 0.875rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.9);
		}

		.frequency-desc {
			font-size: 0.7rem;
			color: rgba(255, 255, 255, 0.45);
		}

		.field-label {
			display: block;
			font-size: 0.875rem;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.9);
			margin-bottom: 0.25rem;
		}

		.text-input {
			display: block;
			width: 100%;
			padding: 0.625rem 0.875rem;
			background: rgba(0, 0, 0, 0.25);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 0.5rem;
			color: rgba(255, 255, 255, 0.95);
			font-size: 0.875rem;
			font-family: inherit;
			transition: border-color 0.2s ease, background 0.2s ease;
		}

		.text-input::placeholder {
			color: rgba(255, 255, 255, 0.35);
		}

		.text-input:focus {
			outline: none;
			background: rgba(0, 0, 0, 0.35);
			border-color: oklch(var(--primary) / 0.5);
		}

		.text-input.has-error {
			border-color: rgba(239, 68, 68, 0.6);
		}

		.field-error {
			margin: 0.375rem 0 0;
			font-size: 0.8rem;
			color: #fca5a5;
		}

		.test-connection-row {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			flex-wrap: wrap;
			margin-top: 0.625rem;
		}

		.btn-test {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.5rem 0.875rem;
			background: rgba(0, 0, 0, 0.3);
			border: 1px solid rgba(255, 255, 255, 0.15);
			border-radius: 0.5rem;
			color: rgba(255, 255, 255, 0.85);
			font-size: 0.8rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.btn-test:hover:not(:disabled) {
			background: rgba(0, 0, 0, 0.45);
			border-color: rgba(255, 255, 255, 0.25);
		}

		.btn-test:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.inline-result {
			font-size: 0.8rem;
			padding: 0.375rem 0.625rem;
			background: rgba(34, 197, 94, 0.15);
			border: 1px solid rgba(34, 197, 94, 0.4);
			border-radius: 0.5rem;
			color: #86efac;
		}

		.inline-result.error {
			background: rgba(239, 68, 68, 0.15);
			border-color: rgba(239, 68, 68, 0.4);
			color: #fca5a5;
		}

		.spinner {
			width: 1rem;
			height: 1rem;
			border: 2px solid oklch(var(--primary-foreground) / 0.3);
			border-top-color: oklch(var(--primary-foreground));
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}

		@media (max-width: 480px) {
			.substep-indicator {
				flex-direction: column;
				gap: 0.75rem;
				text-align: center;
			}

			.substep-info {
				align-items: center;
			}

			.substep-dots {
				gap: 0.375rem;
			}

			.substep-dot {
				width: 1.5rem;
				height: 1.5rem;
			}

			.dot-check {
				width: 0.75rem;
				height: 0.75rem;
			}

			.carousel-content {
				min-height: 280px;
			}

			.step-header {
				flex-direction: column;
				text-align: center;
				gap: 0.75rem;
			}

			.step-icon {
				width: 2.5rem;
				height: 2.5rem;
			}

			.step-icon svg {
				width: 1.25rem;
				height: 1.25rem;
			}

			.step-title h3 {
				font-size: 1rem;
			}

			.theme-swatches {
				grid-template-columns: repeat(3, 1fr);
			}

			.footer-actions {
				position: relative;
				justify-content: space-between;
			}

			.skip-form {
				position: static;
				transform: none;
				order: -1;
				width: 100%;
				text-align: center;
				margin-bottom: 0.5rem;
			}

			:global(.btn-nav) {
				padding: 0.625rem 1rem;
				font-size: 0.8rem;
			}

			:global(.btn-skip-link) {
				font-size: 0.75rem;
			}
		}

		@media (max-width: 360px) {
			.substep-dot {
				width: 1.25rem;
				height: 1.25rem;
			}

			.theme-swatches {
				grid-template-columns: repeat(2, 1fr);
			}
		}
</style>
