<script lang="ts">
import type { Snippet } from 'svelte';
import { untrack } from 'svelte';
import { browser } from '$app/env';
import { invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import SyncLoadingOverlay from '$lib/components/SyncLoadingOverlay.svelte';
import { toast } from '$lib/services/toast';
import { createSyncStatusStore, type SyncStatusStore } from '$lib/stores/sync-status.svelte';
import type { SyncTerminalEventType } from '$lib/sync/types';
import type { LayoutData } from './$types';

interface Props {
	children: Snippet;
	data: LayoutData;
}

type LayoutDataWithLookupSync = LayoutData & {
	lookupSyncStarted?: boolean;
	lookupSyncTriggered?: boolean;
};

let { children, data }: Props = $props();

function canUseSyncStatus(layoutData: LayoutData): boolean {
	return layoutData.syncStatusEnabled === true && Boolean(layoutData.syncStatus);
}

function hasLookupSyncMarker(layoutData: LayoutData): boolean {
	const lookupData = layoutData as LayoutDataWithLookupSync;
	return Boolean(lookupData.lookupSyncTriggered ?? lookupData.lookupSyncStarted);
}

const MIN_LOADING_DISPLAY_MS = 300;
const FAILED_LIVE_SYNC_MESSAGE =
	'Could not refresh your viewing history from Plex. Showing the most recent data instead.';

let isLoading = $state(
	untrack(() => (canUseSyncStatus(data) ? (data.syncStatus?.inProgress ?? false) : false))
);

let loadingStartTime = $state(Date.now());

let syncCompletionHandled = $state(false);

const initialLookupSyncMarker = untrack(() => canUseSyncStatus(data) && hasLookupSyncMarker(data));

let lookupSyncFeedbackPending = $state(initialLookupSyncMarker);

let lookupSyncMarkerSeen = $state(initialLookupSyncMarker);

let syncStatusStore = $state<SyncStatusStore | null>(null);

async function hideLoadingWithMinDelay(): Promise<void> {
	const elapsed = Date.now() - loadingStartTime;
	if (elapsed < MIN_LOADING_DISPLAY_MS) {
		await new Promise((r) => setTimeout(r, MIN_LOADING_DISPLAY_MS - elapsed));
	}
	isLoading = false;
}

function consumeLookupSyncMarker(event: SyncTerminalEventType): boolean {
	if (!lookupSyncFeedbackPending) return false;
	if (event !== 'failed') return false;
	lookupSyncFeedbackPending = false;
	return true;
}

async function handleSyncComplete(event: SyncTerminalEventType): Promise<void> {
	lookupSyncFeedbackPending = false;

	if (syncCompletionHandled) return;
	syncCompletionHandled = true;
	if (!isLoading) {
		loadingStartTime = Date.now();
		isLoading = true;
	}

	try {
		await invalidateAll();
	} finally {
		if (event === 'failed') {
			toast.error(FAILED_LIVE_SYNC_MESSAGE);
		}
		await hideLoadingWithMinDelay();
		syncCompletionHandled = false;
	}
}

$effect(() => {
	const syncStatusEnabled = canUseSyncStatus(data);
	const lookupSyncStarted = syncStatusEnabled && hasLookupSyncMarker(data);

	if (lookupSyncStarted && !lookupSyncMarkerSeen) {
		lookupSyncFeedbackPending = true;
		lookupSyncMarkerSeen = true;
	}

	if (!lookupSyncStarted || !syncStatusEnabled) {
		lookupSyncMarkerSeen = false;
		lookupSyncFeedbackPending = false;
	}
});

// Keep the SSE store in an effect so it tracks fresh load data, never runs
// during SSR, and disconnects whenever the layout data changes.
$effect(() => {
	const syncStatus = data.syncStatusEnabled === true ? data.syncStatus : null;

	if (!browser || !syncStatus) {
		syncStatusStore = null;
		if (!syncCompletionHandled) {
			isLoading = false;
		}
		return;
	}

	if (!syncCompletionHandled) {
		loadingStartTime = Date.now();
		isLoading = syncStatus.inProgress;
	}

	const store = createSyncStatusStore(
		{
			inProgress: syncStatus.inProgress,
			progress: syncStatus.progress
		},
		{
			onSyncComplete: handleSyncComplete,
			shouldHandleTerminalEvent: consumeLookupSyncMarker
		}
	);
	syncStatusStore = store;

	return () => {
		store.disconnect();
	};
});

const inProgress = $derived(
	data.syncStatusEnabled === true
		? (syncStatusStore?.inProgress ?? data.syncStatus?.inProgress ?? false)
		: false
);
const progress = $derived(
	data.syncStatusEnabled === true
		? (syncStatusStore?.progress ?? data.syncStatus?.progress ?? null)
		: null
);

// Suppress the sync status region entirely on error pages (403/404/+error.svelte).
// When page.error is set, the overlay's role="status" aria-live region must be
// absent from the a11y tree — not just visually hidden — so screen readers don't
// announce "Syncing your viewing history…" over an error (ISSUE-023).
const hasPageError = $derived(Boolean(page.error));
</script>

{#if !hasPageError}
	<SyncLoadingOverlay
		visible={data.syncStatusEnabled === true && (isLoading || inProgress)}
		{progress}
		syncInProgress={inProgress}
	/>
{/if}

{@render children()}
