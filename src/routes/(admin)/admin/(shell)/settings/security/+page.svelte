<script lang="ts">
import { m } from "#lib/paraglide/messages.js";
</script>

<svelte:head>
	<title>{m.admin_settings_title()}</title>
</svelte:head>

<!-- The Security tab's frame; its sections come with the password change and later modules
(.impeccable/surfaces/route-admin-settings-security.md). -->
<section aria-label={m.admin_settings_security()}></section>
