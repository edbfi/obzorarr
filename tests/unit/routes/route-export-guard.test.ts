import { describe, expect, it } from 'bun:test';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

// ISSUE-002 route-export guard (PR-1, ships with the ISSUE-001 fix).
//
// Why this exists: CI runs `bun run check` (svelte-kit sync + svelte-check) and
// it was GREEN through ISSUE-001, even though ISSUE-001 was a forbidden
// non-reserved export from a `+page.server.ts`. That proves `bun run check` does
// NOT catch the runtime SvelteKit route-module-export constraint — it is a
// load-time error, not a type error. This static scan catches the exact
// ISSUE-001 shape (and the related `export const`, `export default`,
// `export { x as y }` shapes) cheaply, with no CI-config change.
//
// COVERAGE LIMITS (stated honestly): this is a source-text scan. It strips
// `/* ... */` block comments and `//` line comments before scanning (so a
// commented-out `export ...` is never mistaken for a live one), folds multi-line
// `export { ... }` lists, flags `export * from "..."` wildcards, and extracts
// every bound name from multi-declarator and destructured `export const|let|var`
// bindings — all conservatively. The `export const|let|var` binding scan is
// string-aware: it tracks `'`/`"`/`` ` `` quotes so a comma or `=` INSIDE an
// initializer string (`export const x = "a,b"`) is not misread as a declarator
// separator or binding boundary, and it skips computed property keys
// (`{ [expr]: local }`) so the key expression's identifiers are not collected as
// bindings. It still CANNOT resolve re-export aliases at runtime or follow
// computed/dynamic re-exports, and it does not actually load the modules. The
// comment stripper (below) is also string-aware: a `//` or `/*` sequence INSIDE
// a string or template literal is treated as string content, not a comment
// delimiter, so a real export sharing a line with such a string (e.g. a URL like
// `"https://h"` in an initializer) is not truncated — this removes the
// false-NEGATIVE that an unaware stripper would produce. The remaining limit is
// the usual one: this is a source-text scan, not a loader, so it cannot resolve
// re-export aliases at runtime or follow computed/dynamic re-exports.
// The faithful long-term guard is `bun run build` (option (c) in the plan):
// SvelteKit loads every route module while building and fails on a bad export. Adding
// `bun run build` to CI is the authoritative fix when the maintainer wants it;
// this test buys immediate, zero-setup protection in the meantime.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const ROUTES_DIR = join(PROJECT_ROOT, 'src', 'routes');

// SvelteKit-reserved module-level exports a +page.server.ts is allowed to expose
// at runtime. Anything else (other than a `_`-prefixed private helper or a
// type-only export, which is erased) is a runtime load error.
const ALLOWED_EXPORTS = new Set([
	'load',
	'actions',
	'prerender',
	'ssr',
	'csr',
	'trailingSlash',
	'config',
	'entries'
]);

function isAllowedName(name: string): boolean {
	return ALLOWED_EXPORTS.has(name) || name.startsWith('_');
}

/**
 * Extracts the bound identifiers introduced by an `export const|let|var`
 * binding-list string (everything after the keyword, e.g. `foo = 1, bar = 2`
 * or `{ a, b: c = d, ...rest } = obj`). This is a conservative regex-level
 * scan, NOT a real parser: it strips out the initializer of each top-level
 * declarator (`= ...`) and then collects identifiers from any destructuring
 * pattern (object/array, including nested, aliased, default, and rest forms)
 * or plain identifier on the left-hand side.
 *
 * Consistent with the `export *` "flag when you can't resolve" stance, this
 * prefers over-collecting an ambiguous binding to silently missing it. A
 * property KEY in object destructuring (`{ key: local }`) is not a binding —
 * only the LOCAL name (`local`) is — and a default/initializer value
 * (`{ a = something }`) is not a binding either; both are excluded by trimming
 * to the binding side of `:` and dropping `= ...` initializers.
 *
 * String/template-literal aware: the declarator-splitting and initializer-finding
 * scans track an active quote (`'`, `"`, `` ` ``) and treat characters inside a
 * string as opaque, so a comma or `=` INSIDE an initializer string
 * (`export const x = "a,b"`) is not mistaken for a declarator separator or the
 * binding/initializer boundary. (It still does not evaluate `${...}` template
 * interpolations — their contents stay inside the template string and are never
 * collected as bindings.)
 */
