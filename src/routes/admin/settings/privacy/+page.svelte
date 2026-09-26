<script lang="ts">
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
import EyeOffIcon from '@lucide/svelte/icons/eye-off';
import GlobeIcon from '@lucide/svelte/icons/globe';
import ImageIcon from '@lucide/svelte/icons/image';
import InfoIcon from '@lucide/svelte/icons/info';
import LinkIcon from '@lucide/svelte/icons/link';
import LockIcon from '@lucide/svelte/icons/lock';
import ScaleIcon from '@lucide/svelte/icons/scale';
import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
import ShieldUserIcon from '@lucide/svelte/icons/shield-user';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
import UserCogIcon from '@lucide/svelte/icons/user-cog';
import UsersIcon from '@lucide/svelte/icons/users';
import UsersRoundIcon from '@lucide/svelte/icons/users-round';
import VenetianMaskIcon from '@lucide/svelte/icons/venetian-mask';
import type { ActionResult } from '@sveltejs/kit';
import type { Component } from 'svelte';
import { tick } from 'svelte';
import { superForm } from 'sveltekit-superforms';
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import {
	SettingsActionBar,
	SettingsOptionCard,
	SettingsToggleRow
} from '$lib/components/settings/index.js';
import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import * as Collapsible from '$lib/components/ui/collapsible/index.js';
import * as Form from '$lib/components/ui/form/index.js';
import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
import * as Tooltip from '$lib/components/ui/tooltip/index.js';
import {
	CUSTOM_PRIVACY_PRESET,
	PRIVACY_PRESETS,
	PRIVACY_PREVIEW_ROW_TOOLTIPS,
	PRIVACY_PREVIEW_VALUE_TOOLTIPS,
	type PrivacyPreset,
	type PrivacyPresetId,
	type PrivacyPresetPrivacyKey,
	type PrivacyPresetValues,
	type PrivacyPreviewRowKey,
	publicLandingLookupCopy,
	shareDefaultCopy
} from '$lib/sharing/options';
import {
	derivePreview,
	matchPresetPrivacy,
	PREVIEW_NAME_DISPLAY_LABELS,
	PREVIEW_PER_USER_DEFAULT_LABELS,
	PREVIEW_RECAP_VISIBILITY_LABELS,
	type PrivacyPreviewModel,
	resolvePersistedPresetSelection
} from '$lib/sharing/preset-logic';
import { handleFormToast } from '$lib/utils/form-toast';
import { isOccConflict, isPostValidationFailure, surfaceOccConflict } from '$lib/utils/occ-form';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// superForm `onUpdate` guard for the four forms on this route. Runs the shared
// OCC stale-write guard first (cancels on fail(409,{conflict:true}) — ISSUE-006),
// then cancels every OTHER post-validation failure.
//
// The discriminator is the RETURNED FORM's own `valid` flag, not the status code.
// An action that fails AFTER `superValidate` passed hands back a form that is
// still `valid`, so `onUpdated` takes its success branch and would fire a false
// "Saved" toast and advance the saved baseline even though nothing persisted.
// That covers both the `fail(500, { form, error })` catch blocks and
// `applyPrivacyPreset`'s semantic `fail(400, { form, error: 'Invalid input' })`,
// which is schema-valid because `presetId` is `.optional()` — a status-only test
// let that one through to `onUpdated`, where it surfaced the client's own
// "Unknown preset" instead of the action's message.
//
// Schema failures are still left alone: they carry `form.valid === false` and must
// reach `onUpdated`'s else branch, which renders the field errors. The two
// predicates live in `$lib/utils/occ-form` because they classify a failure PAYLOAD,
// which is not route-specific; the toast/cancel policy assembled from them is what
// stays local to this page.
function guardSettingsUpdate(event: { result: ActionResult; cancel: () => void }): void {
	surfaceOccConflict(event);
	const { result } = event;
	if (result.type !== 'failure') return;
	// Already surfaced and cancelled above; a second toast would double up.
	if (isOccConflict(result.data)) return;
	if (!isPostValidationFailure(result.data)) return;
	const failure = result.data as { error?: string } | undefined;
	handleFormToast({ error: failure?.error ?? 'Failed to save. Please try again.' });
	event.cancel();
}

