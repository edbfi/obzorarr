// Stand-ins for the three modules the Security settings page binds to SvelteKit:
// `$app/forms` (`enhance`), `$app/navigation` (`invalidateAll`) and
// `$lib/utils/submit-action` (which calls `deserialize` from `$app/forms`).
// A server render calls none of them. security-csrf-card.test.ts points the
// page's three imports here, so it never registers a `mock.module` that another
// test file's mock of `$app/forms` could collide with.
export const enhance = () => ({ destroy() {} });
export const invalidateAll = async () => {};
export const submitAction = async () => {
	throw new Error('submitAction is not used by a server render');
};
