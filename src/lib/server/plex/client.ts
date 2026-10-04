import { getPlexConfig } from '$lib/server/admin/settings.service';
import { env } from '$lib/server/private-env';
import {
	type FetchHistoryOptions,
	type HistoryPageResult,
	type HistoryPageWithStats,
	hasRequiredFields,
	PlexApiError,
	PlexHistoryResponseSchema,
	PlexLibraryMetadataResponseSchema,
	PlexShowMetadataResponseSchema,
	PlexValidationError,
	type ValidPlexHistoryMetadata
} from './types';

function getPlexHeaders(token: string) {
	return {
		Accept: 'application/json',
		'X-Plex-Token': token,
		'X-Plex-Client-Identifier': 'obzorarr',
		'X-Plex-Product': 'Obzorarr',
		'X-Plex-Version': '1.0.0'
	};
}

const DEFAULT_PAGE_SIZE = 100;
const HISTORY_ENDPOINT = '/status/sessions/history/all';

export async function plexRequest<T>(
	endpoint: string,
	params?: URLSearchParams,
	signal?: AbortSignal
): Promise<T> {
	const config = await getPlexConfig();

	if (!config.serverUrl) {
		throw new PlexApiError('Plex server URL is not configured', undefined, endpoint);
	}

	const url = new URL(endpoint, config.serverUrl);
	if (params) {
		params.forEach((value, key) => {
			url.searchParams.set(key, value);
		});
	}

	try {
		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: getPlexHeaders(config.token),
			signal
		});

		if (!response.ok) {
			throw new PlexApiError(
				`Plex API error: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		return data as T;
	} catch (error) {
		if (error instanceof PlexApiError) {
			throw error;
		}

		if (error instanceof Error && error.name === 'AbortError') {
			throw new PlexApiError('Request aborted', undefined, endpoint, error);
		}

		throw new PlexApiError(
			`Failed to fetch from Plex: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

async function fetchHistoryPage(
	offset: number,
	options: FetchHistoryOptions = {}
): Promise<HistoryPageResult> {
	const {
		pageSize = DEFAULT_PAGE_SIZE,
		minViewedAt,
		accountId,
		librarySectionId,
		signal
	} = options;

	const params = new URLSearchParams();
	params.set('X-Plex-Container-Start', String(offset));
	params.set('X-Plex-Container-Size', String(pageSize));

	if (minViewedAt !== undefined) {
		params.set('viewedAt>', String(minViewedAt));
	}

	if (accountId !== undefined) {
		params.set('accountID', String(accountId));
	}

	if (librarySectionId !== undefined) {
		params.set('librarySectionID', String(librarySectionId));
	}

	const rawResponse = await plexRequest<unknown>(HISTORY_ENDPOINT, params, signal);
	const result = PlexHistoryResponseSchema.safeParse(rawResponse);

	if (!result.success) {
		throw new PlexValidationError(
			`Invalid Plex history response: ${result.error.message}`,
			result.error
		);
	}

	const container = result.data.MediaContainer;
	const rawItems = container.Metadata;
	const validItems = rawItems.filter(hasRequiredFields);
	const skippedCount = rawItems.length - validItems.length;

	if (skippedCount > 0) {
		console.warn(
			`[Plex] Skipped ${skippedCount} history items without required fields (ratingKey/title)`
		);
	}

	return {
		items: validItems,
		totalSize: container.totalSize ?? container.size,
		offset: container.offset,
		size: container.size,
		skippedCount
	};
}

export async function* fetchAllHistory(
	options: FetchHistoryOptions = {}
): AsyncGenerator<HistoryPageWithStats, void, unknown> {
	let offset = 0;
	let totalSize: number | undefined;

	do {
		const pageResult = await fetchHistoryPage(offset, options);

		if (totalSize === undefined) {
			totalSize = pageResult.totalSize;
		}

		if (pageResult.items.length > 0 || pageResult.skippedCount > 0) {
			yield {
				items: pageResult.items,
				skippedCount: pageResult.skippedCount
			};
		}

		offset += pageResult.size;
	} while (offset < (totalSize ?? 0) && offset > 0);
}

export async function fetchAllHistoryArray(
	options: FetchHistoryOptions = {}
): Promise<ValidPlexHistoryMetadata[]> {
	const allItems: ValidPlexHistoryMetadata[] = [];

	for await (const { items } of fetchAllHistory(options)) {
		allItems.push(...items);
	}

	return allItems;
}

export async function checkConnection(): Promise<boolean> {
	try {
		await plexRequest<unknown>('/');
		return true;
	} catch {
		return false;
	}
}

export async function getServerUrl(): Promise<string> {
	const config = await getPlexConfig();
	return config.serverUrl;
}

const METADATA_CONCURRENCY = Math.max(
	1,
	Math.min(20, parseInt(env.METADATA_CONCURRENCY ?? '8', 10) || 8)
);

export interface EnrichmentData {
	duration: number | null;
	genres: string[];
	releaseYear: number | null;
}

export async function fetchMediaMetadata(
	ratingKey: string,
	signal?: AbortSignal
): Promise<EnrichmentData | null> {
	try {
		const response = await plexRequest<unknown>(
			`/library/metadata/${ratingKey}`,
			undefined,
			signal
		);

		const result = PlexLibraryMetadataResponseSchema.safeParse(response);
		if (!result.success) {
			return null;
		}

		const item = result.data.MediaContainer.Metadata[0];
		if (!item) {
			return null;
		}

		return {
			duration: item.duration ? Math.floor(item.duration / 1000) : null,
			genres: item.Genre?.map((g) => g.tag) ?? [],
			releaseYear: item.year ?? null
		};
	} catch {
		return null;
	}
}

export async function fetchMetadataBatch(
	ratingKeys: string[],
	signal?: AbortSignal
): Promise<Map<string, EnrichmentData | null>> {
	const results = new Map<string, EnrichmentData | null>();

	if (ratingKeys.length === 0) {
		return results;
	}

	for (let i = 0; i < ratingKeys.length; i += METADATA_CONCURRENCY) {
		if (signal?.aborted) {
			break;
		}

		const batch = ratingKeys.slice(i, i + METADATA_CONCURRENCY);
		const promises = batch.map(async (ratingKey) => {
			const metadata = await fetchMediaMetadata(ratingKey, signal);
			results.set(ratingKey, metadata);
		});

		await Promise.all(promises);
	}

	return results;
}

export interface ShowMetadata {
	ratingKey: string;
	title: string;
	leafCount: number | null;
	thumb: string | null;
}

export async function fetchShowMetadata(
	ratingKey: string,
	signal?: AbortSignal
): Promise<ShowMetadata | null> {
	try {
		const response = await plexRequest<unknown>(
			`/library/metadata/${ratingKey}`,
			undefined,
			signal
		);

		const result = PlexShowMetadataResponseSchema.safeParse(response);
		if (!result.success) {
			return null;
		}

		const item = result.data.MediaContainer.Metadata[0];
		if (!item) {
			return null;
		}

		return {
			ratingKey: item.ratingKey,
			title: item.title,
			leafCount: item.leafCount ?? null,
			thumb: item.thumb ?? null
		};
	} catch {
		return null;
	}
}

export async function fetchShowsMetadataBatch(
	ratingKeys: string[],
	signal?: AbortSignal
): Promise<Map<string, ShowMetadata | null>> {
	const results = new Map<string, ShowMetadata | null>();

	if (ratingKeys.length === 0) {
		return results;
	}

	for (let i = 0; i < ratingKeys.length; i += METADATA_CONCURRENCY) {
		if (signal?.aborted) {
			break;
		}

		const batch = ratingKeys.slice(i, i + METADATA_CONCURRENCY);
		const promises = batch.map(async (ratingKey) => {
			const metadata = await fetchShowMetadata(ratingKey, signal);
			results.set(ratingKey, metadata);
		});

		await Promise.all(promises);
	}

	return results;
}
