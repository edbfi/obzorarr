/** The `/healthz` answer: a public one-word status that no cache keeps. */
export function healthResponse(): Response {
	return new Response("ok", {
		headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
	});
}
