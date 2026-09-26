<script lang="ts">
import BugIcon from '@lucide/svelte/icons/bug';
import { superForm } from 'sveltekit-superforms';
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
import * as Form from '$lib/components/ui/form/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import { surfaceOccConflict } from '$lib/utils/occ-form';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// Initial-value capture is the idiomatic Superforms pattern — the SuperForm
// instance owns the reactive state from here.
// svelte-ignore state_referenced_locally
const form = superForm(data.form, {
	resetForm: false,
	// An OCC stale-write returns fail(409, { form, conflict }) AFTER validation,
	// so `updated.valid` stays true and `onUpdated` would fire a false "Settings
	// saved" toast while the write was discarded (ISSUE-006). Detect + cancel the
	// conflict in `onUpdate` (before `onUpdated`) so the success path never runs.
	onUpdate: surfaceOccConflict,
	onUpdated({ form: updated }) {
		// Surface success / failure toasts via the existing parity helper. The
		// helper accepts the legacy FormResponse shape; we map the superforms
		// `valid` flag onto it. On validation failure, pull the first
		// field-level error so the toast says "Retention days must be at
		// least 1" instead of a generic "Validation failed" — which previously
		// looked like a false success when the user typed an out-of-range value.
		if (updated.valid) {
			handleFormToast({ success: true, message: updated.message ?? 'Settings saved' });
			return;
		}
		const errorBag = (updated.errors ?? {}) as Record<string, unknown>;
		const firstError = Object.values(errorBag)
			.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
			.find((entry): entry is string => typeof entry === 'string' && entry.length > 0);
		handleFormToast({ error: firstError ?? updated.message ?? 'Validation failed' });
	}
});

const { form: formData, enhance, submitting } = form;

// svelte-ignore state_referenced_locally
const timezoneForm = superForm(data.timezoneForm, {
	resetForm: false,
	onUpdate: surfaceOccConflict,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			handleFormToast({ success: true, message: updated.message ?? 'Settings saved' });
			return;
		}
		handleFormToast({ error: updated.errors.timezone?.[0] ?? 'Validation failed' });
	}
});

const {
	form: timezoneData,
	enhance: timezoneEnhance,
	submitting: timezoneSubmitting
} = timezoneForm;

const timezoneLocked = $derived(data.schedulerTimezone.isLocked);

// Block submit when the visible inputs are out of the server-validated range.
// The HTML5 min/max attributes only clamp some browsers' UI, so a user can
// still paste -1 / 999999 and trigger a silent no-op save without this check.
//
// ISSUE-017: the disabled-submit guard alone left users with no feedback — the
// server-side `Form.FieldErrors` never render because the disabled button stops
// the submit that would populate them. Surface the range violation inline as the
// user types, mirroring the zod schema's range + messages.
const retentionDaysError = $derived(
	$formData.retentionDays < 1
		? 'Retention days must be at least 1'
		: $formData.retentionDays > 365
			? 'Retention days cannot exceed 365'
			: undefined
);
const maxCountError = $derived(
	$formData.maxCount < 1000
		? 'Max log count must be at least 1000'
		: $formData.maxCount > 1_000_000
			? 'Max log count cannot exceed 1,000,000'
			: undefined
);
const isLoggingFormInvalid = $derived(Boolean(retentionDaysError) || Boolean(maxCountError));

function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const parts: string[] = [];
	if (days) parts.push(`${days}d`);
	if (hours) parts.push(`${hours}h`);
	if (minutes || (!days && !hours)) parts.push(`${minutes}m`);
	return parts.join(' ');
}
</script>

