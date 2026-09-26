<script lang="ts">
import FlaskConicalIcon from '@lucide/svelte/icons/flask-conical';
import KeyRoundIcon from '@lucide/svelte/icons/key-round';
import ServerIcon from '@lucide/svelte/icons/server';
import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
import SparklesIcon from '@lucide/svelte/icons/sparkles';
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import {
	SettingsActionBar,
	SettingsStatusPill,
	SettingsToggleRow
} from '$lib/components/settings/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

const settings = $derived(data.settings);

// svelte-ignore state_referenced_locally
let plexServerUrl = $state(settings.plexServerUrl.value);
let plexTokenInput = $state('');
// svelte-ignore state_referenced_locally
let plexAllowInsecureLocalHttp = $state(settings.plexAllowInsecureLocalHttp);

let openaiApiKeyInput = $state('');
// svelte-ignore state_referenced_locally
let openaiBaseUrl = $state(settings.openaiBaseUrl.value);
// svelte-ignore state_referenced_locally
let openaiModel = $state(
	settings.openaiModel.source === 'default' ? '' : (settings.openaiModel.value ?? '')
);

// Both panels share one OCC token; keep the successful save's fresh version locally.
// svelte-ignore state_referenced_locally
let apiConfigVersion = $state(data.apiConfigVersion);

let openaiBaseUrlError = $state<string | undefined>(undefined);
let openaiModelError = $state<string | undefined>(undefined);

let isSavingPlex = $state(false);
let isTestingPlex = $state(false);
let isSavingOpenai = $state(false);
let isTestingOpenai = $state(false);
let isClearingOpenaiKey = $state(false);
let isClearingOpenaiModel = $state(false);

const plexServerUrlLocked = $derived(settings.plexServerUrl.isLocked);
const plexTokenLocked = $derived(settings.plexToken.isLocked);
const openaiApiKeyLocked = $derived(settings.openaiApiKey.isLocked);
const openaiBaseUrlLocked = $derived(settings.openaiBaseUrl.isLocked);
const openaiModelLocked = $derived(settings.openaiModel.isLocked);

const plexAnyLocked = $derived(plexServerUrlLocked || plexTokenLocked);
const openaiAnyLocked = $derived(openaiApiKeyLocked || openaiBaseUrlLocked || openaiModelLocked);

// ISSUE-016: AI fun facts run only with an effective OpenAI key. `hasEffectiveOpenAIKey`
// (server load) reflects an authoritative env var OR a stored DB row. Surface a visible,
// non-blocking warning when no key is in effect AND none is being entered now — the
// generator silently falls back to templates otherwise, which the subtle card copy hides.
const showOpenaiKeyWarning = $derived(!data.hasEffectiveOpenAIKey && !openaiApiKeyInput.trim());
</script>

