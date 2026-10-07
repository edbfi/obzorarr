<script lang="ts">
import type { SuperForm } from 'sveltekit-superforms';
import * as Form from '$lib/components/ui/form/index.js';
import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
import type { FormAccessibilityFixtureData } from './form-accessibility-schema';

// The three call-site shapes of admin/settings/{system,privacy}: a text input with
// a description, a radio group named through `labelId`, and a control without a
// visible `Form.Label` that takes only the describing attributes.
let { form }: { form: SuperForm<FormAccessibilityFixtureData> } = $props();
</script>

<Form.Field {form} name="timezone" description>
	<Form.Control>
		{#snippet children({
			props
		})}
			<Form.Label>Timezone</Form.Label>
			<input type="text" {...props}>
		{/snippet}
	</Form.Control>
	<Form.Description>IANA name, for example Europe/Copenhagen.</Form.Description>
	<Form.FieldErrors />
</Form.Field>

<Form.Field {form} name="shareMode">
	<Form.Control>
		{#snippet children({
			props,
			labelId
		})}
			<Form.Label>Share mode</Form.Label>
			<RadioGroup value="public" {...props} aria-labelledby={labelId}>
				<RadioGroupItem value="public" aria-label="Public" />
				<RadioGroupItem value="private-oauth" aria-label="Private" />
			</RadioGroup>
		{/snippet}
	</Form.Control>
	<Form.FieldErrors />
</Form.Field>

<Form.Field {form} name="enabled">
	<Form.Control>
		{#snippet children({
			props
		})}
			<input
				type="checkbox"
				id={props.id}
				aria-label="Enabled"
				aria-describedby={props['aria-describedby']}
				aria-invalid={props['aria-invalid']}
			>
		{/snippet}
	</Form.Control>
	<Form.FieldErrors />
</Form.Field>
