import { describe, expect, it } from 'bun:test';
import {
	createPersonalContext,
	createServerContext,
	getAreVerb,
	getHaveVerb,
	getPossessive,
	getSubject,
	getWatchVerb
} from '$lib/components/slides/messaging-context';
import {
	containsUnsafeHtml,
	detectUnsafeHtml,
	renderMarkdown,
	renderMarkdownSync
} from '$lib/server/slides/renderer';
import { SANITIZE_OPTIONS, sanitizeMarkdownHtml } from '$lib/server/slides/sanitize';
import { SlideError, SlideTypeSchema, slideErrorToFail } from '$lib/server/slides/types';

describe('slide messaging context helpers', () => {
	it.each([
		['personal', createPersonalContext(), false, null, 'You', 'Your', 'have', 'are', 'watch'],
		[
			'named server',
			createServerContext('PARENTI'),
			true,
			'PARENTI',
			'PARENTI Community',
			'PARENTI Community',
			'have',
			'are',
			'watch'
		],
		['unnamed server', createServerContext(null), true, null, 'We', 'Our', 'have', 'are', 'watch']
	] as const)(
		'maps %s context to grammar tokens',
		(_name, ctx, isServerWrapped, serverName, subject, possessive, have, are, watch) => {
			expect(ctx).toMatchObject({ isServerWrapped, serverName });
			expect(getSubject(ctx)).toBe(subject);
			expect(getPossessive(ctx)).toBe(possessive);
			expect(getHaveVerb(ctx)).toBe(have);
			expect(getAreVerb(ctx)).toBe(are);
			expect(getWatchVerb(ctx)).toBe(watch);
		}
	);

	it.each([
		[createServerContext('PARENTI'), 'When PARENTI Community watch'],
		[createPersonalContext(), 'When You watch']
	] as const)('produces grammatical heading %s', (ctx, heading) => {
		expect(`When ${getSubject(ctx)} ${getWatchVerb(ctx)}`).toBe(heading);
	});

	it('server context uses community framing, not person-like possessive', () => {
		const ctx = createServerContext('PARENTI');
		// Subject must not be bare serverName (community-framed)
		expect(getSubject(ctx)).not.toBe('PARENTI');
		expect(getSubject(ctx)).toContain('Community');
		// Possessive must not use apostrophe-s (no "PARENTI's")
		expect(getPossessive(ctx)).not.toContain("'s");
		expect(getPossessive(ctx)).toContain('Community');
		// Verbs must be plural (community treated as collective, not singular person)
		expect(getHaveVerb(ctx)).toBe('have');
		expect(getAreVerb(ctx)).toBe('are');
		expect(getWatchVerb(ctx)).toBe('watch');
		// Sanity: personal context is unchanged
		const personal = createPersonalContext();
		expect(getSubject(personal)).toBe('You');
		expect(getPossessive(personal)).toBe('Your');
	});
});

