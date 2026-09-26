<script lang="ts">
import Pencil from '@lucide/svelte/icons/pencil';
import Plus from '@lucide/svelte/icons/plus';
import SparklesIcon from '@lucide/svelte/icons/sparkles';
import Trash2 from '@lucide/svelte/icons/trash-2';
import { untrack } from 'svelte';
import { enhance } from '$app/forms';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import type { SlideType } from '$lib/components/slides/types';
import { DEFAULT_SLIDE_ORDER } from '$lib/components/slides/types';
import { Button } from '$lib/components/ui/button';
import { handleFormToast } from '$lib/utils/form-toast';
import { submitAction } from '$lib/utils/submit-action';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

$effect(() => {
	handleFormToast(form);
});

// ISSUE-016: surface fieldErrors next to the offending input — the toast alone
// only reported "Validation failed", which left the user guessing which field
// was over the 200-char limit. Mirrors the pattern used in admin/settings.
const slideFieldErrors = $derived(
	form && 'fieldErrors' in form
		? ((form as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors ?? undefined)
		: undefined
);

// ISSUE-003: slideFieldErrors is derived from the page-level `form` action data,
// which survives until the next POST — so a validation error stayed stuck after
// the user corrected the content or reopened the dialog. Gate visibility behind a
// local dismissal flag: dismiss on content edit and on each dialog (re)open, and
// re-arm on a fresh failed submit so genuine new errors still surface.
let fieldErrorsDismissed = $state(false);
const visibleFieldErrors = $derived(fieldErrorsDismissed ? undefined : slideFieldErrors);

const SLIDE_NAMES: Record<SlideType, string> = {
	'total-time': 'Total Watch Time',
	'top-movies': 'Top Movies',
	'top-shows': 'Top Shows',
	genres: 'Genre Breakdown',
	distribution: 'Viewing Distribution',
	percentile: 'Percentile / Top Contributors',
	binge: 'Longest Binge',
	'first-last': 'First & Last Watch',
	'weekday-patterns': 'Weekday Patterns',
	'content-type': 'Content Type',
	decade: 'Content Era',
	'series-completion': 'Series Progress',
	rewatch: 'Rewatched Content',
	marathon: 'Marathon Day',
	streak: 'Watching Streak',
	'year-comparison': 'Year Comparison',
	custom: 'Custom Slide'
};

// Keep local radio edits stable until the server confirms a new frequency value.
let selectedFrequencyMode = $state<typeof data.funFactFrequency.mode>(
	untrack(() => data.funFactFrequency.mode)
);
let customCount = $state(untrack(() => data.funFactFrequency.count));
let syncedFrequencyKey = $state(
	untrack(() => `${data.funFactFrequency.mode}:${data.funFactFrequency.count}`)
);

// Avoid resetting the radio while the user is selecting Custom before submit.
$effect(() => {
	const frequencyKey = `${data.funFactFrequency.mode}:${data.funFactFrequency.count}`;
	if (frequencyKey === syncedFrequencyKey) return;

	selectedFrequencyMode = data.funFactFrequency.mode;
	customCount = data.funFactFrequency.count;
	syncedFrequencyKey = frequencyKey;
});

let showEditor = $state(false);
let editingSlide = $state<(typeof data.customSlides)[0] | null>(null);
let editorTitle = $state('');
let editorContent = $state('');
let editorYear = $state<number | null>(null);
let editorEnabled = $state(true);
let previewHtml = $state('');
let previewError = $state('');
let previewRendered = $state(false);
let editorTriggerRef: HTMLElement | null = null;
let editorTitleInputRef: HTMLInputElement | null = $state(null);
let editorModalRef: HTMLElement | null = $state(null);

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

function getEditorFocusableElements(): HTMLElement[] {
	if (!editorModalRef) return [];
	return Array.from(editorModalRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) => element.tabIndex >= 0 && element.getClientRects().length > 0
	);
}

function trapEditorFocus(event: KeyboardEvent) {
	if (event.key !== 'Tab') return;

	const focusableElements = getEditorFocusableElements();
	if (focusableElements.length === 0) {
		event.preventDefault();
		editorModalRef?.focus();
		return;
	}

	const first = focusableElements[0];
	const last = focusableElements.at(-1);
	const activeElement = document.activeElement;

	if (event.shiftKey && (activeElement === first || !editorModalRef?.contains(activeElement))) {
		event.preventDefault();
		last?.focus();
	} else if (
		!event.shiftKey &&
		(activeElement === last || !editorModalRef?.contains(activeElement))
	) {
		event.preventDefault();
		first?.focus();
	}
}

$effect(() => {
	if (!showEditor) return;
	const handler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeEditor();
			return;
		}
		trapEditorFocus(e);
	};
	document.addEventListener('keydown', handler);
	queueMicrotask(() => editorTitleInputRef?.focus());
	return () => document.removeEventListener('keydown', handler);
});

let deletingSlideId = $state<number | null>(null);

let draggedIndex = $state<number | null>(null);
let dragOverIndex = $state<number | null>(null);

