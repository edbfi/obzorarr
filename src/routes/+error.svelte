<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';

const status = $derived($page.status);
const rawMessage = $derived($page.error?.message ?? '');
// Suppress bare generic messages that SvelteKit emits for unmatched routes so
// the friendly status-based copy is used instead.
const GENERIC_MESSAGES = new Set(['Not found', 'Not Found']);
const message = $derived(GENERIC_MESSAGES.has(rawMessage) ? '' : rawMessage);

// ISSUE-002: suppress the bare numeric status code for the friendly 404 case so
// it matches the polished empty-state intent (the big "404" reads as a hard
// error above the friendly "Page not found" copy). Other surfaces (403, 429,
// 5xx) keep the code for context. The HTTP status is unchanged — presentation
// only.
const showStatusCode = $derived(status !== 404);

const title = $derived.by(() => {
	if (status === 404) return 'Page not found';
	if (status === 403) return 'Access denied';
	if (status === 429) return 'Too many requests';
	if (status >= 500) return 'Something went wrong';
	return 'Error';
});

const description = $derived.by(() => {
	if (message) return message;
	if (status === 404) return "That page doesn't exist.";
	if (status === 403) return "You don't have permission to view this page.";
	if (status === 429) return 'Wait a moment, then try again.';
	if (status >= 500) return 'The server hit an unexpected error.';
	return 'Something went wrong.';
});

function goBack(): void {
	if (typeof window !== 'undefined' && window.history.length > 1) {
		window.history.back();
	} else {
		goto('/');
	}
}
</script>

<svelte:head>
	<title>{title} - Obzorarr</title>
</svelte:head>

<div class="error-page">
	<div class="error-card">
		{#if showStatusCode}
			<div class="status-code">{status}</div>
		{/if}
		<h1>{title}</h1>
		<p>{description}</p>
		<div class="actions">
			<button type="button" class="btn secondary" onclick={goBack}>Go back</button>
			<a href="/" class="btn primary">Home</a>
		</div>
	</div>
</div>

<style>
.error-page {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 2rem;
	background: oklch(var(--background));
}

.error-card {
	max-width: 480px;
	width: 100%;
	text-align: center;
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	padding: 2.5rem 2rem;
}

.status-code {
	font-size: 4rem;
	font-weight: 800;
	color: oklch(var(--primary));
	line-height: 1;
	margin-bottom: 0.5rem;
}

h1 {
	font-size: 1.5rem;
	font-weight: 600;
	margin: 0 0 0.75rem;
	color: oklch(var(--foreground));
}

p {
	color: oklch(var(--muted-foreground));
	margin: 0 0 2rem;
	line-height: 1.5;
}

.actions {
	display: flex;
	gap: 0.75rem;
	justify-content: center;
	flex-wrap: wrap;
}

.btn {
	padding: 0.625rem 1.25rem;
	border-radius: var(--radius);
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
	border: 1px solid oklch(var(--border));
	transition: opacity 0.15s ease;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	line-height: 1;
}

.btn:hover {
	opacity: 0.85;
}

.btn.primary {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border-color: oklch(var(--primary));
}

.btn.secondary {
	background: oklch(var(--muted));
	color: oklch(var(--foreground));
}
</style>