function extractBoundNames(declarators: string): string[] {
	const names: string[] = [];

	// Split top-level declarators on commas that are NOT inside a destructuring
	// pattern. Track brace/bracket/paren depth so commas within `{...}`/`[...]`
	// stay grouped with their pattern, and track string/template-literal state so
	// a comma INSIDE a string initializer (`= "a,b"`) is treated as opaque text,
	// not a declarator separator.
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	let quote = ''; // active string delimiter: `'`, `"`, or `` ` `` (empty = none)
	for (const ch of declarators) {
		if (quote) {
			// Inside a string: only its matching delimiter ends it. Everything else
			// (commas, braces, `=`) is opaque.
			current += ch;
			if (ch === quote) quote = '';
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === '{' || ch === '[' || ch === '(') depth++;
		else if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
		if (ch === ',' && depth === 0) {
			parts.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	if (current.trim()) parts.push(current);

	for (const part of parts) {
		// Drop the initializer of this declarator: the binding side is the text
		// before the first top-level `=`. (Defaults inside a pattern, e.g.
		// `{ a = 1 }`, live at depth > 0 and are handled per-token below.)
		let lhs = part;
		let d = 0;
		let q = ''; // active string delimiter while scanning for the initializer `=`
		for (let k = 0; k < part.length; k++) {
			const ch = part[k];
			if (q) {
				// Inside a string literal: ignore any `=`/braces until it closes.
				if (ch === q) q = '';
				continue;
			}
			if (ch === "'" || ch === '"' || ch === '`') q = ch;
			else if (ch === '{' || ch === '[' || ch === '(') d++;
			else if (ch === '}' || ch === ']' || ch === ')') d = Math.max(0, d - 1);
			else if (ch === '=' && d === 0 && part[k + 1] !== '=' && part[k - 1] !== '!') {
				lhs = part.slice(0, k);
				break;
			}
		}

		const trimmedLhs = lhs.trim();
		if (!trimmedLhs) continue;

		// Plain (non-destructured) declarator — `foo` or a type-annotated
		// `foo: SomeType`. Only the leading identifier is a binding; any `: Type`
		// annotation is erased at runtime, so capture just the head identifier.
		if (!trimmedLhs.startsWith('{') && !trimmedLhs.startsWith('[')) {
			const plain = trimmedLhs.match(/^([A-Za-z_$][\w$]*)/);
			if (plain?.[1]) {
				names.push(plain[1]);
			}
			continue;
		}

		// Destructuring pattern. Collect bound LOCAL names: in `{ key: local }`
		// the binding is `local`; in `{ key }` it is `key`; rest/defaults handled.
		// Strategy: tokenize identifiers, but exclude any identifier immediately
		// FOLLOWED by `:` (it is a property key, not a binding) and any default
		// value after `=` within the pattern (handled by skipping the value side).
		for (const name of extractPatternNames(trimmedLhs)) {
			names.push(name);
		}
	}

	return names;
}

/**
 * Collects bound LOCAL identifiers from a destructuring pattern string
 * (`{ ... }` / `[ ... ]`, possibly nested). Property keys (`key:` in
 * `{ key: local }`), computed property keys (`[expr]:` in `{ [key]: local }`,
 * whose `expr` identifiers are references, not bindings), and default-value
 * expressions (after `=`) are excluded so only the names actually introduced
 * into scope are returned. The default-value skip is string/template-literal
 * aware: a comma or closing delimiter INSIDE the default's string (`{ a = "x,y" }`)
 * is opaque text and does not end the skip, so `y` is not misread as a binding.
 */
function extractPatternNames(pattern: string): string[] {
	const names: string[] = [];
	let i = 0;
	let depth = 0;
	let entered = false;
	while (i < pattern.length) {
		const ch = pattern[i];
		// Computed property key: `{ [expr]: value }`. The identifiers inside the
		// `[...]` are a key EXPRESSION (a reference), not bindings. Detect it by
		// matching the `[` to its `]` and checking the next non-space char is `:`;
		// if so, skip the whole `[...]:` zone.
		//
		// Gate on `depth > 0`: a computed key is only valid INSIDE an object
		// pattern, so its `[` is always seen after the enclosing `{` bumped depth
		// to >= 1. A TOP-LEVEL array pattern with a trailing type annotation
		// (`[a, b]: Tuple`) has its `[` at depth 0 and ALSO has a `]:` — without
		// the gate it would be wrongly skipped, silently missing the real bindings
		// `a`/`b` (a false negative) and collecting the type `Tuple` (false
		// positive). At depth 0 we fall through to normal bracket traversal: the
		// array bindings are scanned, then the closing `]` returns depth to 0 and
		// the `entered && depth === 0` break below stops before the `: Tuple` tail
		// (a runtime-erased type), so `Tuple` is correctly never collected.
		if (ch === '[' && depth > 0) {
			let bd = 0;
			let j = i;
			for (; j < pattern.length; j++) {
				const c = pattern[j];
				if (c === '[') bd++;
				else if (c === ']') {
					bd--;
					if (bd === 0) break;
				}
			}
			let m = j + 1;
			while (m < pattern.length && /\s/.test(pattern[m] ?? '')) m++;
			if (pattern[m] === ':') {
				// Skip past the `[...]:` key zone; the value side that follows is
				// scanned normally for its bound local name(s).
				i = m + 1;
				continue;
			}
		}
		if (ch === '{' || ch === '[' || ch === '(') {
			depth++;
			entered = true;
			i++;
			continue;
		}
		if (ch === '}' || ch === ']' || ch === ')') {
			depth = Math.max(0, depth - 1);
			i++;
			// Once the outermost pattern has closed, anything that follows is a
			// trailing type annotation (`{ foo }: Type`) — erased at runtime, not a
			// binding — so stop scanning.
			if (entered && depth === 0) break;
			continue;
		}
		// On a default `=`, skip its value expression up to the next top-level
		// (relative to this point) comma or closing delimiter. String/template-aware:
		// a comma or closing delimiter INSIDE the default's string literal
		// (`{ a = "x,y" }`) is opaque text and does NOT end the skip — only a
		// genuinely string-closed, depth-0 separator does.
		if (ch === '=' && pattern[i + 1] !== '=') {
			let d = 0;
			let q = ''; // active string delimiter: `'`, `"`, or `` ` `` (empty = none)
			i++;
			while (i < pattern.length) {
				const c = pattern[i];
				if (q) {
					// Inside a string: only its matching delimiter ends it.
					if (c === q) q = '';
					i++;
					continue;
				}
				if (c === "'" || c === '"' || c === '`') q = c;
				else if (c === '{' || c === '[' || c === '(') d++;
				else if (c === '}' || c === ']' || c === ')') {
					if (d === 0) break;
					d--;
				} else if (c === ',' && d === 0) break;
				i++;
			}
			continue;
		}
		// Identifier start.
		if (/[A-Za-z_$]/.test(ch ?? '')) {
			let j = i;
			while (j < pattern.length && /[\w$]/.test(pattern[j] ?? '')) j++;
			const ident = pattern.slice(i, j);
			// Look ahead past whitespace: a following `:` marks this as a property
			// KEY (the binding is its value), so skip it.
			let k = j;
			while (k < pattern.length && /\s/.test(pattern[k] ?? '')) k++;
			if (pattern[k] === ':') {
				i = j;
				continue;
			}
			names.push(ident);
			i = j;
			continue;
		}
		i++;
	}
	return names;
}

/**
 * Removes `/* ... *\/` block comments and `//` line comments from the source so
 * a commented-out `export ...` is never scanned as a live export (the key
 * false-positive: a block comment whose body has `export` at column 0). To keep
 * the downstream line-by-line scan and multi-line `export { ... }` folding
 * working, this preserves line structure: comment bodies are blanked out but the
 * newlines they spanned are kept, so line counts and offsets are unchanged.
 *
 * String/template-literal aware: when inside a `'`/`"`/`` ` `` string, a `//` or
 * `/*` sequence is string CONTENT, not a comment delimiter, and is emitted
 * verbatim so a real export sharing the line with such a string (e.g. a URL in an
 * initializer, `export const x = "https://h", y = 2`) is not truncated. Comments
 * are only stripped OUTSIDE strings, and entering a comment cannot start a string
 * (the comment is consumed first). The template literal is treated as opaque
 * string content for stripping purposes: a `${...}` interpolation is NOT scanned
 * for nested comments — conservative and consistent with the binding scan's
 * template handling. Escaped quotes (`\"`) are honored so a backslash-escaped
 * delimiter does not prematurely close the string.
 */
function stripComments(source: string): string {
	let out = '';
	let i = 0;
	const n = source.length;
	let quote = ''; // active string delimiter: `'`, `"`, or `` ` `` (empty = none)
	while (i < n) {
		const ch = source[i];
		const next = source[i + 1];
		if (quote) {
			// Inside a string literal: emit verbatim. A backslash escapes the next
			// char (so `\"` does not close a `"` string). Only the matching,
			// unescaped delimiter ends it. `//` and `/*` here are string content.
			out += ch;
			if (ch === '\\' && i + 1 < n) {
				out += source[i + 1];
				i += 2;
				continue;
			}
			if (ch === quote) quote = '';
			i++;
			continue;
		}
		// Block comment: replace its body with spaces but keep any newlines so
		// line structure is preserved for the line-based scan below.
		if (ch === '/' && next === '*') {
			i += 2;
			while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
				out += source[i] === '\n' ? '\n' : ' ';
				i++;
			}
			i += 2; // consume the closing `*/` (or run off the end if unterminated)
			continue;
		}
		// Line comment: drop everything up to (but not including) the newline.
		if (ch === '/' && next === '/') {
			i += 2;
			while (i < n && source[i] !== '\n') i++;
			continue;
		}
		// String/template-literal open: enter opaque-content mode so `//`/`/*`
		// inside it are not mistaken for comment delimiters.
		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			out += ch;
			i++;
			continue;
		}
		out += ch;
		i++;
	}
	return out;
}

