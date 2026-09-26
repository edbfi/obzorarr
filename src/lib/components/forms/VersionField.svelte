<script lang="ts">
/**
 * Hidden field that carries the optimistic-concurrency `settingsVersion`
 * outside of any Formsnap binding. This is the v3 plan's external-OCC
 * pattern for `z.enum()` settings actions (ThemeSchema, WrappedLogoModeSchema)
 * where wrapping the enum in `z.object()` would change the payload shape.
 *
 * The action handler reads it via `formData.get('settingsVersion')` BEFORE
 * Zod parsing and short-circuits with `fail(409, { error: '__OCC_CONFLICT__',
 * settingsVersion: current })` on mismatch.
 *
 * For `z.object()` schemas the inline `settingsVersion` field is preferable
 * and this component is not needed.
 */
let { version }: { version: string } = $props();
</script>

<input type="hidden" name="settingsVersion" value={version}>
