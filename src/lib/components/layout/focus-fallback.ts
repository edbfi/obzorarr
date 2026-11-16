/**
 * The first of `candidates` the page shows, or null. A dialog gives focus back to the control that
 * opened it, but once the window crosses 768px that control can be hidden (the drawer's Menu, or
 * the sidebar's Sign out); focus then goes to the visible control that took its place, never to
 * the page's body or into an inert part of it. Panda's 768px breakpoint is `48rem`, so the media
 * queries that match it use `48rem` too.
 */
export function firstVisible(...candidates: (Element | null | undefined)[]): HTMLElement | null {
	for (const candidate of candidates) {
		if (!(candidate instanceof HTMLElement) || candidate.closest("[inert]")) continue;
		if (candidate.getClientRects().length > 0) return candidate;
	}
	return null;
}