/**
 * Joins multi-line `export { ... }` lists onto a single logical line so the
 * line-by-line scan below sees the whole specifier list. A list that opens with
 * `export {` (or `export type {`) but does not close its brace on the same line
 * has subsequent lines folded in (with newlines turned into spaces) until the
 * closing `}` is found. All other lines pass through unchanged.
 */
function joinMultilineExportLists(source: string): string[] {
	const lines = source.split('\n');
	const joined: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]?.trimStart() ?? '';
		const opensList = /^export\s+(?:type\s+)?\{/.test(trimmed);
		if (opensList && !trimmed.includes('}')) {
			// Fold continuation lines until the closing brace appears.
			let buffer = lines[i] ?? '';
			while (i + 1 < lines.length && !buffer.includes('}')) {
				i++;
				buffer += ` ${(lines[i] ?? '').trim()}`;
			}
			joined.push(buffer);
		} else {
			joined.push(lines[i] ?? '');
		}
	}

	return joined;
}

/**
 * Returns the list of disallowed runtime export names found in a +page.server.ts
 * source string. Block (`/* ... *\/`) and line (`//`) comments are stripped first
 * so a commented-out `export ...` is never counted as a live export. Type-only
 * exports (`export type` / `export interface`) are skipped because they are
 * erased at runtime. Within an `export { ... }` list,
 * the EXPORTED name is what matters (`export { internal as load }` exports
 * `load`), and `type`-qualified specifiers are skipped. Multi-line `export
 * { ... }` lists are folded onto one logical line first, and `export * from`
 * wildcard re-exports are flagged because their re-exported names cannot be
 * statically resolved and may include non-reserved runtime exports.
 *
 * `export const|let|var` bindings are decomposed into every name they bind, so
 * multi-declarator lists (`export const foo = 1, bar = 2`) and destructuring
 * patterns (`export const { foo } = obj` / `export const [a, b] = arr`,
 * including nested/aliased/default/rest forms) are each fully flagged rather
 * than only catching the first identifier. `function`/`class` declarations bind
 * exactly one name and are handled directly.
 */
