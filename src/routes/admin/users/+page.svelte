<script lang="ts">
import { enhance } from '$app/forms';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import { handleFormToast } from '$lib/utils/form-toast';
import { maskEmail } from '$lib/utils/format';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();
let failedAvatarUserIds = $state<Set<number>>(new Set());

$effect(() => {
	handleFormToast(form);
});

function formatWatchTime(minutes: number): string {
	if (minutes === 0) return '0h';
	if (minutes > 0 && minutes < 60) return '<1h';

	const hours = Math.round(minutes / 60);
	if (hours >= 24) {
		const days = (hours / 24).toFixed(1);
		return `${days}d`;
	}
	return `${hours}h`;
}

function hasVisibleAvatar(user: (typeof data.users)[number]): boolean {
	return !!user.thumb && !failedAvatarUserIds.has(user.id);
}

function markAvatarFailed(userId: number): void {
	failedAvatarUserIds = new Set(failedAvatarUserIds).add(userId);
}
</script>

<svelte:head>
	<title>Users - Admin - Obzorarr</title>
</svelte:head>

<div class="users-page">
	<header class="page-header">
		<div class="page-header-row">
			<div>
				<h1>Users</h1>
				<p class="subtitle">Manage server users for {data.year}</p>
				{#if data.availableYears.length === 0}
					<p class="empty-hint">No watch history yet. Run a sync to populate years.</p>
				{/if}
			</div>
			{#if data.availableYears.length > 0}
				<form method="GET" class="year-form">
					<div class="year-selector-wrap">
						<select
							name="year"
							class="year-selector"
							disabled={data.availableYears.length === 1}
							title={data.availableYears.length === 1 ? 'Only one year of data available' : undefined}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							{#each data.availableYears as yr}
								<option value={yr} selected={yr === data.year}>{yr}</option>
							{/each}
						</select>
						{#if data.availableYears.length === 1}
							<p class="year-selector-hint">Only one year of data available</p>
						{/if}
						<noscript><button type="submit" class="year-submit">Go</button></noscript>
					</div>
				</form>
			{/if}
		</div>
	</header>

	<section class="section">
		<div class="section-header">
			<h2>Server Users</h2>
			<span class="user-count"
				>{data.users.length} {data.users.length === 1 ? 'user' : 'users'}</span
			>
		</div>

		<!-- DF-005 / DF-007: the rows below are login/app users. Many more *synced
		     viewers* (distinct Plex accounts in play history) appear in server-wide
		     stats but are never registered here individually. Their names there are
		     governed by the GLOBAL anonymization setting, not a per-row control —
		     and the per-user "Can Control" toggle only takes effect once the admin
		     also grants that user control. Surface both facts with a link to the
		     setting so the locked controls below are explained, not mysterious. -->
		<div class="synced-viewers-note" role="note">
			<p>
				<strong>{data.syncedViewerCount}</strong>
				synced {data.syncedViewerCount === 1 ? 'viewer' : 'viewers'}
				(distinct Plex accounts seen in play history across all years) appear in server-wide stats.
				Non-registered viewers aren't listed individually here. Their names on the server-wide
				Wrapped come from the global
				<a href="/admin/settings/privacy" class="synced-viewers-link">anonymization setting</a>, not
				per-user. Per-user share controls below apply only once you grant a user control.
			</p>
		</div>

		{#if data.users.length === 0}
			<p class="empty-message">No users yet. They appear here after signing in with Plex.</p>
		{:else}
			<div class="users-table-wrapper">
				<table class="users-table">
					<thead>
						<tr>
							<th>User</th>
							<th>Watch Time</th>
							<th>Share Mode</th>
							<th>Can Control</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each data.users as user (user.id)}
							<tr>
								<td>
									<div class="user-cell">
										<span class="user-avatar-link" aria-hidden="true">
											{#if hasVisibleAvatar(user)}
												<img
													src={user.thumb ?? ''}
													alt=""
													class="user-avatar"
													onerror={() => markAvatarFailed(user.id)}
												>
											{:else}
												<span class="user-avatar placeholder">&#9787;</span>
											{/if}
										</span>
										<div class="user-info">
											{#if user.hasWatchHistory}
												<a href={user.wrappedHref} class="user-name">
													{user.username}
													{#if user.isAdmin}
														<span class="admin-badge">Admin</span>
													{/if}
												</a>
											{:else}
												<span class="user-name">
													{user.username}
													{#if user.isAdmin}
														<span class="admin-badge">Admin</span>
													{/if}
												</span>
											{/if}
											{#if user.email}
												<span class="user-email" title="Email masked for privacy">
													{maskEmail(user.email)}
												</span>
											{/if}
										</div>
									</div>
								</td>
								<td>
									{#if user.hasWatchHistory}
										<span class="watch-time">{formatWatchTime(user.totalWatchTimeMinutes)}</span>
									{:else}
										<span
											class="watch-time watch-time-empty"
											title="This user has no personal play history yet"
										>
											0h <span class="watch-time-note">(no personal plays)</span>
										</span>
									{/if}
								</td>
								<td>
									<span
										class="share-mode"
										class:public={user.effectiveClass === 'public'}
										class:oauth={user.effectiveClass === 'oauth'}
										class:link={user.effectiveClass === 'link'}
									>
										{user.effectiveLabel}
									</span>
								</td>
								<td>
									<form
										method="POST"
										action="?/updateUserPermission"
										use:enhance
										class="permission-form"
									>
										<input type="hidden" name="userId" value={user.id}>
										<input type="hidden" name="year" value={data.year}>
										<input
											type="hidden"
											name="canUserControl"
											value={user.canUserControl ? 'false' : 'true'}
										>
										<SubmitButton
											class={`toggle-button tap-target ${user.canUserControl ? 'enabled' : ''}`}
											title={user.canUserControl ? 'Click to revoke control' : 'Click to grant control'}
											aria-label={`Toggle share control for ${user.username} (currently ${user.canUserControl ? 'on' : 'off'})`}
										>
											{#snippet children()}
												{user.canUserControl ? 'Yes' : 'No'}
											{/snippet}
										</SubmitButton>
									</form>
								</td>
								<td>
									<a
										href={user.wrappedHref}
										target="_blank"
										rel="noopener noreferrer"
										class="preview-link"
									>
										{user.hasWatchHistory ? 'Preview Wrapped' : 'Preview (no data)'}
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mobile-users-list">
				{#each data.users as user (user.id)}
					<div class="mobile-user-row">
						<div class="mobile-user-main">
							<span class="user-avatar-link" aria-hidden="true">
								{#if hasVisibleAvatar(user)}
									<img
										src={user.thumb ?? ''}
										alt=""
										class="user-avatar"
										onerror={() => markAvatarFailed(user.id)}
									>
								{:else}
									<span class="user-avatar placeholder">&#9787;</span>
								{/if}
							</span>
							<div class="user-info">
								{#if user.hasWatchHistory}
									<a href={user.wrappedHref} class="user-name">
										{user.username}
										{#if user.isAdmin}
											<span class="admin-badge">Admin</span>
										{/if}
									</a>
								{:else}
									<span class="user-name">
										{user.username}
										{#if user.isAdmin}
											<span class="admin-badge">Admin</span>
										{/if}
									</span>
								{/if}
								{#if user.email}
									<span class="user-email" title="Email masked for privacy">
										{maskEmail(user.email)}
									</span>
								{/if}
							</div>
						</div>
						<div class="mobile-user-meta">
							<div class="mobile-meta-item">
								<span class="mobile-meta-label">Watch Time</span>
								{#if user.hasWatchHistory}
									<span class="watch-time">{formatWatchTime(user.totalWatchTimeMinutes)}</span>
								{:else}
									<span
										class="watch-time watch-time-empty"
										title="This user has no personal play history yet"
									>
										0h <span class="watch-time-note">(no personal plays)</span>
									</span>
								{/if}
							</div>
							<div class="mobile-meta-item">
								<span class="mobile-meta-label">Share Mode</span>
								<span
									class="share-mode"
									class:public={user.effectiveClass === 'public'}
									class:oauth={user.effectiveClass === 'oauth'}
									class:link={user.effectiveClass === 'link'}
								>
									{user.effectiveLabel}
								</span>
							</div>
							<div class="mobile-meta-item">
								<span class="mobile-meta-label">Can Control</span>
								<form
									method="POST"
									action="?/updateUserPermission"
									use:enhance
									class="permission-form"
								>
									<input type="hidden" name="userId" value={user.id}>
									<input type="hidden" name="year" value={data.year}>
									<input
										type="hidden"
										name="canUserControl"
										value={user.canUserControl ? 'false' : 'true'}
									>
									<SubmitButton
										class={`toggle-button tap-target ${user.canUserControl ? 'enabled' : ''}`}
										title={user.canUserControl ? 'Click to revoke control' : 'Click to grant control'}
										aria-label={`Toggle share control for ${user.username} (currently ${user.canUserControl ? 'on' : 'off'})`}
									>
										{#snippet children()}
											{user.canUserControl ? 'Yes' : 'No'}
										{/snippet}
									</SubmitButton>
								</form>
							</div>
						</div>
						<a
							href={user.wrappedHref}
							target="_blank"
							rel="noopener noreferrer"
							class="preview-link mobile-preview-link"
						>
							{user.hasWatchHistory ? 'Preview Wrapped' : 'Preview (no data)'}
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="section legend-section">
		<h3>Legend</h3>
		<div class="legend-grid">
			<div class="legend-item">
				<span class="share-mode public">Public</span>
				<span class="legend-desc">Anyone can view the Wrapped page</span>
			</div>
			<div class="legend-item">
				<span class="share-mode oauth">OAuth</span>
				<span class="legend-desc">Only authenticated server members can view</span>
			</div>
			<div class="legend-item">
				<span class="share-mode link">Link</span>
				<span class="legend-desc">Only those with the share link can view</span>
			</div>
			<div class="legend-item">
				<span class="share-mode">Default</span>
				<span class="legend-desc">Uses global default setting</span>
			</div>
		</div>
	</section>
</div>

<style>
.users-page {
	max-width: 1000px;
	margin: 0 auto;
	padding: 2rem;
	min-width: 0;
}

.page-header {
	margin-bottom: 2rem;
}

.page-header h1 {
	font-size: 2rem;
	font-weight: 700;
	color: oklch(var(--primary));
	margin: 0 0 0.5rem;
}

.subtitle {
	color: oklch(var(--muted-foreground));
	margin: 0;
}

.empty-hint {
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
	margin: 0.5rem 0 0;
}

.page-header-row {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
}

.year-form {
	display: contents;
}

.year-selector {
	padding: 0.5rem 0.75rem;
	background: oklch(var(--input));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--foreground));
	font-size: 0.875rem;
	cursor: pointer;
}

.year-selector:focus {
	outline: none;
	border-color: oklch(var(--ring));
	box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
}

.year-selector:disabled {
	cursor: default;
	opacity: 0.75;
}

.year-selector-wrap {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 0.25rem;
}

.year-selector-hint {
	margin: 0;
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.section {
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	min-width: 0;
}

.section h2 {
	font-size: 1.125rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin: 0 0 0.5rem;
}

.section h3 {
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin: 0 0 0.75rem;
}

.section-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1rem;
}

.section-header h2 {
	margin: 0;
}

.user-count {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

/* DF-005 / DF-007 synced-viewer + privacy-discoverability note. Uses the
		   info palette (primary-tinted, left-accent) so it reads as guidance, not
		   an error. */
.synced-viewers-note {
	margin-bottom: 1rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--primary) / 0.1);
	border: 1px solid oklch(var(--primary) / 0.25);
	border-left: 3px solid oklch(var(--primary));
	border-radius: var(--radius);
}

.synced-viewers-note p {
	margin: 0;
	font-size: 0.8rem;
	line-height: 1.5;
	color: oklch(var(--muted-foreground));
}

.synced-viewers-link {
	color: oklch(var(--primary));
	text-decoration: underline;
}

.synced-viewers-link:hover {
	opacity: 0.85;
}

.users-table-wrapper {
	overflow-x: auto;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	-webkit-overflow-scrolling: touch;
}

.users-table {
	width: 100%;
	min-width: 600px;
	border-collapse: collapse;
	font-size: 0.875rem;
}

.users-table th,
.users-table td {
	padding: 0.75rem;
	text-align: left;
	border-bottom: 1px solid oklch(var(--border));
}

.users-table th {
	font-weight: 600;
	color: oklch(var(--muted-foreground));
	font-size: 0.75rem;
	text-transform: uppercase;
}

.users-table tbody tr:hover {
	background: oklch(var(--muted) / 0.5);
}

.user-cell {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.user-avatar-link,
.user-name {
	text-decoration: none;
}

.user-avatar-link {
	display: inline-flex;
	flex: 0 0 auto;
}

.user-avatar {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	object-fit: cover;
}

.user-avatar.placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	background: oklch(var(--muted));
	color: oklch(var(--muted-foreground));
	font-size: 1.25rem;
}

.user-info {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.user-name {
	font-weight: 500;
	color: oklch(var(--foreground));
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.user-name[href]:hover {
	color: oklch(var(--primary));
}

.user-email {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
	overflow-wrap: anywhere;
}

.admin-badge {
	display: inline-block;
	padding: 0.125rem 0.375rem;
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	font-size: 0.625rem;
	font-weight: 600;
	border-radius: 9999px;
	text-transform: uppercase;
}

.watch-time {
	font-weight: 600;
	color: oklch(var(--foreground));
}

.watch-time-empty {
	color: oklch(var(--muted-foreground));
	font-weight: 500;
}

.watch-time-note {
	font-weight: 400;
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground) / 0.8);
}

.share-mode {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: var(--radius);
	font-size: 0.75rem;
	font-weight: 500;
	background: oklch(var(--muted));
	color: oklch(var(--muted-foreground));
}

.share-mode.public {
	background: oklch(0.4165 0.0976 143.57);
	color: oklch(0.9393 0.0518 145.15);
}

.share-mode.oauth {
	background: oklch(0.3737 0.1106 262.4);
	color: oklch(0.901 0.0402 264.35);
}

.share-mode.link {
	background: oklch(0.3621 0.1272 303.65);
	color: oklch(0.8943 0.0518 307.82);
}

.permission-form {
	margin: 0;
}

/* SubmitButton child-renders the real <button>, and component class props
		   cannot use Svelte's DOM-only `class:foo` directive, so the enabled
		   palette is driven by a hoisted template-literal class. */
:global(.toggle-button) {
	padding: 0.25rem 0.5rem;
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	font-size: 0.75rem;
	font-weight: 500;
	cursor: pointer;
	background: oklch(var(--muted));
	color: oklch(var(--muted-foreground));
	transition: all 0.15s ease;
}

:global(.toggle-button.enabled) {
	background: oklch(0.4165 0.0976 143.57);
	color: oklch(0.9393 0.0518 145.15);
	border-color: oklch(0.4165 0.0976 143.57);
}

:global(.toggle-button:hover) {
	opacity: 0.8;
}

.preview-link {
	font-size: 0.75rem;
	color: oklch(var(--primary));
	text-decoration: none;
}

.preview-link:hover {
	text-decoration: underline;
}

.mobile-users-list {
	display: none;
}

.mobile-user-row {
	display: flex;
	flex-direction: column;
	gap: 0.875rem;
	padding: 1rem 0;
	border-bottom: 1px solid oklch(var(--border));
	min-width: 0;
}

.mobile-user-row:first-child {
	padding-top: 0;
}

.mobile-user-row:last-child {
	padding-bottom: 0;
	border-bottom: 0;
}

.mobile-user-main {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	min-width: 0;
}

.mobile-user-main .user-info {
	flex: 1;
}

.mobile-user-meta {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.75rem;
	align-items: start;
}

.mobile-meta-item {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	min-width: 0;
}

.mobile-meta-label {
	color: oklch(var(--muted-foreground));
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: uppercase;
}

.mobile-preview-link {
	align-self: flex-start;
}

.empty-message {
	color: oklch(var(--muted-foreground));
	text-align: center;
	padding: 2rem;
}

.legend-section {
	background: oklch(var(--muted) / 0.3);
}

.legend-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: 0.75rem;
}

.legend-item {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.legend-desc {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

@media (max-width: 768px) {
	.users-page {
		padding: 1rem;
	}

	.page-header-row {
		flex-direction: column;
		align-items: stretch;
	}

	.section {
		padding: 1rem;
	}

	.users-table-wrapper {
		display: none;
	}

	.mobile-users-list {
		display: block;
	}

	.user-avatar {
		width: 32px;
		height: 32px;
	}

	.user-name {
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.legend-item {
		align-items: flex-start;
	}
}

@media (max-width: 430px) {
	.mobile-user-meta {
		grid-template-columns: 1fr;
	}
}
</style>
