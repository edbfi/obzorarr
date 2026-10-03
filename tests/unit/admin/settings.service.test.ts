import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AnonymizationMode,
	API_CONFIG_KEYS,
	AppSettingsKey,
	clearConflictingDbSettings,
	clearPlayHistory,
	clearStatsCache,
	clearUserStatsCache,
	countPlayHistory,
	countStatsCache,
	deleteAppSetting,
	dismissCsrfWarning,
	FunFactFrequency,
	getAllAppSettings,
	getAnonymizationMode,
	getApiConfigWithSources,
	getAppSetting,
	getAppSettingsUpdatedAt,
	getCachedServerName,
	getCsrfConfigWithSource,
	getCsrfOrigin,
	getCurrentTheme,
	getDefaultYear,
	getFunFactFrequency,
	getPlexConfig,
	getPlexConfigFingerprint,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	hasOpenAIEnvConfig,
	hasPlexEnvConfig,
	isAuthoritativePlexServerUrl,
	isCsrfWarningDismissed,
	isPlaceholderSentinel,
	isPlexConfigured,
	resetCsrfWarningDismissal,
	setAnonymizationMode,
	setApiConfigAtomic,
	setAppSetting,
	setCachedServerName,
	setCurrentTheme,
	setDefaultYear,
	setFunFactFrequency,
	setUITheme,
	setWrappedLogoMode,
	setWrappedTheme,
	ThemePresets,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, cachedStats, playHistory } from '$lib/server/db/schema';
import { env } from '$lib/server/private-env';
import { createYearFilter } from '$lib/server/stats/utils';
import { resetSharedTestDb } from '../../helpers/db';