export function findDisallowedExports(source: string): string[] {
	const disallowed: string[] = [];

	// Strip comments first so a commented-out `export ...` (e.g. a block comment
	// whose body has `export` at column 0) is never mistaken for a live export.
	for (const rawLine of joinMultilineExportLists(stripComments(source))) {
		const line = rawLine.trimStart();
		if (!line.startsWith('export')) continue;

		// Type-only exports are erased at runtime — never a load-time violation.
		if (/^export\s+(type|interface)\b/.test(line)) continue;

		// `export default ...` is forbidden in a +page.server.ts.
		if (/^export\s+default\b/.test(line)) {
			disallowed.push('default');
			continue;
		}

		// `export * from "..."` (and `export * as ns from "..."`) re-exports
		// names that cannot be resolved statically. A bare `export *` may surface
		// non-reserved runtime exports from the target module, so flag it. A
		// `type`-qualified wildcard (`export type * from`) is erased at runtime.
		if (/^export\s+\*/.test(line) && !/^export\s+type\s+\*/.test(line)) {
			const nsMatch = line.match(/^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/);
			const wildcardName = nsMatch?.[1] ?? '*';
			if (!isAllowedName(wildcardName)) {
				disallowed.push(wildcardName);
			}
			continue;
		}

		// Re-export list: `export { a, b as c, type D }`.
		const reexport = line.match(/^export\s*\{([^}]*)\}/);
		if (reexport) {
			const specifiers = (reexport[1] ?? '').split(',');
			for (const spec of specifiers) {
				const trimmed = spec.trim();
				if (!trimmed) continue;
				// `export { type Foo }` — type-only specifier, erased at runtime.
				if (/^type\s+/.test(trimmed)) continue;
				// Honor `as` aliasing: the exported name is what callers see.
				const asMatch = trimmed.match(/\bas\s+([A-Za-z_$][\w$]*)/);
				const exportedName = asMatch?.[1] ?? trimmed;
				if (!isAllowedName(exportedName)) {
					disallowed.push(exportedName);
				}
			}
			continue;
		}

		// `export (async )?function NAME` / `export (class) NAME` — these forms
		// ALWAYS bind exactly one name and can never be multi-declarator or
		// destructured, so a single-identifier capture is correct.
		const fnClass = line.match(/^export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/);
		const fnClassName = fnClass?.[1];
		if (fnClassName) {
			if (!isAllowedName(fnClassName)) {
				disallowed.push(fnClassName);
			}
			continue;
		}

		// `export (const|let|var) <binding-list>` — a binding list may contain
		// multiple comma-separated declarators (`foo = 1, bar = 2`) and/or
		// destructuring patterns (`{ foo } = obj`, `[a, b] = arr`), each of which
		// introduces its own runtime export. Extract every bound name so none is
		// silently missed (the ISSUE-001 class of bug applies to each binding).
		const varDecl = line.match(/^export\s+(?:const|let|var)\s+([\s\S]+)$/);
		if (varDecl?.[1]) {
			for (const name of extractBoundNames(varDecl[1])) {
				if (!isAllowedName(name)) {
					disallowed.push(name);
				}
			}
		}
	}

	return disallowed;
}

