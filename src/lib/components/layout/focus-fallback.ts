/**
 * The first of `candidates` the page shows, or null. A dialog gives focus back to the control that
 * opened it, but once the window crosses 768px that control can be hidden (the drawer's Menu, or
 * the sidebar's Sign out); focus then goes to the visible control that took its place, never to
 * the page's body.
 */
export function firstVisible(...candidates: (Element | null | undefined)[]): HTMLElement | null {
	for (const candidate of candidates) {
		if (candidate instanceof HTMLElement && candidate.getClientRects().length > 0) return candidate;
	}
	return null;
}
