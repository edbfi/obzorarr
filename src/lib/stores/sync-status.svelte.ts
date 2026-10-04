import { browser } from '$app/env';
import type {
	LiveSyncProgress,
	SyncStatusStreamEvent,
	SyncStatusStreamProgress,
	SyncTerminalEventType
} from '$lib/sync/types';

export interface InitialSyncStatus {
	inProgress: boolean;
	progress: LiveSyncProgress | null;
}

export interface SyncStatusStoreOptions {
	onSyncComplete?: (event: SyncTerminalEventType) => void | Promise<void>;
	shouldHandleTerminalEvent?: (event: SyncTerminalEventType) => boolean;
}

// SyncIndicator still consumes the legacy LiveSyncProgress shape, so the
// stream DTO is padded here until that UI can consume SyncStatusStreamProgress directly.
function toCompatibleProgress(simple: SyncStatusStreamProgress | null): LiveSyncProgress | null {
	if (!simple) return null;

	return {
		syncId: 0,
		status: 'running',
		recordsProcessed: simple.recordsProcessed,
		recordsInserted: simple.recordsInserted ?? 0,
		recordsSkipped: 0,
		currentPage: 0,
		startedAt: new Date(),
		phase: simple.phase,
		enrichmentTotal: simple.enrichmentTotal,
		enrichmentProcessed: simple.enrichmentProcessed
	};
}

export class SyncStatusStore {
	inProgress = $state(false);
	progress = $state<LiveSyncProgress | null>(null);

	private eventSource: EventSource | null = null;
	private connected = false;
	private onSyncComplete?: (event: SyncTerminalEventType) => void | Promise<void>;
	private shouldHandleTerminalEvent?: (event: SyncTerminalEventType) => boolean;
	private wasSyncing = false;

	initialize(initialStatus: InitialSyncStatus, options?: SyncStatusStoreOptions): void {
		this.inProgress = initialStatus.inProgress;
		this.progress = initialStatus.progress;
		this.onSyncComplete = options?.onSyncComplete;
		this.shouldHandleTerminalEvent = options?.shouldHandleTerminalEvent;
		this.wasSyncing = initialStatus.inProgress;

		if (browser) {
			this.connect();
		}
	}

	private connect(): void {
		if (this.eventSource) {
			this.eventSource.close();
		}

		this.eventSource = new EventSource('/api/sync/status/stream');

		this.eventSource.onopen = () => {
			this.connected = true;
		};

		this.eventSource.onmessage = (event) => {
			try {
				const data: SyncStatusStreamEvent = JSON.parse(event.data);

				if (data.type === 'connected' || data.type === 'update') {
					this.inProgress = data.inProgress;
					this.progress = toCompatibleProgress(data.progress);
					if (data.inProgress) {
						this.wasSyncing = true;
					}
				} else if (
					data.type === 'completed' ||
					data.type === 'failed' ||
					data.type === 'cancelled' ||
					data.type === 'idle'
				) {
					if (this.onSyncComplete) {
						let predicateResult = false;
						try {
							predicateResult = this.shouldHandleTerminalEvent?.(data.type) === true;
						} catch {
							// Treat predicate errors as "don't handle"
						}
						const shouldHandle = this.wasSyncing || predicateResult;
						if (shouldHandle) {
							const callback = this.onSyncComplete;
							const terminalEvent = data.type;
							setTimeout(async () => {
								try {
									await callback(terminalEvent);
								} catch {
									// Terminal-event callbacks should not tear down the SSE loop.
								}
							}, 500);
						}
					}
					this.inProgress = false;
					this.progress = null;
					this.wasSyncing = false;
				}
			} catch {
				// Malformed SSE payloads are ignored; the next event carries fresh state.
			}
		};

		this.eventSource.onerror = () => {
			this.connected = false;
			setTimeout(() => {
				if (browser && !this.eventSource) {
					this.connect();
				}
			}, 3000);
		};
	}

	disconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.connected = false;
	}

	reset(): void {
		this.disconnect();
		this.inProgress = false;
		this.progress = null;
	}
}

export function createSyncStatusStore(
	initialStatus: InitialSyncStatus,
	options?: SyncStatusStoreOptions
): SyncStatusStore {
	const store = new SyncStatusStore();
	store.initialize(initialStatus, options);
	return store;
}
