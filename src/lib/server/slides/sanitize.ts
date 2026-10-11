import sanitizeHtml from 'sanitize-html';

/**
 * Custom-slide image policy (ISSUE-006 / FIX-6b decision):
 *
 * `<img>` is INTENTIONALLY allowed in custom-slide markdown, but only as an
 * inert image embed. The `allowedAttributes.img` allowlist below admits just
 * `src`/`alt`/`title`/`width`/`height` — every event-handler attribute
 * (`onerror`, `onload`, …) is stripped by sanitize-html because it isn't on the
 * allowlist, so the classic `<img onerror=...>` XSS vector cannot survive
 * sanitization. Remote `src` is restricted to http/https and `data:` URIs are
 * MIME-validated to real raster image types via `isValidImageDataUri`, so a
 * `data:text/html` / `data:image/svg+xml` script payload is rejected. This runs
 * server-side, so the stored/rendered HTML is already safe and no extra client
 * gating is needed. Tighten the allowlist here (not at the call sites) if the
 * policy ever needs to drop `<img>` entirely.
 */
const ALLOWED_IMAGE_MIME_TYPES = /^image\/(png|jpe?g|gif|webp)$/i;

function isValidImageDataUri(src: string): boolean {
	if (!src.startsWith('data:')) return true;
	const mimeType = src.slice(5).split(/[,;]/)[0];
	if (!mimeType) return false;
	return ALLOWED_IMAGE_MIME_TYPES.test(mimeType);
}

export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'br',
		'hr',
		'ul',
		'ol',
		'li',
		'strong',
		'b',
		'em',
		'i',
		'code',
		'pre',
		'blockquote',
		'a',
		'img'
	],
	// No `class` on any tag: slides are styled only by CustomSlide's
	// `.markdown-content` rules. An author class would apply whatever global
	// utility UnoCSS happened to generate (e.g. `fixed inset-0`).
	allowedAttributes: {
		a: ['href', 'title', 'target', 'rel'],
		img: ['src', 'alt', 'title', 'width', 'height']
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	allowedSchemesByTag: {
		img: ['http', 'https', 'data']
	},
	transformTags: {
		a: (tagName, attribs) => ({
			tagName,
			attribs: {
				...attribs,
				rel: 'noopener noreferrer',
				target: '_blank'
			}
		}),
		img: (tagName, attribs) => {
			if (attribs.src && !isValidImageDataUri(attribs.src)) {
				const { src: _, ...safeAttribs } = attribs;
				return { tagName, attribs: safeAttribs };
			}
			return { tagName, attribs };
		}
	}
};

export function sanitizeMarkdownHtml(html: string): string {
	return sanitizeHtml(html, SANITIZE_OPTIONS);
}
