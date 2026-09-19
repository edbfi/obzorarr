/** Require the real fresh-instance setup form, not an arbitrary HTTP 200. */
export async function assertSetupHtml(html: string): Promise<void> {
	let title = '';
	let heading = '';
	let tokenInput = false;
	let submitButton = false;
	await new HTMLRewriter()
		.on('title', {
			text: (chunk) => {
				title += chunk.text;
			}
		})
		.on('h1', {
			text: (chunk) => {
				heading += chunk.text;
			}
		})
		.on(
			'form[method="POST"][action="?/claimInstance"] input[name="token"][type="password"][required]',
			{
				element: () => {
					tokenInput = true;
				}
			}
		)
		.on('form[method="POST"][action="?/claimInstance"] button[type="submit"]', {
			element: () => {
				submitButton = true;
			}
		})
		.transform(new Response(html))
		.text();
	if (
		title.trim() !== 'Setup - Obzorarr' ||
		heading.trim() !== 'Claim Setup' ||
		!tokenInput ||
		!submitButton
	) {
		throw new Error(
			'Production HTML is missing the Obzorarr setup title, heading or bootstrap claim form'
		);
	}
}