<svelte:head>
	<title>System - Settings - Obzorarr</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<div class="flex items-center gap-2">
				<CardTitle>Scheduler timezone</CardTitle>
				{#if timezoneLocked}
					<SettingsStatusPill tone="warning">ENV</SettingsStatusPill>
				{/if}
			</div>
			<CardDescription>
				Zone the automatic sync schedule and the log retention cleanup are interpreted in. Source:
				<strong>{data.schedulerTimezone.source}</strong>.
			</CardDescription>
		</CardHeader>
		<CardContent>
			{#if timezoneLocked}
				<p class="text-sm text-muted-foreground">
					The <code>TZ</code> environment variable sets the timezone to
					<strong>{data.schedulerTimezone.value}</strong>, so you cannot change it here.
				</p>
			{:else}
				<form
					method="POST"
					action="?/updateSchedulerTimezone"
					use:timezoneEnhance
					class="space-y-4"
				>
					<Form.Field form={timezoneForm} name="timezone">
						<Form.Control>
							{#snippet children({
	props
})}
								<Form.Label>Timezone</Form.Label>
								<Input
									type="text"
									list="scheduler-timezones"
									autocomplete="off"
									spellcheck="false"
									placeholder="Europe/Copenhagen"
									{...props}
									bind:value={$timezoneData.timezone}
								/>
								<datalist id="scheduler-timezones">
									{#each data.schedulerTimezone.supportedZones as zone (zone)}
										<option value={zone}></option>
									{/each}
								</datalist>
							{/snippet}
						</Form.Control>
						<Form.Description>
							IANA name, for example <code>Europe/Copenhagen</code>. Setting <code>TZ</code> in the
							container environment overrides this field.
						</Form.Description>
						<Form.FieldErrors />
					</Form.Field>

					<input type="hidden" name="settingsVersion" bind:value={$timezoneData.settingsVersion}>

					<SettingsActionBar>
						<Button type="submit" class="tap-target" disabled={$timezoneSubmitting}>
							{$timezoneSubmitting ? 'Saving…' : 'Save timezone'}
						</Button>
					</SettingsActionBar>
				</form>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Logging</CardTitle>
			<CardDescription>
				Configure log retention, maximum entry count, and the DEBUG-level logging toggle.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/updateLogSettings" use:enhance class="space-y-4">
				<Form.Field {form} name="retentionDays">
					<Form.Control>
						{#snippet children({
	props
})}
							<Form.Label>Retention period (days)</Form.Label>
							<Input
								type="number"
								min="1"
								max="365"
								step="1"
								{...props}
								bind:value={$formData.retentionDays}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>Auto-delete logs older than this. Range 1–365.</Form.Description>
					<Form.FieldErrors />
					{#if retentionDaysError}
						<p class="text-sm text-destructive">{retentionDaysError}</p>
					{/if}
				</Form.Field>

				<Form.Field {form} name="maxCount">
					<Form.Control>
						{#snippet children({
	props
})}
							<Form.Label>Maximum log count</Form.Label>
							<Input
								type="number"
								min="1000"
								max="1000000"
								step="1"
								{...props}
								bind:value={$formData.maxCount}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description
						>Obzorarr drops older entries once the count reaches this ceiling. Range
						1,000–1,000,000.</Form.Description
					>
					<Form.FieldErrors />
					{#if maxCountError}
						<p class="text-sm text-destructive">{maxCountError}</p>
					{/if}
				</Form.Field>

				<Form.Field {form} name="debugEnabled">
					<Form.Control>
						{#snippet children({
	props
})}
							<input
								type="hidden"
								name="debugEnabled"
								value={$formData.debugEnabled ? 'true' : 'false'}
							>
							<SettingsToggleRow
								id={props.id}
								title="DEBUG-level logging"
								description="Records detailed debug output. May increase log volume."
								onLabel="Debug on"
								offLabel="Debug off"
								ariaDescribedby={props['aria-describedby']}
								ariaInvalid={props['aria-invalid']}
								bind:checked={$formData.debugEnabled}
							>
								{#snippet icon()}
									<BugIcon />
								{/snippet}
							</SettingsToggleRow>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<input type="hidden" name="settingsVersion" bind:value={$formData.settingsVersion}>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$submitting || isLoggingFormInvalid}>
						{$submitting ? 'Saving…' : 'Save logging settings'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>System info</CardTitle>
			<CardDescription>Runtime + platform details for support and diagnostics.</CardDescription>
		</CardHeader>
		<CardContent>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
				<div>
					<dt class="text-muted-foreground">App version</dt>
					<dd class="font-mono">{data.appVersion.display}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Uptime</dt>
					<dd>{formatUptime(data.systemInfo.uptimeSeconds)}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Platform</dt>
					<dd class="font-mono">{data.systemInfo.osPlatform} / {data.systemInfo.osArch}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Bun</dt>
					<dd class="font-mono">{data.systemInfo.bunVersion ?? 'Unknown'}</dd>
				</div>
			</dl>
		</CardContent>
	</Card>
</div>