async function listRouteServerModules(): Promise<string[]> {
	const glob = new Glob('**/+page.server.ts');
	const files: string[] = [];
	for await (const file of glob.scan({ cwd: ROUTES_DIR, absolute: true })) {
		files.push(file);
	}
	return files.sort();
}

describe('ISSUE-002 route-export guard — matcher logic', () => {
	it('flags a forbidden `export const` (the ISSUE-001-class shape)', () => {
		expect(findDisallowedExports('export const foo = 1;')).toEqual(['foo']);
	});

	it('flags a forbidden `export async function`', () => {
		expect(findDisallowedExports('export async function helper() {}')).toEqual(['helper']);
	});

	it('flags an `export default`', () => {
		expect(findDisallowedExports('export default {};')).toEqual(['default']);
	});

	it('flags a re-export alias by its EXPORTED name (`export { x as bar }`)', () => {
		expect(findDisallowedExports('export { x as bar };')).toEqual(['bar']);
	});

	it('does NOT flag a `_`-prefixed private helper export', () => {
		expect(findDisallowedExports('export function _deriveAiKeyMissingNotice() {}')).toEqual([]);
		expect(findDisallowedExports('export const _internal = 1;')).toEqual([]);
	});

	it('does NOT flag type-only exports (erased at runtime)', () => {
		expect(findDisallowedExports('export type Foo = string;')).toEqual([]);
		expect(findDisallowedExports('export interface Bar { x: number }')).toEqual([]);
		expect(findDisallowedExports('export { type Baz } from "./types";')).toEqual([]);
	});

	it('flags disallowed names in a multi-line `export { ... }` list', () => {
		const source = ['export {', '\tfoo,', '\tbar as baz', '};'].join('\n');
		expect(findDisallowedExports(source)).toEqual(['foo', 'baz']);
	});

	it('honors reserved/`_`/type specifiers inside a multi-line list', () => {
		const source = [
			'export {',
			'\thandler as load,',
			'\t_private,',
			'\ttype OnlyAType,',
			'\tnope',
			'} from "./mod";'
		].join('\n');
		expect(findDisallowedExports(source)).toEqual(['nope']);
	});

	it('flags every declarator in a multi-declarator `export const a, b`', () => {
		expect(findDisallowedExports('export const foo = 1, bar = 2;')).toEqual(['foo', 'bar']);
	});

	it('flags a forbidden 2nd declarator even when the 1st is reserved', () => {
		// `load` is reserved (allowed); `bar` is not.
		expect(findDisallowedExports('export const load = () => {}, bar = 2;')).toEqual(['bar']);
	});

	it('does NOT flag a multi-declarator list of only reserved/`_`/allowed names', () => {
		expect(findDisallowedExports('export const load = () => {}, _x = 1, ssr = false;')).toEqual([]);
	});

	it('flags a forbidden name in object destructuring (`export const { foo }`)', () => {
		expect(findDisallowedExports('export const { foo } = obj;')).toEqual(['foo']);
		expect(findDisallowedExports('export const { foo, bar } = obj;')).toEqual(['foo', 'bar']);
	});

	it('flags the LOCAL (aliased) name in object destructuring, not the key', () => {
		// `export const { key: bar } = obj` binds `bar`, not `key`.
		expect(findDisallowedExports('export const { key: bar } = obj;')).toEqual(['bar']);
	});

	it('honors reserved names in object destructuring (`{ load }` passes)', () => {
		expect(findDisallowedExports('export const { load } = helper;')).toEqual([]);
		expect(findDisallowedExports('export const { helper: load } = mod;')).toEqual([]);
	});

	it('flags forbidden names in array destructuring (`export const [a, b]`)', () => {
		expect(findDisallowedExports('export const [a, b] = arr;')).toEqual(['a', 'b']);
	});

	it('flags array-pattern bindings with a trailing type annotation (`[a, b]: Tuple`)', () => {
		// The top-level array `[` is at depth 0, so the computed-key skip (which
		// only applies INSIDE an object pattern, depth > 0) must NOT fire here.
		// `a`/`b` are real bindings; `Tuple` is a type and is erased at runtime, so
		// it must NOT be collected. Regression guard for the iteration-4 skip that
		// wrongly swallowed `[a, b]: Tuple` → `['Tuple']`.
		expect(findDisallowedExports('export const [a, b]: Tuple = arr;')).toEqual(['a', 'b']);
	});

	it('honors reserved names in a type-annotated array pattern (`[load, foo]: Tuple`)', () => {
		// `load` is reserved (allowed); only `foo` is forbidden. The trailing
		// `: Tuple` type must not leak in as a collected name.
		expect(findDisallowedExports('export const [load, foo]: Tuple = arr;')).toEqual(['foo']);
	});

	it('does NOT flag default values or reserved bindings in a pattern', () => {
		// `_priv` is private; default value `fallback` is not a binding.
		expect(findDisallowedExports('export const { _priv = fallback } = obj;')).toEqual([]);
		// Non-string default (`{ a = x }`) still binds only `a`.
		expect(findDisallowedExports('export const { a = x } = obj;')).toEqual(['a']);
	});

	it('does NOT split a default-value string on a comma inside it', () => {
		// The default-value skip is string-aware: the comma in `"x,y"` is string
		// content, so the skip does not end early and `y` is NOT mis-collected as a
		// binding. Only the real binding `a` is flagged.
		expect(findDisallowedExports('export const { a = "x,y" } = obj;')).toEqual(['a']);
		expect(findDisallowedExports("export const { a = 'x,y' } = obj;")).toEqual(['a']);
	});

	it('flags rest bindings in destructuring (`{ ...rest }`)', () => {
		expect(findDisallowedExports('export const { ...rest } = obj;')).toEqual(['rest']);
	});

	it('ignores a trailing type annotation on a destructured binding', () => {
		// `{ foo }: SomeType` binds `foo`; `SomeType` is erased at runtime.
		expect(findDisallowedExports('export const { foo }: SomeType = obj;')).toEqual(['foo']);
	});

	it('flags nested destructuring bindings', () => {
		expect(findDisallowedExports('export const { a: { b } } = obj;')).toEqual(['b']);
	});

	it('does NOT split on a comma inside a string initializer', () => {
		// The comma in `"a,b"` is string content, not a declarator separator, so
		// only the real binding `x` is collected (not a phantom `b`).
		expect(findDisallowedExports('export const x = "a,b";')).toEqual(['x']);
		expect(findDisallowedExports("export const x = 'a,b';")).toEqual(['x']);
		// `_`-prefixed binding with a comma-containing string → nothing disallowed.
		expect(findDisallowedExports('export const _x = "a,b";')).toEqual([]);
	});

	it('does NOT collect names from a template-literal interpolation', () => {
		// The whole template (including the `${f(a, b)}` interpolation) is the
		// initializer; no `$`/`a`/`b`/`f` is a binding. Only the real binding `x` is
		// collected. The interpolation token is built via concatenation so this
		// source string is not itself mistaken for a template placeholder.
		const src = `export const x = \`a,$${'{'}f(a, b)}\`;`;
		expect(findDisallowedExports(src)).toEqual(['x']);
	});

	it('still splits a genuine multi-declarator with commas OUTSIDE strings', () => {
		// The string-awareness must not regress real comma-separated declarators.
		expect(findDisallowedExports('export const a = 1, b = 2;')).toEqual(['a', 'b']);
		// Mixed: a string-comma declarator next to a real second declarator.
		expect(findDisallowedExports('export const x = "a,b", y = 2;')).toEqual(['x', 'y']);
	});

	it('does NOT collect the computed-key expression in `{ [key]: value }`', () => {
		// `key` is a reference (the computed key expression), not a binding; only
		// the local `value` is bound.
		expect(findDisallowedExports('export const { [key]: value } = obj;')).toEqual(['value']);
	});

	it('flags `export * from "..."` wildcard re-exports', () => {
		expect(findDisallowedExports('export * from "./barrel";')).toEqual(['*']);
	});

	it('flags `export * as ns from "..."` by its namespace name', () => {
		expect(findDisallowedExports('export * as helpers from "./barrel";')).toEqual(['helpers']);
	});

	it('does NOT flag `export type * from "..."` (erased at runtime)', () => {
		expect(findDisallowedExports('export type * from "./types";')).toEqual([]);
	});

	it('does NOT flag the SvelteKit-reserved exports', () => {
		const reserved = [
			'export const load = async () => {};',
			'export const actions = {};',
			'export const prerender = true;',
			'export const ssr = false;',
			'export const csr = true;',
			'export const trailingSlash = "always";',
			'export const config = {};',
			'export const entries = () => [];',
			'export { handler as load };'
		].join('\n');
		expect(findDisallowedExports(reserved)).toEqual([]);
	});

	it('does NOT flag an export inside a block comment (the false-positive case)', () => {
		const source = ['/*', 'export const foo = 1;', '*/'].join('\n');
		expect(findDisallowedExports(source)).toEqual([]);
	});

	it('does NOT flag an export inside a `//` line comment', () => {
		expect(findDisallowedExports('// export const foo = 1;')).toEqual([]);
		expect(findDisallowedExports('export const x = 1; // export const foo = 1;')).toEqual(['x']);
	});

	it('does NOT treat `//` inside a string initializer as a line comment', () => {
		// A URL in an initializer contains `//`; an unaware stripper would drop the
		// rest of the line and MISS the second declarator `y` (a false negative —
		// the guard's most serious failure mode). String-aware stripping keeps the
		// whole line, so both `x` and `y` are flagged.
		expect(findDisallowedExports('export const x = "https://example.com", y = 2;')).toEqual([
			'x',
			'y'
		]);
	});

	it('does NOT treat `/*` inside a string initializer as a block comment', () => {
		// `"a/*b"` contains a `/*` that an unaware stripper would treat as the start
		// of a block comment and blank the rest, dropping `y`. String-aware
		// stripping emits it verbatim, so both `x` and `y` are flagged.
		expect(findDisallowedExports('export const x = "a/*b", y = 2;')).toEqual(['x', 'y']);
	});

	it('still strips a REAL `//` comment that follows a string on the same line', () => {
		// String-awareness must not regress real comment stripping: the `//` here is
		// OUTSIDE the closed `"ok"` string, so it is a genuine line comment and the
		// commented-out `export` after it must NOT be flagged.
		expect(findDisallowedExports('export const x = "ok"; // export const foo = 1;')).toEqual(['x']);
	});

	it('does NOT flag a single-line `/* export { foo } */` block comment', () => {
		expect(findDisallowedExports('/* export { foo } */')).toEqual([]);
	});

	it('still flags a REAL export immediately after a block comment', () => {
		// Stripping the comment must NOT eat the live declaration that follows it.
		const source = ['/*', 'export const commented = 1;', '*/', 'export const live = 2;'].join('\n');
		expect(findDisallowedExports(source)).toEqual(['live']);
	});

	it('still flags a REAL export on the same line after an inline block comment', () => {
		expect(findDisallowedExports('/* note */ export const foo = 1;')).toEqual(['foo']);
	});
});

describe('ISSUE-002 route-export guard — current tree is clean', () => {
	it('finds at least one +page.server.ts to scan', async () => {
		const files = await listRouteServerModules();
		expect(files.length).toBeGreaterThan(0);
	});

	it('every +page.server.ts exports only reserved or `_`-prefixed names', async () => {
		const files = await listRouteServerModules();
		const violations: Record<string, string[]> = {};

		for (const file of files) {
			const source = await Bun.file(file).text();
			const disallowed = findDisallowedExports(source);
			if (disallowed.length > 0) {
				violations[relative(PROJECT_ROOT, file)] = disallowed;
			}
		}

		// If this fails, a route module exports a non-reserved symbol that
		// SvelteKit will reject at load time (the ISSUE-001 class of bug).
		expect(violations).toEqual({});
	});
});