type UnifiedSlideItem =
	| { kind: 'builtin'; slideType: string; enabled: boolean; sortOrder: number }
	| {
			kind: 'custom';
			id: number;
			title: string;
			enabled: boolean;
			sortOrder: number;
			year: number | null;
			content: string;
			renderedHtml?: string;
	  };

const unifiedSlides = $derived.by(() => {
	const items: UnifiedSlideItem[] = [];

	for (const config of data.configs) {
		if (DEFAULT_SLIDE_ORDER.includes(config.slideType as SlideType)) {
			items.push({
				kind: 'builtin',
				slideType: config.slideType,
				enabled: config.enabled,
				sortOrder: config.sortOrder
			});
		}
	}

	for (const custom of data.customSlides) {
		items.push({
			kind: 'custom',
			id: custom.id,
			title: custom.title,
			enabled: custom.enabled,
			sortOrder: custom.sortOrder,
			year: custom.year,
			content: custom.content,
			renderedHtml: custom.renderedHtml
		});
	}

	return items.sort((a, b) => a.sortOrder - b.sortOrder);
});

function openNewEditor() {
	editorTriggerRef = (document.activeElement as HTMLElement) ?? null;
	editingSlide = null;
	editorTitle = '';
	editorContent = '';
	editorYear = null;
	editorEnabled = true;
	previewHtml = '';
	previewError = '';
	previewRendered = false;
	// Dismiss any stale validation errors carried by `form` from a prior submit.
	fieldErrorsDismissed = true;
	showEditor = true;
}

function openEditEditor(slide: (typeof data.customSlides)[0]) {
	editorTriggerRef = (document.activeElement as HTMLElement) ?? null;
	editingSlide = slide;
	editorTitle = slide.title;
	editorContent = slide.content;
	editorYear = slide.year;
	editorEnabled = slide.enabled;
	previewHtml = slide.renderedHtml ?? '';
	previewError = '';
	previewRendered = typeof slide.renderedHtml === 'string';
	// Dismiss any stale validation errors carried by `form` from a prior submit.
	fieldErrorsDismissed = true;
	showEditor = true;
}

function closeEditor() {
	showEditor = false;
	editingSlide = null;
	const trigger = editorTriggerRef;
	editorTriggerRef = null;
	queueMicrotask(() => trigger?.focus());
}

function handleDragStart(index: number) {
	draggedIndex = index;
}

function handleDragOver(event: DragEvent, index: number) {
	event.preventDefault();
	dragOverIndex = index;
}

function handleDragEnd() {
	draggedIndex = null;
	dragOverIndex = null;
}

type SlideOrderEntry = { type: 'builtin'; id: string } | { type: 'custom'; id: number };

function submitReorder(newOrder: SlideOrderEntry[]) {
	const form = document.getElementById('reorder-form') as HTMLFormElement | null;
	const orderInput = form?.querySelector('input[name="order"]') as HTMLInputElement | null;
	if (!form || !orderInput) return;
	orderInput.value = JSON.stringify(newOrder);
	form.requestSubmit();
}

// Drag-and-drop alone is not keyboard-operable, so keyboard buttons share the
// same reorder path (ISSUE-010 a11y).
function moveSlide(fromIndex: number, toIndex: number) {
	if (toIndex < 0 || toIndex >= unifiedSlides.length || fromIndex === toIndex) return;
	const newOrder: SlideOrderEntry[] = unifiedSlides.map((item) =>
		item.kind === 'builtin'
			? { type: 'builtin' as const, id: item.slideType }
			: { type: 'custom' as const, id: item.id }
	);
	const [moved] = newOrder.splice(fromIndex, 1);
	if (!moved) return;
	newOrder.splice(toIndex, 0, moved);
	submitReorder(newOrder);
}

function reorderItemLabel(item: UnifiedSlideItem): string {
	if (item.kind === 'builtin') {
		return SLIDE_NAMES[item.slideType as SlideType] ?? item.slideType;
	}
	return item.title.trim().length > 0 ? item.title : 'Untitled custom slide';
}

function handleDrop(event: DragEvent, dropIndex: number) {
	event.preventDefault();
	if (draggedIndex === null || draggedIndex === dropIndex) return;
	moveSlide(draggedIndex, dropIndex);
	handleDragEnd();
}

function getCustomSlideForEdit(item: UnifiedSlideItem) {
	if (item.kind !== 'custom') return null;
	return data.customSlides.find((s) => s.id === item.id) ?? null;
}
</script>

<svelte:head>
	<title>Slides - Admin - Obzorarr</title>
</svelte:head>

