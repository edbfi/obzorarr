<script module lang="ts">
/**
 * What a message's placeholder is filled with where code goes: `m.x({ variable: CODE })`. A
 * control character no translation contains, so splitting on it finds only the placeholder.
 */
export const CODE = "\u0001";
</script>

<script lang="ts">
import { css } from "#styled-system/css";

/**
 * A message with code inside it, such as a variable or a path (SPEC-i18n.md, "Messages are plain
 * text"): the message is plain text, and the code is set as code where its placeholder was. It
 * renders inline, inside whatever element holds the message.
 */
let { message, code }: { message: string; code: string } = $props();

const parts = $derived(message.split(CODE));
const codeStyle = css({ fontFamily: "mono", fontSize: "code", overflowWrap: "anywhere" });
</script>

<!-- biome-ignore format: one line, so no whitespace lands between the code and its punctuation -->
{#each parts as part, at (at)}{#if at > 0}<code class={codeStyle}>{code}</code>{/if}{part}{/each}
