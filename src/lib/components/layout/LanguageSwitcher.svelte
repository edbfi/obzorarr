<script lang="ts">
import { m } from "#lib/paraglide/messages.js";
import { getLocale, type Locale, locales, setLocale } from "#lib/paraglide/runtime.js";
import { css } from "#styled-system/css";

/** In the admin shell's rail (`rail`), the languages stack, each as wide as the rail. */
let { rail = false }: { rail?: boolean } = $props();
const railStack = css({ tabletOnly: { flexDirection: "column", alignItems: "stretch" } });
const railButton = css({ tabletOnly: { paddingInline: "xs" } });

// The page keeps one language until it reloads (SPEC-i18n.md, "Choosing the language"), so this
// is read once.
const current = getLocale();

/** A language's name in that language, its first letter upper-cased there ("English", "Dansk"). */
function ownName(locale: Locale): string {
	const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
	return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

function choose(locale: Locale) {
	// Writes the cookie and reloads the page in the new language.
	if (locale !== current) void setLocale(locale);
}
</script>

<fieldset
	aria-label={m.language_switcher_label()}
	class={[css({ display: "flex", flexWrap: "wrap", gap: "xs" }), rail ? railStack : undefined]}
>
	{#each locales as locale (locale)}
		<button
			type="button"
			lang={locale}
			aria-current={locale === current ? "true" : undefined}
			onclick={() => choose(locale)}
			class={[
				css({
					minHeight: "controlHeight",
					paddingInline: "md",
					borderRadius: "control",
					textStyle: "label",
					color: "muted",
					cursor: "pointer",
					_hover: { color: "text" },
					"&[aria-current=true]": { color: "text", bg: "raised", cursor: "default" },
				}),
				rail ? railButton : undefined,
			]}
		>
			{ownName(locale)}
		</button>
	{/each}
</fieldset>
