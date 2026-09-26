<script lang="ts">
import { superForm } from 'sveltekit-superforms';
import { SettingsActionBar, SettingsOptionCard } from '$lib/components/settings/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import { surfaceOccConflict } from '$lib/utils/occ-form';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

let isSavingUiTheme = $state(false);
let isSavingWrappedTheme = $state(false);
let isSavingWrappedLogoMode = $state(false);

// svelte-ignore state_referenced_locally
const uiThemeForm = superForm(data.uiThemeForm, {
	resetForm: false,
	onSubmit({ cancel }) {
		if (isSavingUiTheme) {
			cancel();
			return;
		}
		isSavingUiTheme = true;
	},
	onUpdate: surfaceOccConflict,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const { form: uiThemeData, enhance: uiThemeEnhance, submitting: uiThemeSubmitting } = uiThemeForm;

// svelte-ignore state_referenced_locally
const wrappedThemeForm = superForm(data.wrappedThemeForm, {
	resetForm: false,
	onSubmit({ cancel }) {
		if (isSavingWrappedTheme) {
			cancel();
			return;
		}
		isSavingWrappedTheme = true;
	},
	onUpdate: surfaceOccConflict,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: wrappedThemeData,
	enhance: wrappedThemeEnhance,
	submitting: wrappedThemeSubmitting
} = wrappedThemeForm;

// svelte-ignore state_referenced_locally
const wrappedLogoModeForm = superForm(data.wrappedLogoModeForm, {
	resetForm: false,
	onSubmit({ cancel }) {
		if (isSavingWrappedLogoMode) {
			cancel();
			return;
		}
		isSavingWrappedLogoMode = true;
	},
	onUpdate: surfaceOccConflict,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: wrappedLogoModeData,
	enhance: wrappedLogoModeEnhance,
	submitting: wrappedLogoModeSubmitting
} = wrappedLogoModeForm;

// Reset the in-flight guards once each superForm finishes (success, validation
// failure, or network error all flip `submitting` back to false).
$effect(() => {
	if (!$uiThemeSubmitting) isSavingUiTheme = false;
});
$effect(() => {
	if (!$wrappedThemeSubmitting) isSavingWrappedTheme = false;
});
$effect(() => {
	if (!$wrappedLogoModeSubmitting) isSavingWrappedLogoMode = false;
});

const themeSwatches: Record<string, string[]> = {
	'modern-minimal': ['oklch(0.6261 0.1859 259.6)', 'oklch(0.2267 0 0)', 'oklch(0.9389 0 0)'],
	supabase: ['oklch(0.7906 0.171 160.45)', 'oklch(0.2207 0.0083 173.44)', 'oklch(0.9466 0 0)'],
	'doom-64': ['oklch(0.6885 0.1738 51.21)', 'oklch(0.2399 0.011 61.56)', 'oklch(0.9234 0 0)'],
	'amber-minimal': [
		'oklch(0.8309 0.1622 87.87)',
		'oklch(0.2327 0.0082 91.67)',
		'oklch(0.9389 0 0)'
	],
	'soviet-red': [
		'oklch(0.5356 0.2041 27.72)',
		'oklch(0.2083 0.0125 18.2)',
		'oklch(0.8085 0.1523 88.89)'
	]
};

const themeDescriptions: Record<string, string> = {
	'modern-minimal': 'Cool, neutral admin surfaces with a crisp blue accent.',
	supabase: 'Deep charcoal and soft green for a calmer dashboard feel.',
	'doom-64': 'Retro amber contrast with sharper, game-inspired edges.',
	'amber-minimal': 'Warm amber highlights on a restrained dark base.',
	'soviet-red': 'High-contrast red accents with a bold cinematic tone.'
};

function getThemeSwatches(theme: string): string[] {
	return (
		themeSwatches[theme] ?? [
			'oklch(var(--primary))',
			'oklch(var(--card))',
			'oklch(var(--foreground))'
		]
	);
}

function getThemeDescription(theme: string): string {
	return themeDescriptions[theme] ?? 'Theme-aware colors for Obzorarr surfaces.';
}
</script>

<svelte:head>
	<title>Appearance - Settings - Obzorarr</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>UI theme</CardTitle>
			<CardDescription>
				Color theme for dashboard, admin pages, and all non-wrapped surfaces.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/updateUITheme" use:uiThemeEnhance class="space-y-4">
				<RadioGroup
					bind:value={$uiThemeData.uiTheme}
					name="uiTheme"
					class="grid sm:grid-cols-2 gap-2"
				>
					{#each data.themeOptions as theme (theme.value)}
						<SettingsOptionCard
							title={theme.label}
							description={getThemeDescription(theme.value)}
							swatches={getThemeSwatches(theme.value)}
						>
							{#snippet control()}
								<RadioGroupItem value={theme.value} />
							{/snippet}
						</SettingsOptionCard>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" bind:value={$uiThemeData.settingsVersion}>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$uiThemeSubmitting}>
						{$uiThemeSubmitting ? 'Saving…' : 'Save UI theme'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Wrapped theme</CardTitle>
			<CardDescription>
				Color theme for the Year in Review slideshow at /wrapped/&lt;year&gt;.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/updateWrappedTheme" use:wrappedThemeEnhance class="space-y-4">
				<RadioGroup
					bind:value={$wrappedThemeData.wrappedTheme}
					name="wrappedTheme"
					class="grid sm:grid-cols-2 gap-2"
				>
					{#each data.themeOptions as theme (theme.value)}
						<SettingsOptionCard
							title={theme.label}
							description={getThemeDescription(theme.value)}
							swatches={getThemeSwatches(theme.value)}
						>
							{#snippet control()}
								<RadioGroupItem value={theme.value} />
							{/snippet}
						</SettingsOptionCard>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" bind:value={$wrappedThemeData.settingsVersion}>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$wrappedThemeSubmitting}>
						{$wrappedThemeSubmitting ? 'Saving…' : 'Save wrapped theme'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Wrapped page logo</CardTitle>
			<CardDescription>Control logo visibility on the Year in Review pages.</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateWrappedLogoMode"
				use:wrappedLogoModeEnhance
				class="space-y-4"
			>
				<RadioGroup bind:value={$wrappedLogoModeData.logoMode} name="logoMode" class="grid gap-2">
					{#each data.wrappedLogoOptions as option (option.value)}
						<SettingsOptionCard title={option.label} description={option.description} meta="Logo">
							{#snippet control()}
								<RadioGroupItem value={option.value} />
							{/snippet}
						</SettingsOptionCard>
					{/each}
				</RadioGroup>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$wrappedLogoModeData.settingsVersion}
				>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$wrappedLogoModeSubmitting}>
						{$wrappedLogoModeSubmitting ? 'Saving…' : 'Save logo mode'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>
</div>