// Per-section "last saved" baselines. Each advances ONLY after its own section
// saves successfully (in that form's onUpdated). The unsaved-sections banner and
// the "Current (saved)" preview read these — never the original load snapshot —
// so a save in one OCC group correctly clears just that section's pending state.
// These are deliberate $state snapshots, NOT $derived from `data`: $derived would
// re-track every load and zero out unsavedSectionCount after navigation, defeating
// the per-section unsaved tracking. The state_referenced_locally suppressors are
// intentional — we want the one-time mount snapshot. (A re-load from a concurrent
// external write can leave "Current (saved)" one version behind until the next
// save/navigation; that's cosmetic and OCC catches any real overwrite conflict.)
// svelte-ignore state_referenced_locally
let savedServerWrapped = $state({
	anonymizationMode: data.serverWrappedForm.data.anonymizationMode,
	serverWrappedShareMode: data.serverWrappedForm.data.serverWrappedShareMode
});
// svelte-ignore state_referenced_locally
let savedUserDefaults = $state({
	defaultShareMode: data.userDefaultsForm.data.defaultShareMode,
	allowUserControl: data.userDefaultsForm.data.allowUserControl
});
// svelte-ignore state_referenced_locally
let savedPublicLandingLookup = $state({
	publicLandingLookup: data.publicLandingLookupForm.data.publicLandingLookup
});

