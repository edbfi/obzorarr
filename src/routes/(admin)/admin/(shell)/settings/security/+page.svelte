<script lang="ts">
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
</script>

<svelte:head>
	<title>{m.admin_settings_title()}</title>
</svelte:head>

<!-- Only the heading until task 10 builds the admin shell and the Security tab
(.impeccable/surfaces/route-admin-settings-security.md). -->
<main
	class={css({
		maxWidth: "formMax",
		marginInline: "auto",
		paddingBlock: "section",
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" },
	})}
>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>{m.admin_settings_title()}</h1>
</main>
