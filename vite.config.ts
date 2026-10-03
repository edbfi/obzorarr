import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import adapter from 'svelte-adapter-bun';
import UnoCSS from 'unocss/vite';
import { defineConfig, type PluginOption } from 'vite';
import {
	isBlockedPath,
	isBlockedUserAgent
} from './src/lib/server/security/request-filter-patterns';

const rolldownChecks = { pluginTimings: false } as Record<string, boolean>;

function devRequestFilter(): PluginOption {
	return {
		name: 'obzorarr-dev-request-filter',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				let path: string;

				try {
					path = new URL(req.url ?? '/', 'http://localhost').pathname;
				} catch {
					res.statusCode = 400;
					res.end('Bad Request');
					return;
				}

				const userAgent = req.headers['user-agent'];
				const userAgentValue = Array.isArray(userAgent) ? userAgent.join(' ') : (userAgent ?? '');

				if (isBlockedPath(path)) {
					res.statusCode = 404;
					res.end('Not Found');
					return;
				}

				if (isBlockedUserAgent(userAgentValue)) {
					res.statusCode = 403;
					res.end('Forbidden');
					return;
				}

				next();
			});
		}
	};
}

export default defineConfig({
	build: {
		rollupOptions: {
			checks: rolldownChecks
		}
	},
	plugins: [
		UnoCSS(),
		devRequestFilter(),
		sveltekit({
			preprocess: vitePreprocess(),
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					'img-src': [
						'self',
						'https://plex.tv',
						'https://*.plex.direct',
						'https://secure.gravatar.com',
						// Plex proxies some user avatars through WordPress/Gravatar's image CDN
						// (i0.wp.com); without this the avatar is blocked and logs a CSP
						// violation on /admin (ISSUE-002).
						'https://i0.wp.com',
						'data:'
					],
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					'font-src': ['self', 'https://fonts.gstatic.com'],
					'script-src': ['self'],
					'script-src-attr': [
						'unsafe-hashes',
						'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='
					],
					'connect-src': ['self', 'https://plex.tv'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			},
			adapter: adapter({ out: 'build', precompress: true }),
			csrf: {
				// Obzorarr enforces configured-origin checks in csrfHandle. SvelteKit's
				// built-in form-origin gate is disabled here to preserve the dedicated
				// self-repair path; SameSite=Lax cookies remain defense in depth.
				trustedOrigins: ['*']
			}
		}),

		process.env.ANALYZE
			? visualizer({
					filename: 'bundle-stats.html',
					gzipSize: true,
					brotliSize: true,
					open: false
				})
			: null
	].filter(Boolean) as PluginOption[]
});