// svelte-ignore state_referenced_locally
const serverWrappedForm = superForm(data.serverWrappedForm, {
	resetForm: false,
	invalidateAll: false,
	onUpdate: guardSettingsUpdate,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			savedServerWrapped = {
				anonymizationMode: updated.data.anonymizationMode,
				serverWrappedShareMode: updated.data.serverWrappedShareMode
			};
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: serverWrappedData,
	enhance: serverWrappedEnhance,
	submitting: serverWrappedSubmitting
} = serverWrappedForm;

// svelte-ignore state_referenced_locally
const userDefaultsForm = superForm(data.userDefaultsForm, {
	resetForm: false,
	invalidateAll: false,
	onUpdate: guardSettingsUpdate,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			savedUserDefaults = {
				defaultShareMode: updated.data.defaultShareMode,
				allowUserControl: updated.data.allowUserControl
			};
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: userDefaultsData,
	enhance: userDefaultsEnhance,
	submitting: userDefaultsSubmitting
} = userDefaultsForm;

// svelte-ignore state_referenced_locally
const publicLandingLookupForm = superForm(data.publicLandingLookupForm, {
	resetForm: false,
	invalidateAll: false,
	onUpdate: guardSettingsUpdate,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			savedPublicLandingLookup = {
				publicLandingLookup: updated.data.publicLandingLookup
			};
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: publicLandingLookupData,
	enhance: publicLandingLookupEnhance,
	submitting: publicLandingLookupSubmitting
} = publicLandingLookupForm;

// Fourth form: the "apply preset" write. It owns no controls of its own — the
// preset cards and the Apply button both submit it — and it spans all THREE OCC
// groups, so a successful apply advances every section's baseline AND its
// settingsVersion. See `applyPrivacyPreset` in +page.server.ts for the
// all-or-nothing partial-conflict policy behind the shared version.
// svelte-ignore state_referenced_locally
const presetForm = superForm(data.presetForm, {
	resetForm: false,
	invalidateAll: false,
	onUpdate: guardSettingsUpdate,
	onUpdated({ form: updated }) {
		if (!updated.valid) {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
			return;
		}
		// Unreachable since `guardSettingsUpdate` began cancelling post-validation
		// failures: reaching here with a valid form means the result was a `success`,
		// which proves the action's own `PRIVACY_PRESETS.find` matched. Retained
		// deliberately — the action anticipates an id added to `PRIVACY_PRESET_IDS`
		// without a value-map, and a toast beats `assignPresetValues(undefined)`.
		const applied = PRIVACY_PRESETS.find((candidate) => candidate.id === updated.data.presetId);
		if (!applied) {
			handleFormToast({ error: 'Unknown preset' });
			return;
		}
		// The server wrote all three groups in one transaction, so the staged values
		// ARE the saved values now: advance the stores, the three settingsVersions
		// and all three baselines together. That is what makes the Advanced sections
		// below read as saved rather than staged.
		assignPresetValues(applied.values);
		$serverWrappedData.settingsVersion = updated.data.serverWrappedVersion;
		$userDefaultsData.settingsVersion = updated.data.userDefaultsVersion;
		$publicLandingLookupData.settingsVersion = updated.data.publicLandingLookupVersion;
		savedServerWrapped = {
			anonymizationMode: applied.values.anonymizationMode,
			serverWrappedShareMode: applied.values.serverWrappedShareMode
		};
		savedUserDefaults = {
			defaultShareMode: applied.values.defaultShareMode,
			allowUserControl: applied.values.allowUserControl
		};
		savedPublicLandingLookup = { publicLandingLookup: applied.values.publicLandingLookup };
		customPresetChosen = false;
		// The action keeps its name through the whole flow: the button says "Apply
		// Balanced", so the toast says "Applied the Balanced preset" — not a generic
		// "Saved" that gives no hint which of six cards actually landed.
		handleFormToast({ success: true, message: `Applied the ${applied.label} preset` });
	}
});
const { enhance: presetEnhance, submitting: presetSubmitting } = presetForm;

// The <form> the preset cards submit programmatically. Its hidden inputs are
// rendered from the highlighted card and the three sections' live
// settingsVersions, so a submit always carries current values.
let presetFormEl = $state<HTMLFormElement | null>(null);

let bulkApplyDialogOpen = $state(false);
let isBulkApplying = $state(false);

// Advanced controls stay collapsed until the administrator opens them or stages
// a preset. Public lookup no longer creates a contradictory default state.
let advancedOpen = $state(false);

// ISSUE-007: expanding "Advanced options" can push each section's Save button
// below the fold. On expand only, scroll the freshly-revealed section to the top
// of the viewport (after the DOM settles) so its content + actions stay reachable.
// Collapsing leaves the scroll position alone.
let advancedSectionRef = $state<HTMLDivElement | null>(null);
async function handleAdvancedToggle(open: boolean): Promise<void> {
	if (!open) return;
	await tick();
	advancedSectionRef?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The active preset is matched over the FIVE admin-owned fields only — logoMode
// is excluded (it lives on the Appearance route), so a perfect five-field match
// never reads "Custom" because of a differing persisted logoMode.
let selectedPreset = $derived(
	matchPresetPrivacy({
		anonymizationMode: $serverWrappedData.anonymizationMode,
		defaultShareMode: $userDefaultsData.defaultShareMode,
		serverWrappedShareMode: $serverWrappedData.serverWrappedShareMode,
		publicLandingLookup: $publicLandingLookupData.publicLandingLookup,
		allowUserControl: $userDefaultsData.allowUserControl
	})
);

// Dual preview, both WITHOUT logoMode (so neither renders a logo line — admin
// does not manage logoMode here). "After you save" reflects the staged store
// values; "Current (saved)" reflects each section's last-saved baseline.
let stagedPreview: PrivacyPreviewModel = $derived(
	derivePreview({
		anonymizationMode: $serverWrappedData.anonymizationMode,
		defaultShareMode: $userDefaultsData.defaultShareMode,
		serverWrappedShareMode: $serverWrappedData.serverWrappedShareMode,
		publicLandingLookup: $publicLandingLookupData.publicLandingLookup,
		allowUserControl: $userDefaultsData.allowUserControl
	})
);
let savedPreview: PrivacyPreviewModel = $derived(
	derivePreview({
		anonymizationMode: savedServerWrapped.anonymizationMode,
		defaultShareMode: savedUserDefaults.defaultShareMode,
		serverWrappedShareMode: savedServerWrapped.serverWrappedShareMode,
		publicLandingLookup: savedPublicLandingLookup.publicLandingLookup,
		allowUserControl: savedUserDefaults.allowUserControl
	})
);

// Per-section divergence: staged store value vs. that section's own last-saved
// baseline. The banner counts how many sections still need their Save button.
let serverWrappedUnsaved = $derived(
	$serverWrappedData.anonymizationMode !== savedServerWrapped.anonymizationMode ||
		$serverWrappedData.serverWrappedShareMode !== savedServerWrapped.serverWrappedShareMode
);
let userDefaultsUnsaved = $derived(
	$userDefaultsData.defaultShareMode !== savedUserDefaults.defaultShareMode ||
		$userDefaultsData.allowUserControl !== savedUserDefaults.allowUserControl
);
let publicLandingUnsaved = $derived(
	$publicLandingLookupData.publicLandingLookup !== savedPublicLandingLookup.publicLandingLookup
);
let unsavedSectionCount = $derived(
	(serverWrappedUnsaved ? 1 : 0) + (userDefaultsUnsaved ? 1 : 0) + (publicLandingUnsaved ? 1 : 0)
);

// Sticky "the admin explicitly clicked the Custom card" flag. While set, Custom
// stays highlighted even when the staged values happen to match a shipped preset
// — which on this route is simply "the admin clicked Custom while their saved
// configuration still matches a preset", since the click stages nothing.
// Cleared by clicking any of the five real cards.
let customPresetChosen = $state(false);

// The card that renders as selected: the sticky Custom flag, otherwise the
// five-field match over the live store values. Always a card.
//
// NOT interaction-gated. This route used to reuse onboarding's resolver together
// with a session-scoped "has the admin touched anything yet" flag, so an
// untouched `'custom'` selected nothing at all — and on the admin route
// "untouched" means "this is the configuration the administrator saved". Every
// page load of an off-preset configuration therefore rendered six cards with
// `aria-checked="false"`, and the roving tab stop fell back to the first card.
// Suppressing an untouched `'custom'` is an onboarding-only rule about
// fresh-install seeds (ISSUE-001); see `resolvePersistedPresetSelection`.
let selectedPresetCard = $derived(
	resolvePersistedPresetSelection(selectedPreset, customPresetChosen)
);

// Staging the five admin-owned fields across the three stores. NEVER touches
// logoMode — that lives on the Appearance route and its own OCC group.
function assignPresetValues(values: Pick<PrivacyPresetValues, PrivacyPresetPrivacyKey>) {
	$serverWrappedData.anonymizationMode = values.anonymizationMode;
	$serverWrappedData.serverWrappedShareMode = values.serverWrappedShareMode;
	$userDefaultsData.defaultShareMode = values.defaultShareMode;
	$userDefaultsData.allowUserControl = values.allowUserControl;
	$publicLandingLookupData.publicLandingLookup = values.publicLandingLookup;
}

/**
 * Whether a preset interaction also PERSISTS.
 *
 * `persist` is what a card click (mouse, Enter, Space) and the explicit Apply
 * button use: one `?/applyPrivacyPreset` POST writes all five fields across the
 * three OCC groups atomically, so nothing is left staged. The POST is still
 * skipped when it would write values that are already persisted — see
 * `presetMatchesSaved` below.
 *
 * `stage-only` is what the roving-tabindex ARROW keys use. An APG radiogroup moves
 * its selection as focus moves, and firing one three-section write per ArrowRight
 * would be absurd; the arrows stage, and the Apply button commits what they landed
 * on. That is also why the button is not redundant with the cards.
 */
type PresetCommit = 'persist' | 'stage-only';

/**
 * Whether `preset` is EXACTLY what the three per-section baselines already hold,
 * i.e. whether applying it would write values that are already persisted.
 *
 * Read from the saved baselines rather than the staged stores, so a card that
 * has only staged still counts as "not saved yet". Shared by the Apply button's
 * enablement and by the card-click path, because those two must never disagree
 * about whether there is anything to write.
 */
function presetMatchesSaved(preset: PrivacyPreset): boolean {
	return (
		matchPresetPrivacy({
			anonymizationMode: savedServerWrapped.anonymizationMode,
			defaultShareMode: savedUserDefaults.defaultShareMode,
			serverWrappedShareMode: savedServerWrapped.serverWrappedShareMode,
			publicLandingLookup: savedPublicLandingLookup.publicLandingLookup,
			allowUserControl: savedUserDefaults.allowUserControl
		}) === preset.id
	);
}

async function applyPrivacyPreset(preset: PrivacyPreset, commit: PresetCommit = 'persist') {
	// The in-flight guard comes BEFORE any mutation. An apply already writing all
	// three groups rewrites the stores and clears `customPresetChosen` from its own
	// response, so staging another card underneath it only flickers the highlight
	// and the "After you save" preview before snapping back to what that apply
	// wrote — a click that visibly did nothing.
	if ($presetSubmitting) return;
	customPresetChosen = false;
	assignPresetValues(preset.values);
	if (commit === 'stage-only') return;
	// A card click on the preset that is ALREADY persisted has nothing to write.
	// Submitting anyway would stamp a strictly-advancing `updatedAt` on all three
	// OCC groups (see `setPrivacyPresetAtomic`), 409-ing every other admin tab over
	// a write that changed no value. This is the same condition the Apply button
	// disables itself on, and `presetApplyStatus` already says "… is the saved
	// configuration", so the skip is explained rather than silent. The staging
	// above still ran, which is what reverts unsaved Advanced edits back to the
	// card the admin just clicked.
	if (presetMatchesSaved(preset)) return;
	// Let the staged values reach `presetIdToSubmit`'s hidden input before the
	// native submit reads the form. (No state-in-$effect: this is an explicit user
	// action, respecting the file's no-effect-writes rule.)
	await tick();
	presetFormEl?.requestSubmit();
}

// Custom is a pure highlight change on this route: it stages NOTHING. Seeding
// Balanced through `customPresetSeedValues` — onboarding's rule — would silently
// overwrite the administrator's saved privacy settings, because on this route an
// off-preset configuration is real persisted state rather than an untouched
// fresh-install seed. Admins who do want that baseline click the Balanced card,
// which sits in the same radiogroup.
// Advanced is still expanded — Custom's whole point is the controls below it, and
// the only way to reach an off-preset configuration is to edit them and save that
// section. Custom therefore also has nothing for the Apply button to write.
function selectCustomPreset() {
	// Same in-flight rule as the shipped cards: a running apply clears
	// `customPresetChosen` in its own `onUpdated`, so highlighting Custom
	// underneath it would only be undone.
	if ($presetSubmitting) return;
	customPresetChosen = true;
	advancedOpen = true;
}

// Use the same APG roving-tabindex radio pattern as onboarding: the selected
// card is the single Tab stop. A card is always selected on this route (the
// selection is derived straight from the live values), so the group's tab stop
// always lands on it. The Custom card occupies the final index
// (PRIVACY_PRESETS.length).
let presetButtons = $state<(HTMLButtonElement | null)[]>([]);

const CUSTOM_PRESET_INDEX = PRIVACY_PRESETS.length;

// Called by the roving-tabindex ARROW keys only, so every branch stages without
// writing: `applyPrivacyPreset(preset, 'stage-only')` for a shipped preset and
// `selectCustomPreset()` — which stages nothing at all — for the Custom slot.
//
// Returns false while an apply is in flight, because both of those refuse to move
// the selection then. Reporting that refusal keeps the roving tab stop on the
// still-selected card instead of letting focus desync from `aria-checked`.
function selectPresetAtIndex(index: number): boolean {
	if ($presetSubmitting) return false;
	if (index === CUSTOM_PRESET_INDEX) {
		selectCustomPreset();
		return true;
	}
	const preset = PRIVACY_PRESETS[index];
	if (!preset) return false;
	applyPrivacyPreset(preset, 'stage-only');
	return true;
}

// What the explicit Apply button would write: the highlighted card resolved to a
// shipped preset. `null` for the Custom card, which has no value-map by
// definition and therefore nothing to apply.
let applicablePreset = $derived(
	PRIVACY_PRESETS.find((preset) => preset.id === selectedPresetCard) ?? null
);

// Whether the highlighted preset is ALREADY what is persisted. Read from the
// per-section saved baselines, not the staged stores, so the button is enabled
// exactly when applying would change something on the server — which is what keeps
// it from feeling like a duplicate of the card click that just persisted.
let applicablePresetIsSaved = $derived(
	applicablePreset !== null && presetMatchesSaved(applicablePreset)
);

let canApplyPreset = $derived(
	applicablePreset !== null && !applicablePresetIsSaved && !$presetSubmitting
);

// The submitted preset id. Empty for Custom, which also disables the button —
// the action's Zod enum rejects it anyway.
let presetIdToSubmit = $derived(applicablePreset?.id ?? '');

// One line that states the truth about the selection relative to what is saved.
// This is the whole reason the Apply button reads as deliberate rather than
// redundant: it always says why it is or is not available.
let presetApplyStatus = $derived.by(() => {
	if ($presetSubmitting) return 'Applying to all three sections…';
	if (selectedPresetCard === 'custom') {
		return 'Custom has no values of its own. Set the controls in Advanced options, then save that section.';
	}
	// Unreachable: `selectedPresetCard` is always a card, and the 'custom' arm
	// returned above. Kept because `.find()` is typed `| undefined` and the two
	// lines below read `applicablePreset.label`.
	if (!applicablePreset) return 'Pick a preset to save it across all three sections at once.';
	if (applicablePresetIsSaved) return `${applicablePreset.label} is the saved configuration.`;
	return `${applicablePreset.label} is selected but not saved yet.`;
});

let presetTabIndex = $derived.by(() => {
	if (selectedPresetCard === 'custom') return CUSTOM_PRESET_INDEX;
	const i = PRIVACY_PRESETS.findIndex((p) => p.id === selectedPresetCard);
	// `-1` is unreachable — a non-'custom' selection is always a shipped id — but
	// falling back to the first card keeps the group Tab-reachable regardless.
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
</script>

<svelte:head>
	<title>Privacy - Settings - Obzorarr</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	{#snippet tipDt(key: PrivacyPreviewRowKey, label: string)}
		{@const tip = PRIVACY_PREVIEW_ROW_TOOLTIPS[key]}
		<dt class="text-muted-foreground">
			<Tooltip.Root>
				<Tooltip.Trigger
					class="inline-flex items-center gap-1 rounded text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{label}
					<InfoIcon class="size-3 shrink-0 opacity-70" aria-hidden="true" />
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
		<dd class="text-right font-medium">
			<Tooltip.Root>
				<Tooltip.Trigger
					class="inline-flex items-center gap-1 rounded text-right font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{label}
					<InfoIcon class="size-3 shrink-0 opacity-70" aria-hidden="true" />
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

	{#snippet previewRows(model: PrivacyPreviewModel)}
		<dl class="space-y-1.5 text-sm">
			<div class="flex justify-between gap-3">
				{@render tipDt('namesInStats', 'Names in stats')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.namesInStats[model.nameDisplay],
					PREVIEW_NAME_DISPLAY_LABELS[model.nameDisplay]
				)}
			</div>
			<div class="flex justify-between gap-3">
				{@render tipDt('newUserDefault', 'New-user default')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.newUserDefault[model.perUserDefaultForNewUsers],
					PREVIEW_PER_USER_DEFAULT_LABELS[model.perUserDefaultForNewUsers]
				)}
			</div>
			<div class="flex justify-between gap-3">
				{@render tipDt('serverWideRecap', 'Server-wide recap')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.serverWideRecap[model.serverRecapVisibility],
					PREVIEW_RECAP_VISIBILITY_LABELS[model.serverRecapVisibility]
				)}
			</div>
			<div class="flex justify-between gap-3">
				{@render tipDt('landingLookupForm', 'Landing lookup form')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.landingLookupForm[model.landingLookupForm],
					model.landingLookupForm === 'visible' ? 'Shown' : 'Hidden'
				)}
			</div>
		</dl>
	{/snippet}

	<Card>
		<CardHeader>
			<CardTitle>Privacy presets</CardTitle>
			<CardDescription>
				A preset is one privacy posture. Picking a card saves all five fields it owns across the
				three sections below in one write. The Save buttons down there are only for hand-editing a
				single field. The full onboarding presets also set the Wrapped logo to Always Show; this
				page does not.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- `aria-busy` rather than `disabled` on the cards: every handler below
			     refuses to move the selection while an apply is in flight, and the
			     native attribute would drop the card out of the tab order and break
			     the single roving tab stop `presetTabIndex` maintains. -->
			<div
				class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
				role="radiogroup"
				aria-label="Privacy preset"
				aria-busy={$presetSubmitting}
			>
				{#each PRIVACY_PRESETS as preset, i (preset.id)}
					{@const PresetIcon = presetIcons[preset.id]}
					<!-- biome-ignore lint/a11y/useSemanticElements: These rich radio cards implement the radiogroup keyboard pattern. -->
<button
						bind:this={presetButtons[i]}
						type="button"
						role="radio"
						aria-checked={selectedPresetCard === preset.id}
						tabindex={i === presetTabIndex ? 0 : -1}
						onclick={() => applyPrivacyPreset(preset)}
						onkeydown={(event) => handlePresetKeydown(event, i)}
						class={selectedPresetCard === preset.id
						? 'flex flex-col items-start gap-2 rounded-lg border border-primary bg-primary/5 p-4 text-left ring-1 ring-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
						: 'flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'}
						>
						<span class="flex items-center gap-2 text-sm font-medium">
							<PresetIcon class="size-4 text-primary" />
							{preset.label}
						</span>
						<span class="text-xs text-muted-foreground">{preset.description}</span>
						<span class="text-xs font-medium text-primary/80">{preset.exposureSummary}</span>
					</button>
				{/each}
				<!-- Sixth card: client-only "Custom". Rendered outside the {#each} so
				     PRIVACY_PRESETS stays exactly the five shipped value-maps. It holds the
				     final roving-tabindex slot (CUSTOM_PRESET_INDEX) and carries no
				     exposureSummary — the Preview card below already states what the staged
				     fields expose. -->
				<!-- biome-ignore lint/a11y/useSemanticElements: These rich radio cards implement the radiogroup keyboard pattern. -->
<button
					bind:this={presetButtons[CUSTOM_PRESET_INDEX]}
					type="button"
					role="radio"
					aria-checked={selectedPresetCard === 'custom'}
					tabindex={CUSTOM_PRESET_INDEX === presetTabIndex ? 0 : -1}
					onclick={selectCustomPreset}
					onkeydown={(event) => handlePresetKeydown(event, CUSTOM_PRESET_INDEX)}
					class={selectedPresetCard === 'custom'
					? 'flex flex-col items-start gap-2 rounded-lg border border-primary bg-primary/5 p-4 text-left ring-1 ring-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
					: 'flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'}
					>
					<span class="flex items-center gap-2 text-sm font-medium">
						<SlidersHorizontalIcon class="size-4 text-primary" />
						{CUSTOM_PRIVACY_PRESET.label}
					</span>
					<span class="text-xs text-muted-foreground">{CUSTOM_PRIVACY_PRESET.description}</span>
				</button>
			</div>
			{#if selectedPreset === 'custom'}
				<p class="text-sm italic text-muted-foreground">
					Custom configuration: your settings don’t match a preset.
				</p>
			{/if}
			<!-- The commit surface. A card click already submits this form; the button is
			     the deliberate, visible route for the keyboard path (arrow keys move the
			     radiogroup selection without writing) and for re-applying after an
			     Advanced edit landed on a preset. Its status line states why it is or is
			     not available, so the two affordances never read as duplicates. -->
			<form
				method="POST"
				action="?/applyPrivacyPreset"
				bind:this={presetFormEl}
				use:presetEnhance
			>
				<input type="hidden" name="presetId" value={presetIdToSubmit} />
				<input
					type="hidden"
					name="serverWrappedVersion"
					value={$serverWrappedData.settingsVersion}
				/>
				<input type="hidden" name="userDefaultsVersion" value={$userDefaultsData.settingsVersion} />
				<input
					type="hidden"
					name="publicLandingLookupVersion"
					value={$publicLandingLookupData.settingsVersion}
				/>
				<SettingsActionBar align="between">
					<!-- Described-by rather than a live region: the status changes on every
					     arrow-key move through the radiogroup, and an aria-live line would
					     talk over the card being announced. As a description it instead
					     gives the (often disabled) button its reason. -->
					<p id="preset-apply-status" class="text-xs text-muted-foreground">
						{presetApplyStatus}
					</p>
					<Button
						type="submit"
						class="tap-target"
						disabled={!canApplyPreset}
						aria-describedby="preset-apply-status"
					>
						{#if $presetSubmitting}
							Applying…
						{:else if applicablePreset}
							Apply {applicablePreset.label}
						{:else}
							Apply preset
						{/if}
					</Button>
				</SettingsActionBar>
			</form>
			<div class="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
				<ImageIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div class="space-y-1">
					<p class="font-medium">Wrapped logo</p>
					<p class="text-muted-foreground">
						Every shipped preset uses Always Show. This admin page does not change Appearance
						settings, so confirm the current value under
						<a
							href="/admin/settings/appearance"
							class="inline-flex items-center gap-1 underline"
						>Appearance<ExternalLinkIcon class="size-3" /></a>.
					</p>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Preview</CardTitle>
			<CardDescription>
				What your saved and staged settings expose. Logo is managed on Appearance and is not shown here.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if unsavedSectionCount > 0}
				<Alert>
					<TriangleAlertIcon />
					<AlertDescription>
						{unsavedSectionCount} unsaved section{unsavedSectionCount === 1 ? '' : 's'}. Staged changes
						aren't live yet.
						{#if applicablePreset}
							Apply {applicablePreset.label} above to save all of them at once, or save each section
							below.
						{:else}
							Save each section below.
						{/if}
					</AlertDescription>
				</Alert>
			{/if}
			<Tooltip.Provider delayDuration={150}>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 rounded-lg border border-border p-4">
						<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current (saved)</p>
						{@render previewRows(savedPreview)}
					</div>
					<div
						class={unsavedSectionCount > 0
							? 'space-y-2 rounded-lg border border-primary bg-primary/5 p-4'
							: 'space-y-2 rounded-lg border border-border p-4'}
					>
						<p class="text-xs font-semibold uppercase tracking-wide text-primary/80">After you save</p>
						{@render previewRows(stagedPreview)}
					</div>
				</div>
			</Tooltip.Provider>
		</CardContent>
	</Card>

	<div bind:this={advancedSectionRef}>
	<Collapsible.Root bind:open={advancedOpen} onOpenChange={handleAdvancedToggle} class="space-y-6">
		<Collapsible.Trigger
			class="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
		>
			<span class="flex items-center gap-2">
				Advanced options
			</span>
			<ChevronDownIcon class={advancedOpen ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} />
		</Collapsible.Trigger>
		<Collapsible.Content class="space-y-6 pt-6">
	<Card>
		<CardHeader>
			<CardTitle>Server-wide wrapped sharing</CardTitle>
			<CardDescription>
				Controls anonymization and the share mode for the aggregate server-wide /wrapped recap
				only. It does NOT change who can view individual users' personal Wrapped pages; the
				per-user default share mode below does that.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateServerWrappedSettings"
				use:serverWrappedEnhance
				class="space-y-4"
			>
				<Form.Field form={serverWrappedForm} name="anonymizationMode">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Anonymization mode</Form.Label>
							<RadioGroup bind:value={$serverWrappedData.anonymizationMode} {...props}>
								{#each data.anonymizationOptions as opt (opt.value)}
									<SettingsOptionCard title={opt.label} description={opt.description}>
										{#snippet control()}
											<RadioGroupItem value={opt.value} />
										{/snippet}
										{#snippet icon()}
											{#if opt.value === 'anonymous'}
												<EyeOffIcon />
											{:else if opt.value === 'hybrid'}
												<ShieldUserIcon />
											{:else}
												<UsersIcon />
											{/if}
										{/snippet}
									</SettingsOptionCard>
								{/each}
							</RadioGroup>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field form={serverWrappedForm} name="serverWrappedShareMode">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Server-wide share mode</Form.Label>
							<RadioGroup bind:value={$serverWrappedData.serverWrappedShareMode} {...props}>
								{#each data.serverWrappedShareModeOptions as opt (opt.value)}
									<SettingsOptionCard title={opt.label} description={opt.description}>
										{#snippet control()}
											<RadioGroupItem value={opt.value} />
										{/snippet}
										{#snippet icon()}
											{#if opt.value === 'public'}
												<GlobeIcon />
											{:else}
												<LockIcon />
											{/if}
										{/snippet}
									</SettingsOptionCard>
								{/each}
							</RadioGroup>
						{/snippet}
					</Form.Control>
					<Form.Description>
						Private-link is not supported for the server-wide wrapped surface.
					</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$serverWrappedData.settingsVersion}
				/>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$serverWrappedSubmitting}>
						{$serverWrappedSubmitting ? 'Saving…' : 'Save server-wide settings'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Public landing lookup</CardTitle>
			<CardDescription>{publicLandingLookupCopy.helper}</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updatePublicLandingLookup"
				use:publicLandingLookupEnhance
				class="space-y-4"
			>
				<input
					type="hidden"
					name="publicLandingLookup"
					value={$publicLandingLookupData.publicLandingLookup ? 'true' : 'false'}
				/>
				<SettingsToggleRow
					id="public-landing-lookup-toggle"
					title={publicLandingLookupCopy.label}
					description={$publicLandingLookupData.publicLandingLookup
						? publicLandingLookupCopy.enabledDescription
						: publicLandingLookupCopy.disabledDescription}
					onLabel="Public lookup on"
					offLabel="Sign-in required"
					bind:checked={$publicLandingLookupData.publicLandingLookup}
				>
					{#snippet icon()}
						<GlobeIcon />
					{/snippet}
				</SettingsToggleRow>

				<Alert>
					<GlobeIcon />
					<AlertDescription>
						{publicLandingLookupCopy.protectedBoundary}
						{publicLandingLookupCopy.privateOutcome}
					</AlertDescription>
				</Alert>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$publicLandingLookupData.settingsVersion}
				/>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$publicLandingLookupSubmitting}>
						{$publicLandingLookupSubmitting ? 'Saving…' : 'Save public lookup'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>User sharing defaults</CardTitle>
			<CardDescription>
				Default share mode for newly-created users, and whether users can change their own
				share settings. This default is also the privacy floor for every user's personal
				Wrapped page. Raise or lower it here, not via the server-wide recap control above, to
				change who can view personal Wrapped pages.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateUserDefaults"
				use:userDefaultsEnhance
				class="space-y-4"
			>
				<Form.Field form={userDefaultsForm} name="defaultShareMode">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Default share mode</Form.Label>
							<RadioGroup bind:value={$userDefaultsData.defaultShareMode} {...props}>
								{#each data.shareModeOptions as opt (opt.value)}
									<SettingsOptionCard title={opt.label} description={opt.description}>
										{#snippet control()}
											<RadioGroupItem value={opt.value} />
										{/snippet}
										{#snippet icon()}
											{#if opt.value === 'public'}
												<GlobeIcon />
											{:else if opt.value === 'private-link'}
												<LinkIcon />
											{:else}
												<ShieldUserIcon />
											{/if}
										{/snippet}
									</SettingsOptionCard>
								{/each}
							</RadioGroup>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field form={userDefaultsForm} name="allowUserControl">
					<Form.Control>
						{#snippet children({ props })}
							<input
								type="hidden"
								name="allowUserControl"
								value={$userDefaultsData.allowUserControl ? 'true' : 'false'}
							/>
							<SettingsToggleRow
								id="allow-user-control-toggle"
								title="Allow users to change their share settings"
								description="When off, only administrators can change a user's share mode."
								onLabel="Users can edit"
								offLabel="Admin only"
								ariaDescribedby={props['aria-describedby']}
								ariaInvalid={props['aria-invalid']}
								bind:checked={$userDefaultsData.allowUserControl}
							>
								{#snippet icon()}
									<UserCogIcon />
								{/snippet}
							</SettingsToggleRow>
						{/snippet}
					</Form.Control>
					<Form.Description>
						{shareDefaultCopy.summary} {shareDefaultCopy.explicitRows} Use the explicit bulk action
						below for default-managed existing rows, or manage an individual user on the
						<a href="/admin/users" class="underline">Users</a> page.
					</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$userDefaultsData.settingsVersion}
				/>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$userDefaultsSubmitting}>
						{$userDefaultsSubmitting ? 'Saving…' : 'Save user defaults'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>
		</Collapsible.Content>
	</Collapsible.Root>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Apply defaults to existing users</CardTitle>
			<CardDescription>{shareDefaultCopy.bulkApply}</CardDescription>
		</CardHeader>
		<CardContent>
			<SettingsActionBar>
				<Button
					variant="outline"
					class="tap-target"
					onclick={() => (bulkApplyDialogOpen = true)}
					disabled={isBulkApplying}
				>
					<UsersIcon />
					Apply defaults to managed users
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={bulkApplyDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Apply defaults to default-managed users?</AlertDialog.Title>
			<AlertDialog.Description>
				{shareDefaultCopy.bulkApply} The result reports how many rows were updated and skipped.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<!-- `tap-target` on BOTH footer buttons: the 44px min-size utility on the
			     Action alone made it visibly taller than a bare 36px Cancel. -->
			<AlertDialog.Cancel class="tap-target" disabled={isBulkApplying}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/bulkApplyShareDefaults"
				use:enhance={({ cancel }) => {
					if (isBulkApplying) {
						cancel();
						return;
					}
					isBulkApplying = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								await invalidateAll();
							}
						} finally {
							isBulkApplying = false;
							bulkApplyDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" class="tap-target" disabled={isBulkApplying}>
					{isBulkApplying ? 'Applying…' : 'Apply managed defaults'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