<div class="admin-container">
	<div class="admin-page-content" inert={showEditor} aria-hidden={showEditor ? 'true' : undefined}>
		<header class="admin-header">
			<h1>Slide Configuration</h1>
			<p class="subtitle">Manage slides for Year in Review presentations</p>
		</header>

		<section class="section">
			<div class="section-header">
				<div class="section-title-content">
					<h2>Slide Order</h2>
					<p class="section-description">
						Drag and drop, or use the move up/down buttons, to reorder. Toggle a row to enable or
						disable that slide.
					</p>
				</div>
				<Button type="button" class="add-button tap-target" onclick={openNewEditor}>
					<Plus class="add-button-icon" />
					Add Custom Slide
				</Button>
			</div>

			<form id="reorder-form" method="POST" action="?/reorder" use:enhance>
				<input type="hidden" name="order" value="">
			</form>

			<!-- The explicit list role preserves list semantics in Safari when list styling is removed. -->
			<ul class="slide-list" role="list">
				{#each unifiedSlides as item, index (item.kind === 'builtin' ? item.slideType : `custom-${item.id}`)}
					<!-- The explicit listitem role accompanies the styled list for assistive technology. -->
					<li
						class="slide-item"
						class:dragging={draggedIndex === index}
						class:drag-over={dragOverIndex === index}
						class:is-custom={item.kind === 'custom'}
						draggable="true"
						ondragstart={() => handleDragStart(index)}
						ondragover={(e) => handleDragOver(e, index)}
						ondragend={handleDragEnd}
						ondrop={(e) => handleDrop(e, index)}
						role="listitem"
					>
						<div class="reorder-controls">
							<button
								type="button"
								class="move-button tap-target"
								onclick={() => moveSlide(index, index - 1)}
								disabled={index === 0}
								aria-label={`Move ${reorderItemLabel(item)} up`}
							>
								<span aria-hidden="true">▲</span>
							</button>
							<span class="drag-handle" aria-hidden="true">⋮⋮</span>
							<button
								type="button"
								class="move-button tap-target"
								onclick={() => moveSlide(index, index + 1)}
								disabled={index === unifiedSlides.length - 1}
								aria-label={`Move ${reorderItemLabel(item)} down`}
							>
								<span aria-hidden="true">▼</span>
							</button>
						</div>

						{#if item.kind === 'builtin'}
							<span class="slide-name">
								{SLIDE_NAMES[item.slideType as SlideType] ?? item.slideType}
							</span>

							<form method="POST" action="?/toggleSlide" use:enhance class="toggle-form">
								<input type="hidden" name="slideType" value={item.slideType}>
								<SubmitButton
									class={`toggle-button tap-target ${item.enabled ? 'enabled' : ''}`}
									aria-pressed={item.enabled}
									aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${SLIDE_NAMES[item.slideType as SlideType] ?? item.slideType} slide`}
								>
									{#snippet children()}
										{item.enabled ? 'Enabled' : 'Disabled'}
									{/snippet}
								</SubmitButton>
							</form>
						{:else}
							<div class="slide-name-group">
								{#if item.title.trim().length > 0}
									<span class="slide-name" title={item.title}>{item.title}</span>
								{:else}
									<span class="slide-name slide-name-untitled">Untitled custom slide</span>
								{/if}
								<span class="custom-badge">Custom</span>
								{#if item.year}
									<span class="year-badge">{item.year}</span>
								{/if}
							</div>

							<div class="slide-actions">
								<Button
									type="button"
									class="action-button edit-action tap-target"
									onclick={() => {
	const slide = getCustomSlideForEdit(item);
	if (slide) openEditEditor(slide);
}}
									aria-label="Edit custom slide"
								>
									<Pencil class="size-[14px]" />
								</Button>

								<form method="POST" action="?/toggleCustomSlide" use:enhance class="toggle-form">
									<input type="hidden" name="id" value={item.id}>
									<SubmitButton
										class={`toggle-button tap-target ${item.enabled ? 'enabled' : ''}`}
										aria-pressed={item.enabled}
										aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.title.trim().length > 0 ? item.title : 'Untitled custom slide'}`}
									>
										{#snippet children()}
											{item.enabled ? 'Enabled' : 'Disabled'}
										{/snippet}
									</SubmitButton>
								</form>

								{#if deletingSlideId === item.id}
									<div class="confirm-delete">
										<span class="confirm-delete-text">
											Delete <strong>"{item.title}"</strong> permanently?
										</span>
										<form method="POST" action="?/deleteCustom" use:enhance class="delete-form">
											<input type="hidden" name="id" value={item.id}>
											<SubmitButton
												class="confirm-button tap-target"
												aria-label={`Confirm delete "${item.title}"`}
											>
												{#snippet children()}
													Delete
												{/snippet}
											</SubmitButton>
										</form>
										<Button
											type="button"
											class="cancel-delete-button tap-target"
											onclick={() => (deletingSlideId = null)}
										>
											Cancel
										</Button>
									</div>
								{:else}
									<form
										method="POST"
										action="?/deleteCustom"
										use:enhance
										class="delete-trigger-form"
										onsubmit={(e) => {
	e.preventDefault();
	deletingSlideId = item.id;
}}
									>
										<input type="hidden" name="id" value={item.id}>
										<SubmitButton
											class="action-button delete-action tap-target"
											aria-label="Delete custom slide"
										>
											{#snippet children()}
												<Trash2 class="size-[14px]" />
											{/snippet}
										</SubmitButton>
									</form>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>

			{#if unifiedSlides.length === 0}
				<p class="empty-message">No slides configured yet.</p>
			{/if}
		</section>

		<section class="section">
			<h2>Fun Fact Frequency</h2>
			<p class="section-description">
				Choose how many fun facts appear between slides in the Wrapped presentation.
			</p>

			<!-- ISSUE-012: tell the admin whether fun facts are AI-generated (OpenAI key
		     in effect) or falling back to the built-in template generator. -->
			{#if data.aiFunFactsActive}
				<p class="ai-status ai-status-active" role="status">
					<SparklesIcon class="ai-status-icon" aria-hidden="true" />
					AI fun facts are active, generated with your OpenAI key.
				</p>
			{:else}
				<p class="ai-status ai-status-fallback" role="status">
					<SparklesIcon class="ai-status-icon" aria-hidden="true" />
					No OpenAI key configured, so fun facts come from the built-in templates. Add a key in
					<a href="/admin/settings/connections">Settings → Connections</a>
					for AI fun facts.
				</p>
			{/if}

			<form
				method="POST"
				action="?/setFunFactFrequency"
				use:enhance={() => {
	return async ({ result, update }) => {
		if (result.type === 'success' && result.data?.funFactFrequency) {
			const frequency = result.data.funFactFrequency as typeof data.funFactFrequency;
			selectedFrequencyMode = frequency.mode;
			customCount = frequency.count;
			syncedFrequencyKey = `${frequency.mode}:${frequency.count}`;
		}
		await update();
	};
}}
			>
				<div class="frequency-options">
					<label class="frequency-option">
						<input type="radio" name="mode" value="few" bind:group={selectedFrequencyMode}>
						<span class="frequency-label">
							<span class="frequency-name">Few</span>
							<span class="frequency-desc">2 fun facts</span>
						</span>
					</label>

					<label class="frequency-option">
						<input type="radio" name="mode" value="normal" bind:group={selectedFrequencyMode}>
						<span class="frequency-label">
							<span class="frequency-name">Normal</span>
							<span class="frequency-desc">4 fun facts</span>
						</span>
					</label>

					<label class="frequency-option">
						<input type="radio" name="mode" value="many" bind:group={selectedFrequencyMode}>
						<span class="frequency-label">
							<span class="frequency-name">Many</span>
							<span class="frequency-desc">8 fun facts</span>
						</span>
					</label>

					<label class="frequency-option">
						<input type="radio" name="mode" value="custom" bind:group={selectedFrequencyMode}>
						<span class="frequency-label">
							<span class="frequency-name">Custom</span>
							<span class="frequency-desc">1-15 fun facts</span>
						</span>
					</label>
				</div>

				{#if selectedFrequencyMode === 'custom'}
					<div class="custom-count-input">
						<label for="customCount">Number of fun facts:</label>
						<input
							type="number"
							id="customCount"
							name="customCount"
							bind:value={customCount}
							min="1"
							max="15"
							required
						>
						{#if customCount < 1 || customCount > 15}
							<span class="custom-count-error">Custom count must be between 1 and 15.</span>
						{/if}
					</div>
				{/if}

				<SubmitButton
					class="save-frequency-button tap-target"
					disabled={selectedFrequencyMode === 'custom' && (customCount < 1 || customCount > 15)}
				>
					{#snippet children()}
						Save Frequency Settings
					{/snippet}
				</SubmitButton>
			</form>
		</section>
	</div>

	{#if showEditor}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- Backdrop clicks close the dialog; its focus trap and Escape handler provide keyboard interaction. -->
		<div class="modal-overlay" onclick={closeEditor} role="presentation">
			<div
				class="modal"
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="editor-title"
				tabindex="-1"
				bind:this={editorModalRef}
			>
				<header class="modal-header">
					<h2 id="editor-title">
						{editingSlide ? 'Edit Custom Slide' : 'Create Custom Slide'}
					</h2>
					<Button
						type="button"
						class="close-button tap-target"
						onclick={closeEditor}
						aria-label="Close"
					>
						&times;
					</Button>
				</header>

				<form
					method="POST"
					action={editingSlide ? '?/updateCustom' : '?/createCustom'}
					use:enhance={() => {
	return async ({ result, update }) => {
		// A fresh validation failure must re-show errors even if the user
		// dismissed a prior one by editing or reopening (ISSUE-003).
		if (result.type === 'failure') {
			fieldErrorsDismissed = false;
		}
		// Refresh the list first so a newly created/updated slide appears
		// immediately; keep the user's entered content on failure
		// (reset: false) so a validation error never blanks the open modal.
		await update({ reset: false });
		if (result.type === 'success') {
			closeEditor();
		}
	};
}}
				>
					{#if editingSlide}
						<input type="hidden" name="id" value={editingSlide.id}>
					{/if}

					<div class="form-group">
						<label for="title">Title</label>
						<input
							type="text"
							id="title"
							name="title"
							bind:this={editorTitleInputRef}
							bind:value={editorTitle}
							oninput={() => (fieldErrorsDismissed = true)}
							required
							maxlength="200"
							placeholder="Enter slide title"
							aria-invalid={visibleFieldErrors?.title?.[0] ? 'true' : undefined}
							aria-describedby={visibleFieldErrors?.title?.[0] ? 'title-error' : undefined}
						>
						{#if visibleFieldErrors?.title?.[0]}
							<span id="title-error" class="field-error" role="alert">
								{visibleFieldErrors.title[0]}
							</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="content">Content (Markdown)</label>
						<textarea
							id="content"
							name="content"
							bind:value={editorContent}
							oninput={() => (fieldErrorsDismissed = true)}
							required
							rows="10"
							placeholder="Write your slide content in Markdown..."
							aria-invalid={visibleFieldErrors?.content?.[0] ? 'true' : undefined}
							aria-describedby={visibleFieldErrors?.content?.[0] ? 'content-error' : undefined}
						></textarea>
						{#if visibleFieldErrors?.content?.[0]}
							<span id="content-error" class="field-error" role="alert">
								{visibleFieldErrors.content[0]}
							</span>
						{/if}
					</div>

					<div class="form-row form-row-aligned">
						<div class="form-group form-group-year">
							<label for="year">Year</label>
							<select id="year" name="year" bind:value={editorYear} class="year-select">
								<option value={null}>All years</option>
								{#each data.availableYears as year}
									<option value={year}>{year}</option>
								{/each}
							</select>
							<span class="field-hint">Leave as "All years" to show on every wrapped</span>
						</div>

						<div class="form-group form-group-enabled">
							<label for="enabled-checkbox">Status</label>
							<label class="checkbox-toggle">
								<input
									type="checkbox"
									id="enabled-checkbox"
									name="enabled"
									bind:checked={editorEnabled}
									value="true"
								>
								<span class="toggle-label">{editorEnabled ? 'Enabled' : 'Disabled'}</span>
							</label>
						</div>
					</div>

					<div class="preview-section">
						<h3>Preview</h3>
						<Button
							type="button"
							class="preview-button tap-target"
							onclick={async () => {
	// Short-circuit when there is nothing to render. Without this
	// guard the server returns html: '' for empty input and the
	// preview region falls through to {@html ''} — visible
	// outcome is the placeholder text staying put with no
	// indication the button was clicked (dogfood ISSUE-004).
	const content = editorContent ?? '';
	if (content.trim().length === 0) {
		previewHtml = '';
		previewRendered = false;
		previewError = 'Enter some Markdown content first.';
		return;
	}

	const formData = new FormData();
	formData.append('content', content);

	try {
		const result = await submitAction<{ html?: string }>('?/previewMarkdown', formData);
		if (result.type === 'success') {
			const html = typeof result.data.html === 'string' ? result.data.html : '';
			previewHtml = html;
			// Mark render success even when sanitization strips everything. A visible
			// empty-state line is clearer than reverting to the pre-render placeholder,
			// which made the button look broken.
			previewRendered = true;
			previewError = '';
		} else if (result.type === 'failure') {
			previewHtml = '';
			previewRendered = false;
			previewError = result.data.error ?? 'Failed to render Markdown';
		} else if (result.type === 'error') {
			previewHtml = '';
			previewRendered = false;
			previewError = result.error.message ?? 'Failed to render Markdown';
		}
	} catch (error) {
		console.error('Failed to render Markdown preview:', error);
		previewHtml = '';
		previewRendered = false;
		previewError = 'Failed to render Markdown';
	}
}}
						>
							Update Preview
						</Button>

						<div class="preview-content">
							{#if previewError}
								<p class="preview-error">{previewError}</p>
							{:else if previewRendered}
								{#if previewHtml.length > 0}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html previewHtml}
								{:else}
									<p class="preview-placeholder">Markdown rendered to an empty result.</p>
								{/if}
							{:else}
								<p class="preview-placeholder">Click "Update Preview" to see rendered Markdown</p>
							{/if}
						</div>
					</div>

					<div class="modal-actions">
						<Button type="button" class="cancel-button tap-target" onclick={closeEditor}>
							Cancel
						</Button>
						<SubmitButton class="save-button tap-target">
							{#snippet children()}
								{editingSlide ? 'Save Changes' : 'Create Slide'}
							{/snippet}
						</SubmitButton>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
.admin-container {
	max-width: 800px;
	margin: 0 auto;
	padding: 2rem;
}

.field-error {
	display: block;
	font-size: 0.75rem;
	color: oklch(var(--destructive));
	margin-top: 0.375rem;
}

.admin-header {
	margin-bottom: 2rem;
}

.admin-header h1 {
	font-size: 2rem;
	font-weight: 700;
	color: oklch(var(--primary));
	margin: 0 0 0.5rem;
}

.subtitle {
	color: oklch(var(--muted-foreground));
	margin: 0;
}

.section {
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	padding: 1.5rem;
	margin-bottom: 2rem;
}

.section h2 {
	font-size: 1.25rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin: 0 0 0.5rem;
}

.section-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
	margin-bottom: 1rem;
}

.section-title-content {
	min-width: 0;
}

.section-header h2 {
	margin: 0 0 0.25rem;
}

.section-header .section-description {
	margin: 0;
}

.section-description {
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
	margin: 0 0 1rem;
}

/* ISSUE-012: AI-vs-template status badge for the fun-fact section. */
.ai-status {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0 0 1rem;
	padding: 0.625rem 0.75rem;
	font-size: 0.8125rem;
	line-height: 1.4;
	border-radius: 8px;
	border: 1px solid transparent;
}

.ai-status :global(.ai-status-icon) {
	flex-shrink: 0;
	width: 1rem;
	height: 1rem;
}

.ai-status-active {
	color: oklch(var(--foreground));
	background: oklch(0.72 0.16 152 / 0.12);
	border-color: oklch(0.72 0.16 152 / 0.32);
}

.ai-status-fallback {
	color: oklch(var(--foreground));
	background: oklch(0.79 0.1606 79.6 / 0.1);
	border-color: oklch(0.79 0.1606 79.6 / 0.3);
}

.ai-status-fallback a {
	color: inherit;
	text-decoration: underline;
}

.slide-list {
	list-style: none;
	padding: 0;
	margin: 0;
}

.slide-item {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--secondary));
	border-radius: var(--radius);
	margin-bottom: 0.5rem;
	cursor: grab;
	transition:
		background 0.15s ease,
		border-color 0.15s ease,
		box-shadow 0.15s ease;
	border-left: 3px solid transparent;
}

.slide-item:hover {
	background: oklch(var(--muted));
}

.slide-item.dragging {
	opacity: 0.5;
}

.slide-item.drag-over {
	border: 2px dashed oklch(var(--primary));
	border-left: 3px solid oklch(var(--primary));
}

.slide-item.is-custom {
	border-left: 3px solid oklch(0.6192 0.2037 312.73);
	background: linear-gradient(
		90deg,
		oklch(0.6192 0.2037 312.73 / 0.08) 0%,
		oklch(var(--secondary)) 100%
	);
}

.slide-item.is-custom:hover {
	background: linear-gradient(
		90deg,
		oklch(0.6192 0.2037 312.73 / 0.12) 0%,
		oklch(var(--muted)) 100%
	);
}

.drag-handle {
	color: oklch(var(--muted-foreground));
	font-size: 1.25rem;
	cursor: grab;
	user-select: none;
	flex-shrink: 0;
}

.reorder-controls {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.125rem;
	flex-shrink: 0;
}

.move-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.5rem;
	height: 1.25rem;
	padding: 0;
	background: transparent;
	border: 1px solid transparent;
	border-radius: 6px;
	color: oklch(var(--muted-foreground));
	font-size: 0.625rem;
	line-height: 1;
	cursor: pointer;
	transition:
		color 0.15s ease,
		background 0.15s ease,
		border-color 0.15s ease;
}

.move-button:hover:not(:disabled) {
	color: oklch(var(--foreground));
	background: oklch(var(--muted));
	border-color: oklch(var(--border));
}

.move-button:focus-visible {
	outline: none;
	border-color: oklch(var(--ring));
	box-shadow: 0 0 0 2px oklch(var(--ring) / 0.4);
}

.move-button:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}

.slide-name {
	flex: 1;
	font-weight: 500;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
}

.slide-name-untitled {
	color: oklch(var(--muted-foreground));
	font-style: italic;
}

.slide-name-group {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 0.5rem;
	/* DF-022: constrain width so the truncating .slide-name child has a
			   finite container to truncate within */
	min-width: 0;
	overflow: hidden;
}

.custom-badge {
	display: inline-flex;
	align-items: center;
	/* DF-022: keep badge at intrinsic width so only .slide-name truncates */
	flex-shrink: 0;
	padding: 0.125rem 0.5rem;
	background: oklch(0.6192 0.2037 312.73 / 0.2);
	color: oklch(0.7546 0.1294 313.96);
	border-radius: 9999px;
	font-size: 0.625rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.year-badge {
	display: inline-flex;
	align-items: center;
	/* DF-022: keep badge at intrinsic width so only .slide-name truncates */
	flex-shrink: 0;
	padding: 0.125rem 0.375rem;
	background: oklch(var(--muted));
	color: oklch(var(--muted-foreground));
	border-radius: var(--radius);
	font-size: 0.625rem;
	font-weight: 500;
}

.slide-actions {
	display: flex;
	align-items: center;
	gap: 0.375rem;
}

/* Hoisted to :global so shadcn Button's child-rendered <button>
		   and the native delete-action button share the same palette rules. */
:global(.action-button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	padding: 0;
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--muted-foreground));
	cursor: pointer;
	transition: all 0.15s ease;
}

:global(.action-button:hover) {
	background: oklch(var(--secondary));
	color: oklch(var(--foreground));
}

:global(.action-button.edit-action:hover) {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border-color: oklch(var(--primary));
}

:global(.action-button.delete-action:hover) {
	background: oklch(var(--destructive));
	color: oklch(var(--destructive-foreground));
	border-color: oklch(var(--destructive));
}

.delete-form {
	display: contents;
}

.delete-trigger-form {
	display: contents;
}

.confirm-delete {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.confirm-delete-text {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.confirm-delete-text strong {
	color: oklch(var(--foreground));
	font-weight: 600;
}

/* SubmitButton and shadcn Button child-render the real controls, so
		   the delete-confirmation palettes must be hoisted. */
:global(.confirm-button) {
	padding: 0.25rem 0.75rem;
	background: oklch(var(--destructive));
	color: oklch(var(--destructive-foreground));
	border: none;
	border-radius: var(--radius);
	font-size: 0.75rem;
	font-weight: 700;
	cursor: pointer;
}

:global(.confirm-button:hover) {
	opacity: 0.88;
	box-shadow: 0 0 0 2px oklch(var(--destructive) / 0.4);
}

:global(.confirm-button:focus-visible) {
	outline: 2px solid oklch(var(--destructive));
	outline-offset: 2px;
}

:global(.cancel-delete-button) {
	padding: 0.25rem 0.5rem;
	background: oklch(var(--muted));
	color: oklch(var(--muted-foreground));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	font-size: 0.75rem;
	font-weight: 400;
	cursor: pointer;
}

:global(.cancel-delete-button:hover) {
	background: oklch(var(--secondary));
}

.toggle-form {
	margin: 0;
}

/* SubmitButton child-renders the real <button>, so the enabled/disabled
		   palette swap must be hoisted out of Svelte's scoped CSS. */
:global(.toggle-button) {
	padding: 0.375rem 0.75rem;
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	background: oklch(var(--muted));
	color: oklch(var(--muted-foreground));
	font-size: 0.75rem;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
}

:global(.toggle-button.enabled) {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border-color: oklch(var(--primary));
}

:global(.toggle-button:hover) {
	opacity: 0.9;
}

/* shadcn Button child-renders the actual <button>, so this selector
		   must be global for the primary palette and hover translate-y to
		   reach it. The lucide icon descendant stays global for the same
		   scoped-style boundary. */
:global(.add-button) {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border: none;
	border-radius: var(--radius);
	font-weight: 500;
	font-size: 0.875rem;
	cursor: pointer;
	transition: all 0.15s ease;
	white-space: nowrap;
	flex-shrink: 0;
}

:global(.add-button:hover) {
	opacity: 0.9;
	transform: translateY(-1px);
}

:global(.add-button .add-button-icon) {
	width: 1rem;
	height: 1rem;
	flex-shrink: 0;
}

.empty-message {
	color: oklch(var(--muted-foreground));
	text-align: center;
	padding: 2rem;
}

.modal-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.75);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 100;
	padding: 1rem;
}

.modal {
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	width: 100%;
	max-width: 600px;
	max-height: 90vh;
	overflow-y: auto;
}

.modal-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1rem 1.5rem;
	border-bottom: 1px solid oklch(var(--border));
}

.modal-header h2 {
	font-size: 1.25rem;
	font-weight: 600;
	margin: 0;
}

/* shadcn Button child-renders the real <button>, so the modal-close
		   treatment must be hoisted. */
:global(.close-button) {
	background: none;
	border: none;
	font-size: 1.5rem;
	color: oklch(var(--muted-foreground));
	cursor: pointer;
	padding: 0;
	line-height: 1;
}

:global(.close-button:hover) {
	color: oklch(var(--foreground));
}

.modal form {
	padding: 1.5rem;
}

.form-group {
	margin-bottom: 1rem;
}

.form-group label {
	display: block;
	font-size: 0.875rem;
	font-weight: 500;
	margin-bottom: 0.375rem;
	color: oklch(var(--foreground));
}

.form-group input[type="text"],
.form-group textarea {
	width: 100%;
	padding: 0.5rem 0.75rem;
	background: oklch(var(--input));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--foreground));
	font-size: 0.875rem;
	font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
	outline: none;
	border-color: oklch(var(--ring));
	box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
}

.form-group textarea {
	resize: vertical;
	min-height: 96px;
	font-family: monospace;
}

.form-row {
	display: flex;
	gap: 1rem;
}

.form-row .form-group {
	flex: 1;
}

.form-row-aligned {
	align-items: flex-start;
}

.form-group-year {
	flex: 2;
}

.form-group-enabled {
	flex: 1;
	min-width: 120px;
}

.year-select {
	width: 100%;
	padding: 0.5rem 0.75rem;
	background: oklch(var(--input));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--foreground));
	font-size: 0.875rem;
	font-family: inherit;
	cursor: pointer;
}

.year-select:focus {
	outline: none;
	border-color: oklch(var(--ring));
	box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
}

.field-hint {
	display: block;
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
	margin-top: 0.375rem;
}

.checkbox-toggle {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	cursor: pointer;
	padding: 0.5rem 0.75rem;
	background: oklch(var(--input));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	transition: all 0.15s ease;
}

.checkbox-toggle:hover {
	background: oklch(var(--muted));
}

.checkbox-toggle:has(input:checked) {
	background: oklch(var(--primary) / 0.15);
	border-color: oklch(var(--primary) / 0.5);
}

.checkbox-toggle input {
	width: 1rem;
	height: 1rem;
	accent-color: oklch(var(--primary));
	margin: 0;
}

.toggle-label {
	font-size: 0.875rem;
	font-weight: 500;
	color: oklch(var(--foreground));
}

.preview-section {
	margin-top: 1.5rem;
	padding-top: 1rem;
	border-top: 1px solid oklch(var(--border));
}

.preview-section h3 {
	font-size: 0.875rem;
	font-weight: 600;
	margin: 0 0 0.75rem;
}

/* shadcn Button child-renders the actual <button>, so this selector
		   must be global for the secondary palette and hover-darken to reach it.
		   The button stays client-side `type="button"` because submitAction
		   owns preview state instead of native form submission. */
:global(.preview-button) {
	padding: 0.375rem 0.75rem;
	background: oklch(var(--secondary));
	color: oklch(var(--foreground));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	font-size: 0.75rem;
	cursor: pointer;
	margin-bottom: 0.75rem;
}

:global(.preview-button:hover) {
	background: oklch(var(--muted));
}

.preview-content {
	background: oklch(var(--background));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	padding: 1rem;
	min-height: 100px;
	max-height: 200px;
	overflow-y: auto;
	font-size: 0.875rem;
	line-height: 1.6;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.preview-placeholder {
	color: oklch(var(--muted-foreground));
	font-style: italic;
	margin: 0;
}

.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.75rem;
	margin-top: 1.5rem;
	padding-top: 0.75rem;
	padding-bottom: 0.25rem;
	border-top: 1px solid oklch(var(--border));
	position: sticky;
	bottom: 0;
	background: oklch(var(--card));
	z-index: 1;
}

/* Footer actions mix shadcn Button and SubmitButton, both of which
		   child-render the real controls; hoist the shared palettes. */
:global(.cancel-button) {
	padding: 0.5rem 1rem;
	background: oklch(var(--secondary));
	color: oklch(var(--foreground));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	cursor: pointer;
}

:global(.cancel-button:hover) {
	background: oklch(var(--muted));
}

:global(.save-button) {
	padding: 0.5rem 1rem;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border: none;
	border-radius: var(--radius);
	font-weight: 500;
	cursor: pointer;
	position: relative;
	z-index: 2;
}

:global(.save-button:hover) {
	opacity: 0.9;
}

.preview-content :global(h1),
.preview-content :global(h2),
.preview-content :global(h3) {
	color: oklch(var(--primary));
	margin-top: 1rem;
	margin-bottom: 0.5rem;
}

.preview-content :global(h1) {
	font-size: 1.5rem;
}

.preview-content :global(h2) {
	font-size: 1.25rem;
}

.preview-content :global(h3) {
	font-size: 1.125rem;
}

.preview-content :global(p) {
	margin-bottom: 0.75rem;
}

.preview-content :global(ul),
.preview-content :global(ol) {
	margin-bottom: 0.75rem;
	padding-left: 1.5rem;
}

.preview-content :global(strong) {
	color: oklch(var(--primary));
	font-weight: 700;
}

.preview-content :global(code) {
	background: oklch(var(--muted));
	padding: 0.125rem 0.25rem;
	border-radius: 0.25rem;
	font-family: monospace;
	font-size: 0.85em;
}

.preview-content :global(blockquote) {
	border-left: 3px solid oklch(var(--primary));
	padding-left: 1rem;
	margin: 0.75rem 0;
	color: oklch(var(--muted-foreground));
	font-style: italic;
}

.frequency-options {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 0.75rem;
	margin-bottom: 1rem;
}

.frequency-option {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--secondary));
	border-radius: var(--radius);
	cursor: pointer;
	transition: background 0.15s ease;
}

.frequency-option:hover {
	background: oklch(var(--muted));
}

.frequency-option:has(input:checked) {
	background: oklch(var(--primary) / 0.15);
	outline: 2px solid oklch(var(--primary));
}

.frequency-option input[type="radio"] {
	width: 1rem;
	height: 1rem;
	accent-color: oklch(var(--primary));
	margin: 0;
}

.frequency-label {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.frequency-name {
	font-weight: 600;
	font-size: 0.875rem;
	color: oklch(var(--foreground));
}

.frequency-desc {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.custom-count-input {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin-bottom: 1rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--secondary));
	border-radius: var(--radius);
}

.custom-count-input label {
	font-size: 0.875rem;
	font-weight: 500;
	color: oklch(var(--foreground));
}

.custom-count-input input[type="number"] {
	width: 80px;
	padding: 0.375rem 0.5rem;
	background: oklch(var(--input));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--foreground));
	font-size: 0.875rem;
}

.custom-count-input input[type="number"]:focus {
	outline: none;
	border-color: oklch(var(--ring));
	box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
}

.custom-count-error {
	font-size: 0.75rem;
	color: oklch(var(--destructive));
}

/* SubmitButton child-renders the real <button>, so the frequency form's
		   primary palette and disabled state must be hoisted. */
:global(.save-frequency-button:disabled) {
	opacity: 0.5;
	cursor: not-allowed;
}

:global(.save-frequency-button) {
	padding: 0.5rem 1rem;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border: none;
	border-radius: var(--radius);
	font-weight: 500;
	cursor: pointer;
	transition: opacity 0.15s ease;
}

:global(.save-frequency-button:hover) {
	opacity: 0.9;
}

@media (max-width: 430px) {
	.section-header {
		flex-direction: column;
		align-items: stretch;
	}

	:global(.add-button) {
		width: 100%;
		justify-content: center;
	}
}
</style>
