<script lang="ts">
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import SignOutDialog from "#lib/components/layout/SignOutDialog.svelte";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { css } from "#styled-system/css";

/**
 * The admin shell's footer (SPEC-sign-in.md, "The admin shell"): the owner's initial and username,
 * linking to their account settings on the Security tab; Sign out behind its confirmation; the
 * language switcher; and the version as selectable text. In the rail (`rail`) the initial and
 * the icons stand alone, their names kept for screen readers, and the languages stack.
 */
let { username, rail = false }: { username: string; rail?: boolean } = $props();

const initial = $derived(
	(
		new Intl.Segmenter(getLocale(), { granularity: "grapheme" })
			.segment(username)
			[Symbol.iterator]()
			.next().value?.segment ?? "?"
	).toLocaleUpperCase(getLocale()),
);
const version = __OBZORARR_VERSION__;
const railHidden = css({ tabletOnly: { srOnly: true } });
const railLink = css({ tabletOnly: { justifyContent: "center", paddingInline: "[0]" } });
const railVersion = css({ tabletOnly: { textAlign: "center", paddingInline: "[0]" } });
</script>

<div
	class={css({
		display: "flex",
		flexDirection: "column",
		gap: "sm",
		paddingBlockStart: "lg",
		borderBlockStartWidth: "1px",
		borderBlockStartStyle: "solid",
		borderBlockStartColor: "border",
	})}
>
	<a
		href="/admin/settings/security"
		class={[
			css({
				display: "flex",
				alignItems: "center",
				gap: "sm",
				minHeight: "controlHeight",
				paddingInline: "sm",
				borderRadius: "control",
				color: "text",
				textDecoration: "none",
				_hover: { bg: "raised" },
			}),
			rail ? railLink : undefined,
		]}
	>
		<span
			aria-hidden="true"
			class={css({
				display: "grid",
				placeItems: "center",
				flex: "none",
				width: "[32px]",
				height: "[32px]",
				borderRadius: "full",
				bg: "raised",
				color: "primary",
				fontFamily: "display",
				fontWeight: "semibold",
			})}
		>
			{initial}
		</span>
		<span
			class={[css({ textStyle: "label", overflowWrap: "anywhere" }), rail ? railHidden : undefined]}
		>
			{username}
		</span>
	</a>
	<SignOutDialog {rail} />
	<LanguageSwitcher {rail} />
	<p
		class={[
			css({
				paddingInline: "sm",
				fontFamily: "mono",
				fontSize: "caption",
				color: "muted",
				userSelect: "text",
				overflowWrap: "anywhere",
			}),
			rail ? railVersion : undefined,
		]}
	>
		{m.admin_version({ version })}
	</p>
</div>
