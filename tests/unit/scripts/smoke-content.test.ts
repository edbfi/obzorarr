import { describe, expect, it } from 'bun:test';
import { assertSetupHtml } from '../../../scripts/smoke-content';

const page = `<!doctype html><html><head><title>Setup - Obzorarr</title></head><body>
<h1>Claim Setup</h1><form method="POST" action="?/claimInstance">
<input name="token" type="password" required><button type="submit">Claim setup</button>
</form></body></html>`;

describe('production setup content', () => {
	it('accepts the rendered setup claim page', async () => {
		await expect(assertSetupHtml(page)).resolves.toBeUndefined();
	});

	it('rejects empty, error and unrelated successful HTML', async () => {
		for (const html of ['', '<h1>Internal Server Error</h1>', '<title>Obzorarr</title><p>ok</p>']) {
			await expect(assertSetupHtml(html)).rejects.toThrow('missing');
		}
	});

	it('requires the semantic title, heading and functional claim form', async () => {
		for (const html of [
			page.replace('Setup - Obzorarr', 'Other app'),
			page.replace('Claim Setup', 'Error'),
			page.replace('?/claimInstance', '?/wrongAction'),
			page.replace('name="token"', 'name="other"'),
			page.replace(' required', ''),
			page.replace('type="submit"', 'type="button"')
		]) {
			await expect(assertSetupHtml(html)).rejects.toThrow('missing');
		}
	});
});