<svelte:head>
	<title>Connections - Settings - Obzorarr</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>Plex server</CardTitle>
			<CardDescription>
				URL and auth token for the Plex Media Server Obzorarr syncs from.
				{#if plexAnyLocked}
					Environment variables set the locked fields, so change them there. Obzorarr ignores
					placeholder env values (for example the shipped <code>.env.example</code> defaults) and
					leaves those fields editable here.
				{/if}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<form
				id="plex-settings-form"
				method="POST"
				action="?/updateApiConfig"
				use:enhance={({ cancel }) => {
	if (isSavingPlex) {
		cancel();
		return;
	}
	isSavingPlex = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') {
				// The sibling panel can save next without waiting for invalidateAll.
				const freshVersion = (result.data as { apiConfigVersion?: string })?.apiConfigVersion;
				if (freshVersion) apiConfigVersion = freshVersion;
				plexTokenInput = '';
				await invalidateAll();
			}
		} finally {
			isSavingPlex = false;
		}
	};
}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<Label for="plexServerUrl">Plex server URL</Label>
						{#if plexServerUrlLocked}
							<SettingsStatusPill tone="warning">ENV</SettingsStatusPill>
						{/if}
					</div>
					<Input
						id="plexServerUrl"
						name="plexServerUrl"
						type="url"
						placeholder={plexServerUrlLocked ? '(set by environment)' : 'http://plex.local:32400'}
						bind:value={plexServerUrl}
						disabled={plexServerUrlLocked}
					/>
					{#if plexServerUrlLocked}
						<p class="text-xs text-muted-foreground">Locked by environment variable.</p>
					{/if}
				</div>

				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<Label for="plexToken">
							Plex token
							{#if settings.plexToken.hasValue}
								<span class="text-xs text-muted-foreground">(stored, leave blank to keep)</span>
							{/if}
						</Label>
						{#if plexTokenLocked}
							<SettingsStatusPill tone="warning">ENV</SettingsStatusPill>
						{/if}
					</div>
					<Input
						id="plexToken"
						name="plexToken"
						type="password"
						autocomplete="off"
						placeholder={settings.plexToken.hasValue ? '••••••••' : 'X-Plex-Token value'}
						bind:value={plexTokenInput}
						disabled={plexTokenLocked}
					/>
					{#if plexTokenLocked}
						<p class="text-xs text-muted-foreground">Locked by environment variable.</p>
					{/if}
				</div>

				<SettingsToggleRow
					id="plexAllowInsecureLocalHttpToggle"
					title="Allow insecure local HTTP"
					description="Permit non-HTTPS connections to RFC1918 / loopback Plex servers. Required for typical LAN setups."
					onLabel="Allowed"
					offLabel="Blocked"
					bind:checked={plexAllowInsecureLocalHttp}
				>
					{#snippet icon()}
						<ShieldAlertIcon />
					{/snippet}
				</SettingsToggleRow>
				<input
					type="hidden"
					name="plexAllowInsecureLocalHttp"
					value={plexAllowInsecureLocalHttp ? 'true' : 'false'}
				>

				<input type="hidden" name="apiConfigVersion" value={apiConfigVersion}>
			</form>

			<SettingsActionBar>
				<form
					method="POST"
					action="?/testPlexConnection"
					use:enhance={({ cancel, formData }) => {
	if (isTestingPlex) {
		cancel();
		return;
	}
	isTestingPlex = true;
	// Connection tests should exercise unsaved edits, not only loaded data.
	// Mirror the token pattern: skip the set when ENV-locked so the
	// server-side `submittedUrl || storedUrl` fallback uses the stored URL.
	if (!plexServerUrlLocked) formData.set('plexServerUrl', plexServerUrl);
	if (plexTokenInput) formData.set('plexToken', plexTokenInput);
	formData.set('plexAllowInsecureLocalHttp', plexAllowInsecureLocalHttp ? 'true' : 'false');
	return async ({ result }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
		} finally {
			isTestingPlex = false;
		}
	};
}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isTestingPlex}>
						<FlaskConicalIcon />
						{isTestingPlex ? 'Testing…' : 'Test Plex connection'}
					</Button>
				</form>
				<Button
					type="submit"
					form="plex-settings-form"
					class="tap-target"
					disabled={isSavingPlex || plexAnyLocked}
				>
					<ServerIcon />
					{isSavingPlex ? 'Saving…' : 'Save Plex settings'}
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>OpenAI / fun facts</CardTitle>
			<CardDescription>
				API credentials for the optional OpenAI fun-fact generator. Obzorarr uses the built-in
				templates when these are empty.
				<!-- DF-017: the AI persona (fun_facts_ai_persona) and per-slide config are
				     DB-only by design — set once in the onboarding wizard. A post-install
				     selector UI is a tracked follow-up; edit these directly in app_settings /
				     slide_config until then. -->
				The AI persona and per-slide configuration are set during onboarding and are database-only
				for now (no post-install selector yet).
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<form
				id="openai-settings-form"
				novalidate
				method="POST"
				action="?/updateApiConfig"
				use:enhance={({ cancel }) => {
	if (isSavingOpenai) {
		cancel();
		return;
	}
	isSavingOpenai = true;
	openaiBaseUrlError = undefined;
	openaiModelError = undefined;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				const data = result.data as {
					success?: boolean;
					message?: string;
					error?: string;
					fieldErrors?: Record<string, string[] | undefined>;
					apiConfigVersion?: string;
				};
				if (result.type === 'failure') {
					openaiBaseUrlError = data?.fieldErrors?.openaiBaseUrl?.[0];
					openaiModelError = data?.fieldErrors?.openaiModel?.[0];
				} else {
					openaiBaseUrlError = undefined;
					openaiModelError = undefined;
				}
				handleFormToast(data);
			}
			await update({ reset: false });
			if (result.type === 'success') {
				const freshVersion = (result.data as { apiConfigVersion?: string })?.apiConfigVersion;
				if (freshVersion) apiConfigVersion = freshVersion;
				openaiApiKeyInput = '';
				await invalidateAll();
			}
		} finally {
			isSavingOpenai = false;
		}
	};
}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<Label for="openaiApiKey">
							OpenAI API key
							{#if settings.openaiApiKey.hasValue}
								<span class="text-xs text-muted-foreground">(stored, leave blank to keep)</span>
							{/if}
						</Label>
						{#if openaiApiKeyLocked}
							<SettingsStatusPill tone="warning">ENV</SettingsStatusPill>
						{/if}
					</div>
					<Input
						id="openaiApiKey"
						name="openaiApiKey"
						type="password"
						autocomplete="off"
						placeholder={settings.openaiApiKey.hasValue ? '••••••••' : 'sk-...'}
						bind:value={openaiApiKeyInput}
						disabled={openaiApiKeyLocked}
					/>
					{#if showOpenaiKeyWarning}
						<p class="ai-key-warning" role="status">
							No OpenAI API key is in effect, so fun facts come from the built-in templates. Enter a
							key above, or set <code>OPENAI_API_KEY</code>, for AI-generated fun facts.
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<Label for="openaiBaseUrl">Base URL (optional)</Label>
						{#if openaiBaseUrlLocked}
							<SettingsStatusPill tone="warning">ENV</SettingsStatusPill>
						{/if}
					</div>
					<Input
						id="openaiBaseUrl"
						name="openaiBaseUrl"
						type="url"
						placeholder="https://api.openai.com/v1"
						bind:value={openaiBaseUrl}
						disabled={openaiBaseUrlLocked}
						maxlength={512}
					/>
					{#if openaiBaseUrlError}
						<p class="text-xs text-destructive">{openaiBaseUrlError}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<Label for="openaiModel">Model</Label>
						{#if openaiModelLocked}
							<SettingsStatusPill tone="warning">ENV</SettingsStatusPill>
						{/if}
					</div>
					<Input
						id="openaiModel"
						name="openaiModel"
						type="text"
						placeholder="gpt-4o-mini (default)"
						maxlength={100}
						bind:value={openaiModel}
						disabled={openaiModelLocked}
					/>
					{#if openaiModelError}
						<p class="text-xs text-destructive">{openaiModelError}</p>
					{/if}
				</div>

				<input type="hidden" name="apiConfigVersion" value={apiConfigVersion}>
			</form>

			<SettingsActionBar>
				<form
					method="POST"
					action="?/testAIConnection"
					use:enhance={({ cancel, formData }) => {
	if (isTestingOpenai) {
		cancel();
		return;
	}
	isTestingOpenai = true;
	if (openaiApiKeyInput) formData.set('openaiApiKey', openaiApiKeyInput);
	formData.set('openaiBaseUrl', openaiBaseUrl);
	formData.set('openaiModel', openaiModel);
	return async ({ result }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
		} finally {
			isTestingOpenai = false;
		}
	};
}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isTestingOpenai}>
						<FlaskConicalIcon />
						{isTestingOpenai ? 'Testing…' : 'Test OpenAI connection'}
					</Button>
				</form>

				{#if settings.openaiApiKey.hasValue && !openaiApiKeyLocked}
					<form
						method="POST"
						action="?/clearOpenaiKey"
						use:enhance={({ cancel }) => {
	if (isClearingOpenaiKey) {
		cancel();
		return;
	}
	isClearingOpenaiKey = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') {
				await invalidateAll();
			}
		} finally {
			isClearingOpenaiKey = false;
		}
	};
}}
					>
						<Button
							type="submit"
							variant="destructive"
							class="tap-target"
							disabled={isClearingOpenaiKey}
						>
							<KeyRoundIcon />
							{isClearingOpenaiKey ? 'Clearing…' : 'Clear API key'}
						</Button>
					</form>
				{/if}

				{#if settings.openaiModel.source !== 'default' && !openaiModelLocked}
					<form
						method="POST"
						action="?/clearOpenaiModel"
						use:enhance={({ cancel }) => {
	if (isClearingOpenaiModel) {
		cancel();
		return;
	}
	isClearingOpenaiModel = true;
	return async ({ result, update }) => {
		try {
			if (result.type === 'success' || result.type === 'failure') {
				handleFormToast(result.data as { success?: boolean; message?: string; error?: string });
			}
			await update({ reset: false });
			if (result.type === 'success') {
				openaiModel = '';
				await invalidateAll();
			}
		} finally {
			isClearingOpenaiModel = false;
		}
	};
}}
					>
						<Button
							type="submit"
							variant="outline"
							class="tap-target"
							disabled={isClearingOpenaiModel}
						>
							{isClearingOpenaiModel ? 'Clearing…' : 'Clear model'}
						</Button>
					</form>
				{/if}
				<Button
					type="submit"
					form="openai-settings-form"
					class="tap-target"
					disabled={isSavingOpenai || openaiAnyLocked}
				>
					<SparklesIcon />
					{isSavingOpenai ? 'Saving…' : 'Save OpenAI settings'}
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>
</div>

<style>
/* ISSUE-016: visible AI-key-missing notice. Uses the same warning palette as
	   the security tab's `.status-card.warning` (theme OKLCH tokens) so it reads
	   as a real alert rather than muted helper copy. */
.ai-key-warning {
	margin: 0.5rem 0 0;
	padding: 0.625rem 0.75rem;
	font-size: 0.8rem;
	line-height: 1.5;
	border-radius: 8px;
	color: oklch(var(--foreground));
	background: oklch(0.79 0.1606 79.6 / 0.1);
	border: 1px solid oklch(0.79 0.1606 79.6 / 0.3);
}

.ai-key-warning code {
	font-size: 0.75rem;
}
</style>
