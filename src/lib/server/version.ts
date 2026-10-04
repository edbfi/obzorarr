import { env } from '$lib/server/private-env';
import pkg from '../../../package.json';

export type AppVersion = {
	kind: 'release' | 'nightly' | 'dev';
	display: string;
};

const SEMVER = /^v?\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{7,40}$/i;

export function getAppVersion(): AppVersion {
	const tag = env.COMMIT_TAG?.trim();

	if (!tag) {
		return { kind: 'dev', display: `v${pkg.version}` };
	}
	if (SEMVER.test(tag)) {
		return {
			kind: 'release',
			display: tag.startsWith('v') ? tag : `v${tag}`
		};
	}
	if (SHA.test(tag)) {
		return { kind: 'nightly', display: `nightly · ${tag.slice(0, 7)}` };
	}
	return { kind: 'dev', display: tag };
}