describe('sanitizeMarkdownHtml', () => {
	it.each([
		['script tags', '<p>Hello</p><script>alert("xss")</script>', '<p>Hello</p>'],
		['script tags with attributes', '<script src="evil.js"></script><p>Text</p>', '<p>Text</p>'],
		['iframe tags', '<iframe src="evil.com"></iframe><p>Text</p>', '<p>Text</p>'],
		['object tags', '<object data="evil.swf"></object><p>Text</p>', '<p>Text</p>'],
		['embed tags', '<embed src="evil.swf"><p>Text</p>', '<p>Text</p>'],
		['style tags', '<style>body { display: none; }</style><p>Text</p>', '<p>Text</p>']
	] as const)('removes %s', (_name, input, expected) => {
		expect(sanitizeMarkdownHtml(input)).toBe(expected);
	});

	it.each([
		[
			'event handlers from images',
			'<img src="image.jpg" onerror="alert(1)">',
			'onerror',
			'src="image.jpg"'
		],
		[
			'onclick handlers from links',
			'<a href="https://example.com" onclick="evil()">Link</a>',
			'onclick',
			'href="https://example.com"'
		],
		['javascript: links', '<a href="javascript:alert(1)">click</a>', 'javascript:', undefined],
		['javascript: images', '<img src="javascript:alert(1)">', 'javascript:', undefined],
		[
			'data HTML scripts',
			'<a href="data:text/html,<script>alert(1)</script>">click</a>',
			'data:text/html',
			undefined
		],
		[
			'inline style javascript',
			'<p style="background: url(javascript:alert(1))">Text</p>',
			'javascript:',
			undefined
		]
	] as const)('strips %s', (_name, input, absent, present) => {
		const result = sanitizeMarkdownHtml(input);
		expect(result).not.toContain(absent);
		if (present) expect(result).toContain(present);
	});

	it.each([
		['headings', '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>'],
		['paragraphs', '<p>First paragraph</p><p>Second paragraph</p>'],
		['formatting', '<p><strong>Bold</strong> and <em>italic</em></p>'],
		['unordered lists', '<ul><li>Item 1</li><li>Item 2</li></ul>'],
		['ordered lists', '<ol><li>First</li><li>Second</li></ol>'],
		['code blocks', '<pre><code>const x = 1;</code></pre>'],
		['inline code', '<p>Use <code>npm install</code> to install</p>'],
		['blockquotes', '<blockquote>A famous quote</blockquote>']
	] as const)('preserves safe %s', (_name, input) => {
		expect(sanitizeMarkdownHtml(input)).toBe(input);
	});

	it('preserves safe line breaks, images, and data image URIs', () => {
		expect(sanitizeMarkdownHtml('<p>Line 1<br>Line 2</p><hr>')).toBe(
			'<p>Line 1<br />Line 2</p><hr />'
		);
		for (const [input, expected] of [
			[
				'<img src="https://example.com/image.jpg" alt="Example">',
				'src="https://example.com/image.jpg"'
			],
			['<img src="data:image/png;base64,abc123" alt="Icon">', 'data:image/png;base64,abc123']
		] as const) {
			expect(sanitizeMarkdownHtml(input)).toContain(expected);
		}
	});

	it.each([
		['plain', '<p class="highlight">Text</p>', '<p>Text</p>'],
		['heading', '<h1 class="title">Heading</h1>', '<h1>Heading</h1>'],
		['layout utilities', '<p class="fixed inset-0 z-[100]">Overlay</p>', '<p>Overlay</p>'],
		[
			'link',
			'<a class="fixed inset-0" href="https://example.com">Link</a>',
			'<a href="https://example.com" rel="noopener noreferrer" target="_blank">Link</a>'
		],
		[
			'image',
			'<img class="fixed" src="https://example.com/i.png" alt="I">',
			'<img src="https://example.com/i.png" alt="I" />'
		]
	] as const)('strips class attributes (%s)', (_name, input, expected) => {
		expect(sanitizeMarkdownHtml(input)).toBe(expected);
	});

	it.each([
		['renderMarkdown', renderMarkdown],
		['renderMarkdownSync', renderMarkdownSync]
	] as const)('%s strips classes from raw HTML and code fences', (_name, render) => {
		const html = render(
			'# Title\n\n<p class="fixed inset-0">Raw</p>\n\n```js\nconst a = "<b class=\\"x\\">";\n```\n\nUse `class="x"` here.'
		);
		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<p>Raw</p>');
		expect(html).toContain('<pre><code>const a = "&lt;b class=\\"x\\"&gt;";\n</code></pre>');
		expect(html).toContain('<code>class="x"</code>');
		expect(html).not.toMatch(/<[^>]+\sclass=/);
	});

	it.each([
		['rel="noopener noreferrer"', '<a href="https://example.com">Link</a>'],
		['target="_blank"', '<a href="https://example.com">Link</a>'],
		['href="mailto:test@example.com"', '<a href="mailto:test@example.com">Email</a>'],
		['href="https://example.com"', '<a href="https://example.com">Secure</a>'],
		['href="http://example.com"', '<a href="http://example.com">HTTP</a>']
	] as const)('keeps link security/content marker %s', (expected, input) => {
		expect(sanitizeMarkdownHtml(input)).toContain(expected);
	});

	it('keeps sanitizer options intentionally safe', () => {
		expect(SANITIZE_OPTIONS.allowedTags).toContain('p');
		expect(SANITIZE_OPTIONS.allowedTags).toContain('a');
		expect(SANITIZE_OPTIONS.allowedTags).toContain('img');
		expect(SANITIZE_OPTIONS.allowedTags).not.toContain('script');
		expect(SANITIZE_OPTIONS.allowedTags).not.toContain('iframe');
		expect(SANITIZE_OPTIONS.allowedTags).not.toContain('object');
		expect(SANITIZE_OPTIONS.allowedSchemes).toContain('http');
		expect(SANITIZE_OPTIONS.allowedSchemes).toContain('https');
		expect(SANITIZE_OPTIONS.allowedSchemes).toContain('mailto');
		expect(SANITIZE_OPTIONS.allowedSchemes).not.toContain('javascript');
	});
});