describe('Admin Settings Service', () => {
	beforeEach(resetSharedTestDb);

	describe('App Settings CRUD', () => {
		describe('getAppSetting', () => {
			it('returns null when setting does not exist', async () => {
				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBeNull();
			});

			it('returns value when setting exists', async () => {
				await db.insert(appSettings).values({
					key: AppSettingsKey.CURRENT_THEME,
					value: ThemePresets.SUPABASE
				});

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBe(ThemePresets.SUPABASE);
			});
		});

		describe('setAppSetting', () => {
			it('inserts new setting', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.DOOM_64);

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBe(ThemePresets.DOOM_64);
			});

			it('updates existing setting', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.MODERN_MINIMAL);
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.AMBER_MINIMAL);

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBe(ThemePresets.AMBER_MINIMAL);
			});
		});

		describe('getAppSettingsUpdatedAt', () => {
			it('returns null when none of the keys exist', async () => {
				const updatedAt = await getAppSettingsUpdatedAt([AppSettingsKey.CURRENT_THEME]);
				expect(updatedAt).toBeNull();
			});

			it('returns the latest timestamp across the given keys', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.DOOM_64);
				await new Promise((resolve) => setTimeout(resolve, 2));
				await setAppSetting(AppSettingsKey.DEFAULT_YEAR, '2024');

				const updatedAt = await getAppSettingsUpdatedAt([
					AppSettingsKey.CURRENT_THEME,
					AppSettingsKey.DEFAULT_YEAR
				]);
				expect(updatedAt).not.toBeNull();

				const themeOnly = await getAppSettingsUpdatedAt([AppSettingsKey.CURRENT_THEME]);
				expect(themeOnly).not.toBeNull();
				expect((updatedAt as Date).getTime()).toBeGreaterThan((themeOnly as Date).getTime());
			});

			it('bumps updatedAt when a setting is re-written', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.DOOM_64);
				const first = await getAppSettingsUpdatedAt([AppSettingsKey.CURRENT_THEME]);

				await new Promise((resolve) => setTimeout(resolve, 2));
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.AMBER_MINIMAL);
				const second = await getAppSettingsUpdatedAt([AppSettingsKey.CURRENT_THEME]);

				expect(first).not.toBeNull();
				expect(second).not.toBeNull();
				expect((second as Date).getTime()).toBeGreaterThan((first as Date).getTime());
			});
		});

		describe('deleteAppSetting', () => {
			it('deletes existing setting', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SOVIET_RED);
				await deleteAppSetting(AppSettingsKey.CURRENT_THEME);

				const value = await getAppSetting(AppSettingsKey.CURRENT_THEME);
				expect(value).toBeNull();
			});

			it('does nothing for non-existent setting', async () => {
				await deleteAppSetting(AppSettingsKey.CURRENT_THEME);
			});
		});

		describe('getAllAppSettings', () => {
			it('returns empty object when no settings exist', async () => {
				const settings = await getAllAppSettings();
				expect(settings).toEqual({});
			});

			it('returns all settings as key-value object', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SOVIET_RED);
				await setAppSetting(AppSettingsKey.DEFAULT_YEAR, '2024');

				const settings = await getAllAppSettings();
				expect(settings[AppSettingsKey.CURRENT_THEME]).toBe(ThemePresets.SOVIET_RED);
				expect(settings[AppSettingsKey.DEFAULT_YEAR]).toBe('2024');
			});
		});
	});

	describe('Theme Settings', () => {
		describe('getCurrentTheme', () => {
			it('returns default theme when no setting exists', async () => {
				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.MODERN_MINIMAL);
			});

			it('returns stored theme when valid', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SUPABASE);

				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.SUPABASE);
			});

			it('returns default for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, 'invalid-theme');

				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.MODERN_MINIMAL);
			});
		});

		describe('setCurrentTheme', () => {
			it('sets theme correctly', async () => {
				await setCurrentTheme(ThemePresets.DOOM_64);

				const theme = await getCurrentTheme();
				expect(theme).toBe(ThemePresets.DOOM_64);
			});
		});

		describe('getWrappedTheme', () => {
			it('returns default theme when no setting exists', async () => {
				const theme = await getWrappedTheme();
				expect(theme).toBe(ThemePresets.MODERN_MINIMAL);
			});

			it('returns WRAPPED_THEME when set', async () => {
				await setAppSetting(AppSettingsKey.WRAPPED_THEME, ThemePresets.DOOM_64);

				const theme = await getWrappedTheme();
				expect(theme).toBe(ThemePresets.DOOM_64);
			});

			it('falls back to legacy CURRENT_THEME when WRAPPED_THEME not set', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SUPABASE);

				const theme = await getWrappedTheme();
				expect(theme).toBe(ThemePresets.SUPABASE);
			});

			it('prefers WRAPPED_THEME over legacy CURRENT_THEME', async () => {
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SUPABASE);
				await setAppSetting(AppSettingsKey.WRAPPED_THEME, ThemePresets.AMBER_MINIMAL);

				const theme = await getWrappedTheme();
				expect(theme).toBe(ThemePresets.AMBER_MINIMAL);
			});

			it('falls back to legacy CURRENT_THEME when WRAPPED_THEME is invalid', async () => {
				await setAppSetting(AppSettingsKey.WRAPPED_THEME, 'invalid');
				await setAppSetting(AppSettingsKey.CURRENT_THEME, ThemePresets.SOVIET_RED);

				const theme = await getWrappedTheme();
				expect(theme).toBe(ThemePresets.SOVIET_RED);
			});

			it('returns default when both themes are invalid', async () => {
				await setAppSetting(AppSettingsKey.WRAPPED_THEME, 'invalid');
				await setAppSetting(AppSettingsKey.CURRENT_THEME, 'also-invalid');

				const theme = await getWrappedTheme();
				expect(theme).toBe(ThemePresets.MODERN_MINIMAL);
			});
		});

		describe('setWrappedTheme', () => {
			it('sets wrapped theme correctly', async () => {
				await setWrappedTheme(ThemePresets.SOVIET_RED);

				const theme = await getWrappedTheme();
				expect(theme).toBe(ThemePresets.SOVIET_RED);
			});
		});
	});

	describe('Anonymization Settings', () => {
		describe('getAnonymizationMode', () => {
			it('returns HYBRID default when no setting exists (DF-004 privacy-by-default)', async () => {
				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.HYBRID);
			});

			it('returns stored mode when valid', async () => {
				await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, AnonymizationMode.ANONYMOUS);

				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.ANONYMOUS);
			});

			it('returns HYBRID default for invalid stored value (DF-004 privacy-by-default)', async () => {
				await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, 'invalid-mode');

				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.HYBRID);
			});
		});

		describe('setAnonymizationMode', () => {
			it('sets mode correctly', async () => {
				await setAnonymizationMode(AnonymizationMode.HYBRID);

				const mode = await getAnonymizationMode();
				expect(mode).toBe(AnonymizationMode.HYBRID);
			});
		});
	});

	describe('Year Settings', () => {
		describe('getDefaultYear', () => {
			it('returns current year when no setting exists', async () => {
				const year = await getDefaultYear();
				expect(year).toBe(new Date().getFullYear());
			});

			it('returns stored year when valid', async () => {
				await setAppSetting(AppSettingsKey.DEFAULT_YEAR, '2023');

				const year = await getDefaultYear();
				expect(year).toBe(2023);
			});

			it('returns current year for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.DEFAULT_YEAR, 'not-a-year');

				const year = await getDefaultYear();
				expect(year).toBe(new Date().getFullYear());
			});
		});

		describe('setDefaultYear', () => {
			it('sets year correctly', async () => {
				await setDefaultYear(2022);

				const year = await getDefaultYear();
				expect(year).toBe(2022);
			});
		});
	});

	describe('Logo Mode Settings', () => {
		describe('getWrappedLogoMode', () => {
			it('returns default mode when no setting exists', async () => {
				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.ALWAYS_SHOW);
			});

			it('returns stored mode when valid', async () => {
				await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, WrappedLogoMode.ALWAYS_HIDE);

				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.ALWAYS_HIDE);
			});

			it('returns default for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, 'invalid');

				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.ALWAYS_SHOW);
			});
		});

		describe('setWrappedLogoMode', () => {
			it('sets mode correctly', async () => {
				await setWrappedLogoMode(WrappedLogoMode.USER_CHOICE);

				const mode = await getWrappedLogoMode();
				expect(mode).toBe(WrappedLogoMode.USER_CHOICE);
			});
		});
	});

	describe('Server Name Cache', () => {
		describe('getCachedServerName', () => {
			it('returns null when no name cached', async () => {
				const name = await getCachedServerName();
				expect(name).toBeNull();
			});

			it('returns cached name when exists', async () => {
				await setAppSetting(AppSettingsKey.SERVER_NAME, 'My Plex Server');

				const name = await getCachedServerName();
				expect(name).toBe('My Plex Server');
			});
		});

		describe('setCachedServerName', () => {
			it('caches server name', async () => {
				await setCachedServerName('Test Server');

				const name = await getCachedServerName();
				expect(name).toBe('Test Server');
			});
		});
	});

	describe('Fun Fact Frequency Settings', () => {
		describe('getFunFactFrequency', () => {
			it('returns NORMAL mode with count 4 as default', async () => {
				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.NORMAL);
				expect(config.count).toBe(4);
			});

			it('returns FEW mode with count 2', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.FEW);

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.FEW);
				expect(config.count).toBe(2);
			});

			it('returns NORMAL mode with count 4', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.NORMAL);

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.NORMAL);
				expect(config.count).toBe(4);
			});

			it('returns MANY mode with count 8', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.MANY);

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.MANY);
				expect(config.count).toBe(8);
			});

			it('returns CUSTOM mode with stored count', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.CUSTOM);
				await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, '10');

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.CUSTOM);
				expect(config.count).toBe(10);
			});

			it('clamps CUSTOM count to minimum of 1', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.CUSTOM);
				await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, '0');

				const config = await getFunFactFrequency();
				expect(config.count).toBe(1);
			});

			it('clamps CUSTOM count to maximum of 15', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.CUSTOM);
				await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, '100');

				const config = await getFunFactFrequency();
				expect(config.count).toBe(15);
			});

			it('clamps to minimum when CUSTOM count is invalid NaN', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.CUSTOM);
				await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, 'not-a-number');

				const config = await getFunFactFrequency();
				expect(config.count).toBe(1);
			});

			it('defaults to 4 when CUSTOM mode but no count set', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, FunFactFrequency.CUSTOM);

				const config = await getFunFactFrequency();
				expect(config.count).toBe(4);
			});

			it('returns default NORMAL for invalid mode value', async () => {
				await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, 'invalid-mode');

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.NORMAL);
				expect(config.count).toBe(4);
			});
		});

		describe('setFunFactFrequency', () => {
			it('sets mode correctly', async () => {
				await setFunFactFrequency(FunFactFrequency.MANY);

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.MANY);
				expect(config.count).toBe(8);
			});

			it('sets CUSTOM mode with custom count', async () => {
				await setFunFactFrequency(FunFactFrequency.CUSTOM, 7);

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.CUSTOM);
				expect(config.count).toBe(7);
			});

			it('clamps custom count to min 1', async () => {
				await setFunFactFrequency(FunFactFrequency.CUSTOM, -5);

				const config = await getFunFactFrequency();
				expect(config.count).toBe(1);
			});

			it('clamps custom count to max 15', async () => {
				await setFunFactFrequency(FunFactFrequency.CUSTOM, 50);

				const config = await getFunFactFrequency();
				expect(config.count).toBe(15);
			});

			it('ignores customCount when mode is not CUSTOM', async () => {
				await setFunFactFrequency(FunFactFrequency.FEW, 10);

				const config = await getFunFactFrequency();
				expect(config.mode).toBe(FunFactFrequency.FEW);
				expect(config.count).toBe(2);
			});
		});
	});

	describe('Cache Management', () => {
		beforeEach(async () => {
			await db.insert(cachedStats).values([
				{ userId: 1, year: 2023, statsType: 'user', statsJson: '{}' },
				{ userId: 1, year: 2024, statsType: 'user', statsJson: '{}' },
				{ userId: 2, year: 2024, statsType: 'user', statsJson: '{}' },
				{ userId: null, year: 2024, statsType: 'server', statsJson: '{}' }
			]);
		});

		describe('clearStatsCache', () => {
			it('clears all cache when no year specified', async () => {
				const deleted = await clearStatsCache();

				expect(deleted).toBe(4);
			});

			it('clears cache for specific year only', async () => {
				const deleted = await clearStatsCache(2024);

				expect(deleted).toBe(3);
			});

			it('returns 0 when no cache for year', async () => {
				const deleted = await clearStatsCache(2022);

				expect(deleted).toBe(0);
			});
		});

		describe('clearUserStatsCache', () => {
			it('clears all cache for user when no year specified', async () => {
				const deleted = await clearUserStatsCache(1);

				expect(deleted).toBe(2);
			});

			it('clears cache for user and specific year', async () => {
				const deleted = await clearUserStatsCache(1, 2024);

				expect(deleted).toBe(1);
			});

			it('returns 0 when no cache for user', async () => {
				const deleted = await clearUserStatsCache(999);

				expect(deleted).toBe(0);
			});
		});

		describe('countPlayHistory', () => {
			beforeEach(async () => {
				await db.delete(playHistory);
				const yearFilter2024 = createYearFilter(2024);
				const yearFilter2023 = createYearFilter(2023);
				await db.insert(playHistory).values([
					{
						historyKey: 'hist-1',
						ratingKey: 'key-1',
						title: 'Movie 1',
						type: 'movie',
						viewedAt: yearFilter2024.startTimestamp + 1000,
						accountId: 1,
						librarySectionId: 1
					},
					{
						historyKey: 'hist-2',
						ratingKey: 'key-2',
						title: 'Movie 2',
						type: 'movie',
						viewedAt: yearFilter2024.startTimestamp + 2000,
						accountId: 1,
						librarySectionId: 1
					},
					{
						historyKey: 'hist-3',
						ratingKey: 'key-3',
						title: 'Movie 3',
						type: 'movie',
						viewedAt: yearFilter2023.startTimestamp + 1000,
						accountId: 1,
						librarySectionId: 1
					}
				]);
			});

			it('counts all play history when no year specified', async () => {
				const count = await countPlayHistory();
				expect(count).toBe(3);
			});

			it('counts play history for specific year only', async () => {
				const count = await countPlayHistory(2024);
				expect(count).toBe(2);
			});

			it('returns 0 when no history for year', async () => {
				const count = await countPlayHistory(2022);
				expect(count).toBe(0);
			});
		});

		describe('clearPlayHistory', () => {
			beforeEach(async () => {
				await db.delete(playHistory);
				const yearFilter2024 = createYearFilter(2024);
				const yearFilter2023 = createYearFilter(2023);
				await db.insert(playHistory).values([
					{
						historyKey: 'hist-1',
						ratingKey: 'key-1',
						title: 'Movie 1',
						type: 'movie',
						viewedAt: yearFilter2024.startTimestamp + 1000,
						accountId: 1,
						librarySectionId: 1
					},
					{
						historyKey: 'hist-2',
						ratingKey: 'key-2',
						title: 'Movie 2',
						type: 'movie',
						viewedAt: yearFilter2024.startTimestamp + 2000,
						accountId: 1,
						librarySectionId: 1
					},
					{
						historyKey: 'hist-3',
						ratingKey: 'key-3',
						title: 'Movie 3',
						type: 'movie',
						viewedAt: yearFilter2023.startTimestamp + 1000,
						accountId: 1,
						librarySectionId: 1
					}
				]);
			});

			it('clears all play history when no year specified', async () => {
				const deleted = await clearPlayHistory();

				expect(deleted).toBe(3);
				const remaining = await countPlayHistory();
				expect(remaining).toBe(0);
			});

			it('clears play history for specific year only', async () => {
				const deleted = await clearPlayHistory(2024);

				expect(deleted).toBe(2);
				const remaining = await countPlayHistory();
				expect(remaining).toBe(1);
			});

			it('returns 0 when no history for year', async () => {
				const deleted = await clearPlayHistory(2022);

				expect(deleted).toBe(0);
			});

			it('cascades to clear stats cache when deleting all history', async () => {
				await db.delete(cachedStats);
				await db.insert(cachedStats).values([
					{ userId: 1, year: 2024, statsType: 'user', statsJson: '{}' },
					{ userId: 1, year: 2023, statsType: 'user', statsJson: '{}' }
				]);

				await clearPlayHistory();

				const cacheCount = await countStatsCache();
				expect(cacheCount).toBe(0);
			});

			it('cascades to clear year-specific stats cache', async () => {
				await db.delete(cachedStats);
				await db.insert(cachedStats).values([
					{ userId: 1, year: 2024, statsType: 'user', statsJson: '{}' },
					{ userId: 1, year: 2023, statsType: 'user', statsJson: '{}' }
				]);

				await clearPlayHistory(2024);

				const cache2024 = await countStatsCache(2024);
				const cache2023 = await countStatsCache(2023);
				expect(cache2024).toBe(0);
				expect(cache2023).toBe(1);
			});
		});
	});

	describe('API Configuration', () => {
		describe('getApiConfigWithSources', () => {
			it('returns env values when env vars are configured', async () => {
				const config = await getApiConfigWithSources();

				expect(config.plex.serverUrl.value).toBe('https://test-plex-server:32400');
				expect(config.plex.serverUrl.source).toBe('env');
				expect(config.plex.serverUrl.isLocked).toBe(true);
				expect(config.plex.token.value).toBe('test-plex-token');
				expect(config.plex.token.source).toBe('env');
				expect(config.plex.token.isLocked).toBe(true);

				expect(config.openai.baseUrl.value).toBe('https://api.openai.com/v1');
				expect(config.openai.baseUrl.source).toBe('default');
				expect(config.openai.baseUrl.isLocked).toBe(false);
				expect(config.openai.model.value).toBe('gpt-4o-mini');
				expect(config.openai.model.source).toBe('default');
				expect(config.openai.model.isLocked).toBe(false);
			});

			it('prioritizes DB values over defaults (when ENV not set)', async () => {
				await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4');
				await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'http://custom-api:8080/v1');

				const config = await getApiConfigWithSources();

				expect(config.openai.model.value).toBe('gpt-4');
				expect(config.openai.model.source).toBe('db');
				expect(config.openai.model.isLocked).toBe(false);
				expect(config.openai.baseUrl.value).toBe('http://custom-api:8080/v1');
				expect(config.openai.baseUrl.source).toBe('db');
				expect(config.openai.baseUrl.isLocked).toBe(false);
			});

			it('prioritizes ENV values over DB values', async () => {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://db-plex:32400');
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'db-token-value');

				const config = await getApiConfigWithSources();

				expect(config.plex.serverUrl.value).toBe('https://test-plex-server:32400');
				expect(config.plex.serverUrl.source).toBe('env');
				expect(config.plex.serverUrl.isLocked).toBe(true);
				expect(config.plex.token.value).toBe('test-plex-token');
				expect(config.plex.token.source).toBe('env');
				expect(config.plex.token.isLocked).toBe(true);
			});

			it('locks a real localhost Plex deployment supplied via ENV (ISSUE-002)', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const prevUrl = dynamicEnv.PLEX_SERVER_URL;
				const prevToken = dynamicEnv.PLEX_TOKEN;
				// Real localhost deployment: the .env.example localhost URL paired with a
				// REAL (non-placeholder) token. Onboarding may have written matching DB
				// rows, but ENV must win and lock both fields.
				dynamicEnv.PLEX_SERVER_URL = 'http://localhost:32400';
				dynamicEnv.PLEX_TOKEN = 'a-real-plex-token-value';
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://localhost:32400');
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'a-real-plex-token-value');

				try {
					const config = await getApiConfigWithSources();
					expect(config.plex.serverUrl.source).toBe('env');
					expect(config.plex.serverUrl.isLocked).toBe(true);
					expect(config.plex.token.source).toBe('env');
					expect(config.plex.token.isLocked).toBe(true);
				} finally {
					dynamicEnv.PLEX_SERVER_URL = prevUrl;
					dynamicEnv.PLEX_TOKEN = prevToken;
				}
			});

			it('does NOT lock a bare .env.example localhost copy (placeholder token) (ISSUE-002)', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const prevUrl = dynamicEnv.PLEX_SERVER_URL;
				const prevToken = dynamicEnv.PLEX_TOKEN;
				// Bare template copy: localhost URL + the shipped placeholder token. The
				// field must stay editable so onboarding can proceed.
				dynamicEnv.PLEX_SERVER_URL = 'http://localhost:32400';
				dynamicEnv.PLEX_TOKEN = 'your-plex-token-here';

				try {
					const config = await getApiConfigWithSources();
					expect(config.plex.serverUrl.isLocked).toBe(false);
					expect(config.plex.serverUrl.source).not.toBe('env');
					expect(config.plex.token.isLocked).toBe(false);
				} finally {
					dynamicEnv.PLEX_SERVER_URL = prevUrl;
					dynamicEnv.PLEX_TOKEN = prevToken;
				}
			});
		});

		describe('isAuthoritativePlexServerUrl (ISSUE-002)', () => {
			it('treats a non-localhost real URL as authoritative regardless of token', () => {
				expect(isAuthoritativePlexServerUrl('https://plex.example.com:32400', '')).toBe(true);
				expect(isAuthoritativePlexServerUrl('https://plex.example.com:32400', 'tok')).toBe(true);
			});

			it('treats localhost as authoritative ONLY when paired with a real token', () => {
				expect(isAuthoritativePlexServerUrl('http://localhost:32400', 'a-real-token')).toBe(true);
			});

			it('treats a bare .env.example localhost copy as a placeholder (not authoritative)', () => {
				expect(isAuthoritativePlexServerUrl('http://localhost:32400', 'your-plex-token-here')).toBe(
					false
				);
				expect(isAuthoritativePlexServerUrl('http://localhost:32400', '')).toBe(false);
			});

			it('canonicalizes cosmetic localhost variants (trailing slash / whitespace)', () => {
				// A near-bare template copy with only a cosmetic difference from the
				// .env.example default must NOT slip past the placeholder check and
				// env-lock the connections UI with a placeholder token.
				expect(
					isAuthoritativePlexServerUrl('http://localhost:32400/', 'your-plex-token-here')
				).toBe(false);
				expect(
					isAuthoritativePlexServerUrl('  http://localhost:32400/  ', 'your-plex-token-here')
				).toBe(false);
				// A genuine localhost deployment (real token) still locks regardless of
				// the cosmetic trailing slash.
				expect(isAuthoritativePlexServerUrl('http://localhost:32400/', 'a-real-token')).toBe(true);
			});
		});

		describe('hasPlexEnvConfig', () => {
			it('returns true when Plex env vars are set', () => {
				const hasConfig = hasPlexEnvConfig();
				expect(hasConfig).toBe(true);
			});

			it('treats shipped .env.example placeholders as unset (ISSUE-004 lockout guard)', () => {
				// A deployer who uncomments the .env.example template without editing
				// it must NOT be flipped into the env-locked onboarding flow: the same
				// placeholders resolve to empty in getApiConfigWithSources, so claiming
				// "env config present" strands them with no usable config and no manual
				// picker / 400-blocked forceManualSelection. Must match resolveConfigValue.
				const dynamicEnv = env as Record<string, string | undefined>;
				const prevUrl = dynamicEnv.PLEX_SERVER_URL;
				const prevToken = dynamicEnv.PLEX_TOKEN;
				dynamicEnv.PLEX_SERVER_URL = 'http://localhost:32400';
				dynamicEnv.PLEX_TOKEN = 'your-plex-token-here';

				try {
					expect(hasPlexEnvConfig()).toBe(false);
				} finally {
					dynamicEnv.PLEX_SERVER_URL = prevUrl;
					dynamicEnv.PLEX_TOKEN = prevToken;
				}
			});

			it('returns true when at least one Plex env var is a real (non-placeholder) value', () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const prevUrl = dynamicEnv.PLEX_SERVER_URL;
				const prevToken = dynamicEnv.PLEX_TOKEN;
				// Real URL + placeholder token -> still authoritative via the URL.
				dynamicEnv.PLEX_SERVER_URL = 'https://plex.example.com:32400';
				dynamicEnv.PLEX_TOKEN = 'your-plex-token-here';

				try {
					expect(hasPlexEnvConfig()).toBe(true);
				} finally {
					dynamicEnv.PLEX_SERVER_URL = prevUrl;
					dynamicEnv.PLEX_TOKEN = prevToken;
				}
			});

			it('returns false when both Plex env vars are empty', () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const prevUrl = dynamicEnv.PLEX_SERVER_URL;
				const prevToken = dynamicEnv.PLEX_TOKEN;
				dynamicEnv.PLEX_SERVER_URL = '';
				dynamicEnv.PLEX_TOKEN = '';

				try {
					expect(hasPlexEnvConfig()).toBe(false);
				} finally {
					dynamicEnv.PLEX_SERVER_URL = prevUrl;
					dynamicEnv.PLEX_TOKEN = prevToken;
				}
			});
		});

		describe('hasOpenAIEnvConfig', () => {
			it('returns false when no OpenAI env vars set', () => {
				const hasConfig = hasOpenAIEnvConfig();
				expect(hasConfig).toBe(false);
			});
		});

		describe('isPlaceholderSentinel', () => {
			it('detects the shipped Plex token placeholder', () => {
				expect(isPlaceholderSentinel('your-plex-token-here')).toBe(true);
			});

			it('detects the shipped Plex URL placeholders', () => {
				expect(isPlaceholderSentinel('http://localhost:32400')).toBe(true);
				expect(isPlaceholderSentinel('http://plex-url-here:32400')).toBe(true);
			});

			it('detects generic your-*-here placeholders', () => {
				expect(isPlaceholderSentinel('your-api-key-here')).toBe(true);
				expect(isPlaceholderSentinel('your-secret-here')).toBe(true);
			});

			it('detects change-me / changeme / placeholder sentinels', () => {
				expect(isPlaceholderSentinel('change-me')).toBe(true);
				expect(isPlaceholderSentinel('changeme')).toBe(true);
				expect(isPlaceholderSentinel('CHANGEME')).toBe(true);
				expect(isPlaceholderSentinel('placeholder')).toBe(true);
				expect(isPlaceholderSentinel('PLACEHOLDER')).toBe(true);
			});

			it('returns false for empty / whitespace strings (caller decides)', () => {
				expect(isPlaceholderSentinel('')).toBe(false);
				expect(isPlaceholderSentinel('   ')).toBe(false);
			});

			it('returns false for real-looking values', () => {
				expect(isPlaceholderSentinel('abc123def456ghi789')).toBe(false);
				expect(isPlaceholderSentinel('https://plex.example.com:32400')).toBe(false);
				expect(isPlaceholderSentinel('http://192.168.1.10:32400')).toBe(false);
				expect(isPlaceholderSentinel('http://plex.local:32400')).toBe(false);
			});

			it('trims surrounding whitespace before matching', () => {
				expect(isPlaceholderSentinel('  your-plex-token-here  ')).toBe(true);
				expect(isPlaceholderSentinel('  http://localhost:32400 ')).toBe(true);
			});
		});

		describe('getPlexConfig', () => {
			it('treats local HTTP Plex URL without opt-in as not configured', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousAllowInsecure = dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP;
				dynamicEnv.PLEX_SERVER_URL = '';
				dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = undefined;

				try {
					await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://192.168.1.10:32400');

					const config = await getPlexConfig();

					expect(config.serverUrl).toBe('');
					expect(config.token).toBe('test-plex-token');
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = previousAllowInsecure;
				}
			});

			it('treats public HTTP Plex URL as not configured even with opt-in', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousAllowInsecure = dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP;
				dynamicEnv.PLEX_SERVER_URL = '';
				dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = undefined;

				try {
					await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.example.com:32400');
					await setAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP, 'true');

					const config = await getPlexConfig();

					expect(config.serverUrl).toBe('');
					expect(config.token).toBe('test-plex-token');
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = previousAllowInsecure;
				}
			});

			it('fingerprints equivalent Plex URLs with the same authority discriminator', () => {
				const canonical = getPlexConfigFingerprint({
					serverUrl: 'https://plex.example.com:32400',
					token: 'same-token'
				});
				const nonCanonical = getPlexConfigFingerprint({
					serverUrl: '  https://PLEX.example.com:32400///  ',
					token: 'same-token'
				});

				expect(nonCanonical).toBe(canonical);
			});
		});

		describe('clearConflictingDbSettings', () => {
			it('clears DB settings when ENV values exist', async () => {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://db-url:32400');
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'db-token');

				const cleared = await clearConflictingDbSettings();

				expect(cleared).toContain('PLEX_SERVER_URL');
				expect(cleared).toContain('PLEX_TOKEN');

				const dbUrl = await getAppSetting(AppSettingsKey.PLEX_SERVER_URL);
				const dbToken = await getAppSetting(AppSettingsKey.PLEX_TOKEN);
				expect(dbUrl).toBeNull();
				expect(dbToken).toBeNull();
			});

			it('preserves DB settings when no ENV values exist', async () => {
				await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'custom-model');
				await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'http://custom-api:8080/v1');

				const cleared = await clearConflictingDbSettings();

				expect(cleared).not.toContain('OPENAI_MODEL');
				expect(cleared).not.toContain('OPENAI_BASE_URL');

				const model = await getAppSetting(AppSettingsKey.OPENAI_MODEL);
				const baseUrl = await getAppSetting(AppSettingsKey.OPENAI_BASE_URL);
				expect(model).toBe('custom-model');
				expect(baseUrl).toBe('http://custom-api:8080/v1');
			});

			it('returns correct labels for cleared settings', async () => {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://db-url:32400');

				const cleared = await clearConflictingDbSettings();

				expect(cleared).toEqual(['PLEX_SERVER_URL']);
			});

			it('returns empty array when no conflicts exist', async () => {
				const cleared = await clearConflictingDbSettings();

				expect(cleared).toEqual([]);
			});

			it('preserves real DB values when ENV is a placeholder sentinel', async () => {
				// Deployer copies .env.example unedited (placeholder) but configures a
				// real Plex URL/token via the admin UI (DB). The placeholder env must
				// NOT clear the real DB rows, matching resolveConfigValue's behavior.
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousPlexToken = dynamicEnv.PLEX_TOKEN;
				dynamicEnv.PLEX_SERVER_URL = 'http://localhost:32400';
				dynamicEnv.PLEX_TOKEN = 'your-plex-token-here';

				try {
					await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'https://real-plex:32400');
					await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'real-token');

					const cleared = await clearConflictingDbSettings();

					expect(cleared).not.toContain('PLEX_SERVER_URL');
					expect(cleared).not.toContain('PLEX_TOKEN');

					const dbUrl = await getAppSetting(AppSettingsKey.PLEX_SERVER_URL);
					const dbToken = await getAppSetting(AppSettingsKey.PLEX_TOKEN);
					expect(dbUrl).toBe('https://real-plex:32400');
					expect(dbToken).toBe('real-token');
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_TOKEN = previousPlexToken;
				}
			});

			it('clears a legacy cached machineId when ENV Plex config is a placeholder', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousPlexToken = dynamicEnv.PLEX_TOKEN;
				dynamicEnv.PLEX_SERVER_URL = 'http://localhost:32400';
				dynamicEnv.PLEX_TOKEN = 'your-plex-token-here';

				try {
					await setAppSetting(AppSettingsKey.SERVER_MACHINE_ID, 'cached-machine-id');

					const cleared = await clearConflictingDbSettings();

					expect(cleared).toContain('PLEX_AUTHORITY');
					const machineId = await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID);
					expect(machineId).toBeNull();
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_TOKEN = previousPlexToken;
				}
			});

			it('preserves unchanged ENV Plex authority and advances A to B to A without intermediate reconciliation', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousPlexToken = dynamicEnv.PLEX_TOKEN;
				const machineId = 'env-machine';

				const seedProof = async (serverUrl: string, token: string, epoch: string) => {
					const fingerprint = getPlexConfigFingerprint({ serverUrl, token });
					await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH, epoch);
					await setAppSetting(
						AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
						getPlexConfigFingerprint({ serverUrl, token })
					);
					await setAppSetting(AppSettingsKey.SERVER_MACHINE_ID, machineId);
					await setAppSetting(
						AppSettingsKey.PLEX_IDENTITY_PROOF,
						JSON.stringify({ configFingerprint: fingerprint, machineIdentifier: machineId })
					);
				};

				try {
					dynamicEnv.PLEX_SERVER_URL = 'https://env-a.example.com:32400';
					dynamicEnv.PLEX_TOKEN = 'env-token-a';
					await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'https://shadowed.example.com');
					await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'shadowed-token');
					await seedProof(dynamicEnv.PLEX_SERVER_URL, dynamicEnv.PLEX_TOKEN, '7');

					const unchanged = await clearConflictingDbSettings();
					expect(unchanged).toContain('PLEX_SERVER_URL');
					expect(unchanged).toContain('PLEX_TOKEN');
					expect(unchanged).not.toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('7');
					expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBe(machineId);
					expect(await getAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF)).not.toBeNull();

					expect(await clearConflictingDbSettings()).toEqual([]);
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('7');

					dynamicEnv.PLEX_SERVER_URL = 'https://env-b.example.com:32400';
					dynamicEnv.PLEX_TOKEN = 'env-token-b';
					expect(await clearConflictingDbSettings()).toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('8');
					expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBeNull();
					expect(await getAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF)).toBeNull();

					dynamicEnv.PLEX_SERVER_URL = 'https://env-a.example.com:32400';
					dynamicEnv.PLEX_TOKEN = 'env-token-a';
					expect(await clearConflictingDbSettings()).toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('9');
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_TOKEN = previousPlexToken;
				}
			});
			it('advances through configured to unconfigured to the same configured authority', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousPlexToken = dynamicEnv.PLEX_TOKEN;
				const authority = {
					serverUrl: 'https://env-a.example.com:32400',
					token: 'env-token-a'
				};

				try {
					dynamicEnv.PLEX_SERVER_URL = authority.serverUrl;
					dynamicEnv.PLEX_TOKEN = authority.token;
					await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH, '20');
					await setAppSetting(
						AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
						getPlexConfigFingerprint(authority)
					);

					expect(await clearConflictingDbSettings()).toEqual([]);
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('20');

					dynamicEnv.PLEX_SERVER_URL = '';
					dynamicEnv.PLEX_TOKEN = '';
					expect(await clearConflictingDbSettings()).toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('21');

					dynamicEnv.PLEX_SERVER_URL = authority.serverUrl;
					dynamicEnv.PLEX_TOKEN = authority.token;
					expect(await clearConflictingDbSettings()).toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('22');
					expect(await clearConflictingDbSettings()).toEqual([]);
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('22');
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_TOKEN = previousPlexToken;
				}
			});

			it('fails closed for malformed and legacy authority discriminators', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousPlexToken = dynamicEnv.PLEX_TOKEN;
				const authority = {
					serverUrl: 'https://env-a.example.com:32400',
					token: 'env-token-a'
				};

				try {
					dynamicEnv.PLEX_SERVER_URL = authority.serverUrl;
					dynamicEnv.PLEX_TOKEN = authority.token;
					await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH, '90071992547409931234567890');
					await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR, 'malformed');
					await setAppSetting(AppSettingsKey.SERVER_MACHINE_ID, 'stale-machine');

					expect(await clearConflictingDbSettings()).toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe(
						'90071992547409931234567891'
					);
					expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBeNull();

					await deleteAppSetting(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR);
					expect(await clearConflictingDbSettings()).toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe(
						'90071992547409931234567892'
					);

					await setAppSetting(
						AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
						getPlexConfigFingerprint(authority)
					);
					await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH, 'not-an-epoch');
					await setAppSetting(AppSettingsKey.SERVER_MACHINE_ID, 'stale-machine');
					expect(await clearConflictingDbSettings()).toContain('PLEX_AUTHORITY');
					expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('1');
					expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBeNull();
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_TOKEN = previousPlexToken;
				}
			});
		});

		describe('isPlexConfigured', () => {
			it('returns true when both serverUrl and token are configured', async () => {
				const configured = await isPlexConfigured();
				expect(configured).toBe(true);
			});

			it('returns false when stored Plex URL fails policy validation', async () => {
				const dynamicEnv = env as Record<string, string | undefined>;
				const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
				const previousAllowInsecure = dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP;
				dynamicEnv.PLEX_SERVER_URL = '';
				dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = undefined;

				try {
					await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://192.168.1.10:32400');

					const configured = await isPlexConfigured();

					expect(configured).toBe(false);
				} finally {
					dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
					dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = previousAllowInsecure;
				}
			});
		});
	});

	describe('UI Theme Settings', () => {
		describe('getUITheme', () => {
			it('returns default theme when no setting exists', async () => {
				const theme = await getUITheme();
				expect(theme).toBe(ThemePresets.MODERN_MINIMAL);
			});

			it('returns stored theme when valid', async () => {
				await setAppSetting(AppSettingsKey.UI_THEME, ThemePresets.SUPABASE);
				const theme = await getUITheme();
				expect(theme).toBe(ThemePresets.SUPABASE);
			});

			it('returns default for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.UI_THEME, 'invalid-theme');
				const theme = await getUITheme();
				expect(theme).toBe(ThemePresets.MODERN_MINIMAL);
			});
		});

		describe('setUITheme', () => {
			it('sets theme correctly', async () => {
				await setUITheme(ThemePresets.DOOM_64);
				const theme = await getUITheme();
				expect(theme).toBe(ThemePresets.DOOM_64);
			});
		});
	});

	describe('CSRF Configuration', () => {
		describe('getCsrfConfigWithSource', () => {
			it('returns default values when no config exists', async () => {
				const config = await getCsrfConfigWithSource();
				expect(config.origin.value).toBe('');
				expect(config.origin.source).toBe('default');
				expect(config.origin.isLocked).toBe(false);
			});

			it('returns DB value when set in database', async () => {
				await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');
				const config = await getCsrfConfigWithSource();
				expect(config.origin.value).toBe('https://example.com');
				expect(config.origin.source).toBe('db');
				expect(config.origin.isLocked).toBe(false);
			});
		});

		describe('getCsrfOrigin', () => {
			it('returns null when no origin configured', async () => {
				const origin = await getCsrfOrigin();
				expect(origin).toBeNull();
			});

			it('returns origin value when configured', async () => {
				await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');
				const origin = await getCsrfOrigin();
				expect(origin).toBe('https://example.com');
			});
		});

		describe('isCsrfWarningDismissed', () => {
			it('returns false when not dismissed', async () => {
				const dismissed = await isCsrfWarningDismissed();
				expect(dismissed).toBe(false);
			});

			it('returns true when dismissed', async () => {
				await setAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED, 'true');
				const dismissed = await isCsrfWarningDismissed();
				expect(dismissed).toBe(true);
			});

			it('returns false for invalid stored value', async () => {
				await setAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED, 'invalid');
				const dismissed = await isCsrfWarningDismissed();
				expect(dismissed).toBe(false);
			});
		});

		describe('dismissCsrfWarning', () => {
			it('sets dismissed state to true', async () => {
				await dismissCsrfWarning();
				const dismissed = await isCsrfWarningDismissed();
				expect(dismissed).toBe(true);
			});
		});

		describe('resetCsrfWarningDismissal', () => {
			it('resets dismissed state', async () => {
				await dismissCsrfWarning();
				await resetCsrfWarningDismissal();
				const dismissed = await isCsrfWarningDismissed();
				expect(dismissed).toBe(false);
			});
		});
	});

	describe('setApiConfigAtomic', () => {
		const allUnlocked = {
			plexServerUrl: false,
			plexToken: false,
			openaiApiKey: false,
			openaiBaseUrl: false,
			openaiModel: false
		};

		it('writes all provided values when version is fresh', async () => {
			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: 'http://plex.example.com:32400',
					plexToken: 'tok-1',
					openaiApiKey: 'sk-test',
					openaiBaseUrl: 'https://api.example.com',
					openaiModel: 'gpt-4o'
				},
				locks: allUnlocked,
				submittedVersion: new Date(Date.now() + 60_000).toISOString()
			});

			expect(result.status).toBe('ok');
			expect(result.plexCredentialsChanged).toBe(true);
			expect(await getAppSetting(AppSettingsKey.PLEX_SERVER_URL)).toBe(
				'http://plex.example.com:32400'
			);
			expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('tok-1');
			expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBe('sk-test');
			expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBe('https://api.example.com');
			expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBe('gpt-4o');
		});

		it('returns conflict when submitted version is stale', async () => {
			await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4o');
			const stale = new Date(Date.now() - 60_000).toISOString();

			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: undefined,
					openaiModel: 'gpt-5-mini'
				},
				locks: allUnlocked,
				submittedVersion: stale
			});

			expect(result.status).toBe('conflict');
			expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBe('gpt-4o');
		});

		it('returns conflict when submitted version is empty and rows exist', async () => {
			await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4o');

			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: undefined,
					openaiModel: 'gpt-5-mini'
				},
				locks: allUnlocked,
				submittedVersion: ''
			});

			expect(result.status).toBe('conflict');
		});

		// Regression: previously the OCC check was skipped when no API_CONFIG_KEYS
		// rows existed (fresh install or all keys cleared), letting a write through
		// with an empty submittedVersion. The check must now reject empty/blank
		// versions regardless of row count.
		it('returns conflict when submitted version is empty and rows do NOT exist', async () => {
			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: undefined,
					openaiModel: 'gpt-5-mini'
				},
				locks: allUnlocked,
				submittedVersion: ''
			});

			expect(result.status).toBe('conflict');
			expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBeNull();
		});

		it('skips locked fields silently', async () => {
			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: 'http://plex.example.com:32400',
					plexToken: 'tok-x',
					openaiApiKey: 'sk-x',
					openaiBaseUrl: undefined,
					openaiModel: undefined
				},
				locks: {
					plexServerUrl: true,
					plexToken: true,
					openaiApiKey: false,
					openaiBaseUrl: false,
					openaiModel: false
				},
				submittedVersion: new Date(Date.now() + 60_000).toISOString()
			});

			expect(result.status).toBe('ok');
			expect(result.plexCredentialsChanged).toBe(false);
			expect(await getAppSetting(AppSettingsKey.PLEX_SERVER_URL)).toBeNull();
			expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBeNull();
			expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBe('sk-x');
		});

		it('treats undefined values as no-change (absent fields are not touched)', async () => {
			await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'sk-existing');
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.example.com:32400');

			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: undefined,
					openaiModel: 'gpt-5-mini'
				},
				locks: allUnlocked,
				submittedVersion: new Date(Date.now() + 60_000).toISOString()
			});

			expect(result.status).toBe('ok');
			expect(result.plexCredentialsChanged).toBe(false);
			expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBe('sk-existing');
			expect(await getAppSetting(AppSettingsKey.PLEX_SERVER_URL)).toBe(
				'http://plex.example.com:32400'
			);
			expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBe('gpt-5-mini');
		});

		// Regression: an OpenAI-panel save must not wipe Plex rows. The two panels
		// are separate <form> elements both targeting `?/updateApiConfig`, so the
		// submission omits the other panel's inputs entirely (formData.has === false).
		it('does not touch Plex rows when only OpenAI fields are submitted', async () => {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.example.com:32400');
			await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'plex-secret');

			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: 'sk-new',
					openaiBaseUrl: 'https://api.example.com',
					openaiModel: 'gpt-4o'
				},
				locks: allUnlocked,
				submittedVersion: new Date(Date.now() + 60_000).toISOString()
			});

			expect(result.status).toBe('ok');
			expect(result.plexCredentialsChanged).toBe(false);
			expect(await getAppSetting(AppSettingsKey.PLEX_SERVER_URL)).toBe(
				'http://plex.example.com:32400'
			);
			expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('plex-secret');
			expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBe('sk-new');
			expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBe('gpt-4o');
		});

		it('advances only Plex authority changes and clears stale machine proof atomically', async () => {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.example.com:32400');
			await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'plex-secret');
			await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH, '7');
			await setAppSetting(AppSettingsKey.SERVER_MACHINE_ID, 'machine-old');
			await setAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF, '{"proof":"old"}');

			const unrelated = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: 'sk-new',
					openaiBaseUrl: undefined,
					openaiModel: undefined
				},
				locks: allUnlocked,
				submittedVersion: new Date(Date.now() + 60_000).toISOString()
			});
			expect(unrelated).toMatchObject({ status: 'ok', plexCredentialsChanged: false });
			expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('7');
			expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBe('machine-old');
			expect(await getAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF)).toBe('{"proof":"old"}');

			const changed = await setApiConfigAtomic({
				values: {
					plexServerUrl: 'http://plex-new.example.com:32400',
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: undefined,
					openaiModel: undefined
				},
				locks: allUnlocked,
				submittedVersion: new Date(Date.now() + 120_000).toISOString()
			});
			expect(changed).toMatchObject({ status: 'ok', plexCredentialsChanged: true });
			expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('8');
			expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBeNull();
			expect(await getAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF)).toBeNull();
		});

		it('retains authority proof when a submitted Plex URL has the same normalized fingerprint', async () => {
			const dynamicEnv = env as Record<string, string | undefined>;
			const previousPlexServerUrl = dynamicEnv.PLEX_SERVER_URL;
			const previousPlexToken = dynamicEnv.PLEX_TOKEN;
			const serverUrl = 'https://plex.example.com:32400';
			const token = 'plex-secret';

			try {
				dynamicEnv.PLEX_SERVER_URL = '';
				dynamicEnv.PLEX_TOKEN = '';
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, serverUrl);
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, token);
				await setAppSetting(
					AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR,
					getPlexConfigFingerprint({ serverUrl, token })
				);
				await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH, '7');
				await setAppSetting(AppSettingsKey.SERVER_MACHINE_ID, 'machine-old');
				await setAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF, '{"proof":"old"}');

				const result = await setApiConfigAtomic({
					values: {
						plexServerUrl: '  https://PLEX.example.com:32400///  ',
						plexToken: undefined,
						openaiApiKey: undefined,
						openaiBaseUrl: undefined,
						openaiModel: undefined
					},
					locks: allUnlocked,
					submittedVersion: new Date(Date.now() + 60_000).toISOString()
				});

				expect(result).toMatchObject({ status: 'ok', plexCredentialsChanged: true });
				expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('7');
				expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBe('machine-old');
				expect(await getAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF)).toBe('{"proof":"old"}');
			} finally {
				dynamicEnv.PLEX_SERVER_URL = previousPlexServerUrl;
				dynamicEnv.PLEX_TOKEN = previousPlexToken;
			}
		});
		it('does not let newer authority bookkeeping reject a fresh API config version', async () => {
			await setAppSetting(AppSettingsKey.API_CONFIG_VERSION, 'config-version');
			const submittedVersion = await getAppSettingsUpdatedAt(API_CONFIG_KEYS);
			expect(submittedVersion).not.toBeNull();

			await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH, '7');
			await setAppSetting(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR, 'a'.repeat(64));

			const fresh = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: undefined,
					openaiModel: 'gpt-4o'
				},
				locks: allUnlocked,
				submittedVersion: submittedVersion!.toISOString()
			});
			expect(fresh.status).toBe('ok');

			const stale = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: undefined,
					openaiModel: 'gpt-4.1'
				},
				locks: allUnlocked,
				submittedVersion: submittedVersion!.toISOString()
			});
			expect(stale.status).toBe('conflict');
		});

		it('clears echoed-back keys when submitted as empty string', async () => {
			await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'https://api.example.com');
			await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4o');

			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: '',
					openaiModel: ''
				},
				locks: allUnlocked,
				submittedVersion: new Date(Date.now() + 60_000).toISOString()
			});

			expect(result.status).toBe('ok');
			expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBeNull();
			expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBeNull();
		});

		it('treats empty string for secret keys as no-op (never clears stored secret)', async () => {
			await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'plex-secret');
			await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'sk-existing');

			const result = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: '',
					openaiApiKey: '',
					openaiBaseUrl: undefined,
					openaiModel: undefined
				},
				locks: allUnlocked,
				submittedVersion: new Date(Date.now() + 60_000).toISOString()
			});

			expect(result.status).toBe('ok');
			expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('plex-secret');
			expect(await getAppSetting(AppSettingsKey.OPENAI_API_KEY)).toBe('sk-existing');
		});

		// Regression: a clear-only mutation in tab A must advance the OCC version
		// so that tab B (holding the pre-clear version) cannot resurrect the value.
		it('advances the OCC version when a clear is the only mutation', async () => {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.example.com:32400');
			await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'https://api.example.com');

			const versionBeforeClear = await getAppSettingsUpdatedAt([
				AppSettingsKey.PLEX_SERVER_URL,
				AppSettingsKey.PLEX_TOKEN,
				AppSettingsKey.OPENAI_API_KEY,
				AppSettingsKey.OPENAI_BASE_URL,
				AppSettingsKey.OPENAI_MODEL,
				AppSettingsKey.API_CONFIG_VERSION
			]);

			await new Promise((r) => setTimeout(r, 5));

			// Tab A submits the version it loaded and clears OPENAI_BASE_URL only.
			const tabA = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: '',
					openaiModel: undefined
				},
				locks: allUnlocked,
				submittedVersion: versionBeforeClear?.toISOString() ?? ''
			});
			expect(tabA.status).toBe('ok');
			expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBeNull();

			// Tab B still holds the pre-clear version. It must now lose OCC.
			const tabB = await setApiConfigAtomic({
				values: {
					plexServerUrl: undefined,
					plexToken: undefined,
					openaiApiKey: undefined,
					openaiBaseUrl: 'https://api.example.com',
					openaiModel: undefined
				},
				locks: allUnlocked,
				submittedVersion: versionBeforeClear?.toISOString() ?? ''
			});
			expect(tabB.status).toBe('conflict');
			// Tab B's resurrection of the cleared value must NOT have happened.
			expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBeNull();
		});

		// Regression: clearing PLEX_SERVER_URL must flag plexCredentialsChanged so
		// the caller evicts the cached machineId — otherwise stale cache survives
		// until the next non-empty credential change.
		describe('plexCredentialsChanged flag', () => {
			it('is true when PLEX_SERVER_URL is cleared (empty string)', async () => {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.example.com:32400');

				const result = await setApiConfigAtomic({
					values: {
						plexServerUrl: '',
						plexToken: undefined,
						openaiApiKey: undefined,
						openaiBaseUrl: undefined,
						openaiModel: undefined
					},
					locks: allUnlocked,
					submittedVersion: new Date(Date.now() + 60_000).toISOString()
				});

				expect(result.status).toBe('ok');
				expect(result.plexCredentialsChanged).toBe(true);
				expect(await getAppSetting(AppSettingsKey.PLEX_SERVER_URL)).toBeNull();
			});

			it('is false when PLEX_SERVER_URL is undefined (cross-panel save)', async () => {
				const result = await setApiConfigAtomic({
					values: {
						plexServerUrl: undefined,
						plexToken: undefined,
						openaiApiKey: 'sk-new',
						openaiBaseUrl: undefined,
						openaiModel: undefined
					},
					locks: allUnlocked,
					submittedVersion: new Date(Date.now() + 60_000).toISOString()
				});

				expect(result.status).toBe('ok');
				expect(result.plexCredentialsChanged).toBe(false);
			});

			it('is true when PLEX_SERVER_URL is set to a new value', async () => {
				const result = await setApiConfigAtomic({
					values: {
						plexServerUrl: 'http://plex.example.com:32400',
						plexToken: undefined,
						openaiApiKey: undefined,
						openaiBaseUrl: undefined,
						openaiModel: undefined
					},
					locks: allUnlocked,
					submittedVersion: new Date(Date.now() + 60_000).toISOString()
				});

				expect(result.status).toBe('ok');
				expect(result.plexCredentialsChanged).toBe(true);
				expect(await getAppSetting(AppSettingsKey.PLEX_SERVER_URL)).toBe(
					'http://plex.example.com:32400'
				);
			});

			it('is false when PLEX_SERVER_URL clear is locked (env-driven)', async () => {
				const result = await setApiConfigAtomic({
					values: {
						plexServerUrl: '',
						plexToken: undefined,
						openaiApiKey: undefined,
						openaiBaseUrl: undefined,
						openaiModel: undefined
					},
					locks: { ...allUnlocked, plexServerUrl: true },
					submittedVersion: new Date(Date.now() + 60_000).toISOString()
				});

				expect(result.status).toBe('ok');
				expect(result.plexCredentialsChanged).toBe(false);
			});

			it('is false when only PLEX_TOKEN is submitted as empty (writeSecret no-op)', async () => {
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, 'plex-secret');

				const result = await setApiConfigAtomic({
					values: {
						plexServerUrl: undefined,
						plexToken: '',
						openaiApiKey: undefined,
						openaiBaseUrl: undefined,
						openaiModel: undefined
					},
					locks: allUnlocked,
					submittedVersion: new Date(Date.now() + 60_000).toISOString()
				});

				expect(result.status).toBe('ok');
				expect(result.plexCredentialsChanged).toBe(false);
				expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('plex-secret');
			});
		});
	});
});
