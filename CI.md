# CI and Renovate

Every pull request and default-branch push runs read-only Biome and Svelte checks,
the full Bun unit/property/integration suite with its existing 80% line/function
coverage thresholds, a production build and real-server smoke using a fresh temporary
SQLite database, and prek hygiene/secrets checks. The smoke requires the expected
setup route, HTML content type, Obzorarr title, claim heading and required bootstrap
token form with its submit action; an arbitrary HTTP 200 no longer passes. No Plex
credentials are needed.
The aggregate `ci / required` rejects missing, skipped, cancelled or failed jobs.

Local checks use Bun 1.4.2 and `bun install --frozen-lockfile`, then
`bun run check:biome`, `bun run check`, and `bash .github/scripts/check.sh`.
Hygiene uses the lockfile's own prek version via `bunx --no-install prek run
--all-files --hook-stage manual`; CI skips the branch guard and duplicate Biome hook.
Pre-push now calls the same `.env.test`-aware test command as CI. Dependency install
also propagates SvelteKit preparation failures instead of masking them.

Shared workflows and actions use immutable full version tags in `edbfi/automation`.
Renovate's shared preset preserves grouped non-major updates, handles Biome package
and schema versions through the official manager, and updates actions, hooks and Bun.
Renovate owns ongoing dependency merging after the protected native canary
[automation#39](https://github.com/edbfi/automation/pull/39). Root-level automerge
uses PR rebase merges with test checking enabled and platform automerge off.
Complete current-head CI and policy checks, up-to-date branches, release ages,
reviews and hold labels remain required. Shared automation configuration updates
remain manual. Svelte compatibility checks and the TypeScript 7 hold remain in place.

The custom checked merger and maintainer `/merge` commands are retired. Require
`ci / required` and the emitted `policy / ci / policy` context from GitHub Actions,
current branches and native review restrictions before enabling Renovate merges.
The read-only policy check preserves Conventional Commit titles, author-matching
DCO, authentic Renovate provenance, outstanding review requests and objections.
Hold labels apply to every PR; label/review events refresh policy independently.
GitHub metadata events are asynchronous, so this does not claim an atomic label
lock. PR rebase merges preserve genuine commit sign-offs.

The previous CI could rewrite and push code, ignore formatting errors, and skip
fresh workflow execution after a token-authenticated push. Biome repair now computes
with read-only permissions using only the exact isolated official formatter, then
publishes allowlisted changes through the repository-scoped repair App and
explicitly dispatches full CI for the exact repaired SHA. It cannot edit workflows,
package manifests or lockfiles. Broad repairs beyond the shared size limits are manual.

Recovery settings move unchanged to `.github/repair-policy.json`, with the v3
publication reference. Workflow-token heads missing a policy event remain blocked
until a supported Renovate/App update produces complete CI and policy evidence.
CI has read-only permissions, timeouts, frozen installs and cancellation for
superseded runs. Normal default-branch push CI is preserved; there were no
helper-dispatched deployment workflows to replace.
The large offline suite covers server behavior but does not replace real Plex
integration or visual browser checks. Installed Playwright tooling alone is not
claimed as browser coverage; no browser test suite is configured in this repository.