describe('unsafe custom-slide HTML detection', () => {
	it.each([
		['<script> tags', '<script>alert(1)</script>', '<script>'],
		['inline event handlers', '<img src="x" onerror="alert(1)" />', 'event handler'],
		['javascript: URLs', '[click](javascript:alert(1))', 'javascript:'],
		['base64-embedded scripts', 'data:text/html;base64,QUJD<script', 'base64'],
		['first matching branch wins', '<script>x</script><img onerror="y">', '<script>']
	] as const)('flags %s with a branch-specific reason', (_name, input, reason) => {
		const result = detectUnsafeHtml(input);
		expect(result.unsafe).toBe(true);
		if (result.unsafe) expect(result.reason.toLowerCase()).toContain(reason.toLowerCase());
	});

	it.each([
		'# Heading',
		'**bold** and _italic_ text',
		'[a link](https://example.com)',
		'<p>A paragraph with <strong>emphasis</strong>.</p>',
		'A sentence mentioning the word javascript without a colon.'
	] as const)('passes safe markdown/plain HTML %s', (safe) => {
		expect(detectUnsafeHtml(safe)).toEqual({ unsafe: false });
	});

	it('keeps containsUnsafeHtml as a thin boolean wrapper', () => {
		expect(containsUnsafeHtml('<script>alert(1)</script>')).toBe(true);
		expect(containsUnsafeHtml('<img onerror="x">')).toBe(true);
		expect(containsUnsafeHtml('plain safe text')).toBe(false);
	});
});

describe('server slide error/type contracts', () => {
	it('preserves SlideError message, code, name, stack, and Error inheritance', () => {
		const error = new SlideError('Slide not found', 'NOT_FOUND');
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(SlideError);
		expect(error).toMatchObject({
			message: 'Slide not found',
			code: 'NOT_FOUND',
			name: 'SlideError'
		});
		expect(error.stack).toContain('SlideError');
		expect(new Error('Regular error')).not.toBeInstanceOf(SlideError);
	});

	it.each(['INVALID_SLIDE_TYPE', 'NOT_FOUND', 'UPDATE_FAILED'] as const)(
		'supports %s code',
		(code) => {
			expect(new SlideError('message', code).code).toBe(code);
		}
	);

	it.each([
		[
			'UNSAFE_CONTENT',
			new SlideError('Unsafe HTML', 'UNSAFE_CONTENT'),
			400,
			{ error: 'Unsafe HTML', fieldErrors: { content: ['Unsafe HTML'] } }
		],
		[
			'MARKDOWN_INVALID',
			new SlideError('Bad markdown', 'MARKDOWN_INVALID'),
			400,
			{ error: 'Bad markdown', fieldErrors: { content: ['Bad markdown'] } }
		],
		[
			'VALIDATION_ERROR',
			new SlideError('Title required', 'VALIDATION_ERROR'),
			400,
			{ error: 'Title required', fieldErrors: { _form: ['Title required'] } }
		],
		[
			'NOT_FOUND',
			new SlideError('Custom slide not found with id: 7', 'NOT_FOUND'),
			404,
			{ error: 'Custom slide not found with id: 7' }
		],
		[
			'CREATE_FAILED',
			new SlideError('Insert returned no row', 'CREATE_FAILED'),
			500,
			{ error: 'Could not save the slide. Try again.' }
		],
		[
			'UPDATE_FAILED',
			new SlideError('Update returned no row', 'UPDATE_FAILED'),
			500,
			{ error: 'Could not save the slide. Try again.' }
		],
		[
			'generic Error',
			new Error('UNIQUE constraint failed: custom_slides.sort_order'),
			500,
			{ error: 'Something went wrong. Try again.' }
		],
		['non-Error throwable', 'something', 500, { error: 'Something went wrong. Try again.' }],
		[
			'unknown SlideError code',
			new SlideError('Unknown failure', 'TOTALLY_NEW_CODE'),
			500,
			{ error: 'Something went wrong. Try again.' }
		]
	] as const)('maps %s safely', (_name, error, status, body) => {
		const result = slideErrorToFail(error);
		expect(result.status).toBe(status);
		expect(result.body).toEqual(body);
	});

	it.each([
		'total-time',
		'top-movies',
		'top-shows',
		'genres',
		'distribution',
		'percentile',
		'binge',
		'first-last',
		'custom'
	] as const)('accepts slide type %s', (type) =>
		expect(SlideTypeSchema.safeParse(type).success).toBe(true)
	);

	it.each(['invalid-type', '', 123, null] as const)('rejects slide type %p', (type) => {
		expect(SlideTypeSchema.safeParse(type).success).toBe(false);
	});
});
