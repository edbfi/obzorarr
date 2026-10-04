/**
 * The `secure` flag for every cookie the app sets or deletes. It follows the public origin
 * of the request: `event.url` carries ORIGIN's scheme when scripts/serve.ts fronts the app,
 * the forwarded scheme when TRUST_PROXY rewrote it, and the adapter's https default
 * otherwise. Browsers refuse a Secure cookie (and a Secure deletion) over plain HTTP outside
 * loopback, so a fixed `secure: true` would make a plain-HTTP deployment unable to sign in or
 * out. The URL is required everywhere a cookie is set or deleted: there is no fallback, so no
 * caller can silently get a Secure cookie (or deletion) on a plain-HTTP origin.
 */
export function isSecureRequest(url: URL): boolean {
	return url.protocol === 'https:';
}
