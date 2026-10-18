import { defineConfig } from "@pandacss/dev";

// The obzorarr design system ("After Hours"). This file is the token source: DESIGN.md describes
// how the tokens are used, and components use them only through Panda (`strictTokens`).
export default defineConfig({
	// Utilities and conditions only: every token below is the app's own, with no preset palette.
	presets: ["@pandacss/preset-base"],
	preflight: true,
	strictTokens: true,
	include: ["./src/**/*.{ts,svelte}"],
	exclude: [],
	outdir: "styled-system",

	globalCss: {
		// Dark-first: app.html sets the `dark` class, so native controls and scrollbars match.
		".dark": { colorScheme: "dark" },
		body: { bg: "background", color: "text", textStyle: "body" },
		"::selection": { bg: "primary", color: "background" },
	},

	theme: {
		// Mobile first: `tablet` from 768px (below it, navigation is a drawer), `desktop` from
		// 1024px (below it, navigation collapses to a rail).
		breakpoints: {
			tablet: "768px",
			desktop: "1024px",
		},

		tokens: {
			fonts: {
				// System fallbacks until the first surface bundles the font files locally.
				display: { value: '"Space Grotesk", system-ui, sans-serif' },
				body: { value: '"Instrument Sans", system-ui, sans-serif' },
				mono: { value: '"IBM Plex Mono", monospace' },
			},
			fontSizes: {
				display: { value: "56px" },
				h1: { value: "32px" },
				h2: { value: "24px" },
				h3: { value: "20px" },
				body: { value: "16px" },
				label: { value: "14px" },
				table: { value: "14px" },
				caption: { value: "12px" },
				number: { value: "32px" },
				code: { value: "13px" },
			},
			fontWeights: {
				regular: { value: "400" },
				medium: { value: "500" },
				semibold: { value: "600" },
				// The display text style's weight.
				display: { value: "650" },
			},
			lineHeights: {
				display: { value: "1.08" },
				h1: { value: "1.2" },
				h2: { value: "1.3" },
				h3: { value: "1.4" },
				body: { value: "1.6" },
				label: { value: "1.4" },
				table: { value: "1.45" },
				caption: { value: "1.5" },
				number: { value: "1.2" },
				code: { value: "1.5" },
			},
			letterSpacings: {
				display: { value: "-0.03em" },
				h1: { value: "-0.02em" },
			},
			spacing: {
				xs: { value: "4px" },
				sm: { value: "8px" },
				md: { value: "12px" },
				lg: { value: "16px" },
				xl: { value: "24px" },
				xxl: { value: "32px" },
				section: { value: "48px" },
				hero: { value: "64px" },
				mobileGutter: { value: "16px" },
				tabletGutter: { value: "24px" },
				desktopGutter: { value: "32px" },
			},
			sizes: {
				sidebar: { value: "224px" },
				topbar: { value: "64px" },
				formMax: { value: "672px" },
				readingMax: { value: "680px" },
				contentMax: { value: "1440px" },
				drawer: { value: "400px" },
				controlHeight: { value: "44px" },
				tableRow: { value: "44px" },
				compactRow: { value: "36px" },
			},
			radii: {
				sm: { value: "4px" },
				control: { value: "8px" },
				panel: { value: "12px" },
				dialog: { value: "16px" },
				full: { value: "999px" },
			},
			// Reduced motion: no transform, reveal, count-up or persistent animation; final content
			// stays visible.
			durations: {
				press: { value: "100ms" },
				feedback: { value: "160ms" },
				panel: { value: "200ms" },
				// Up to this long: the recap story transition.
				story: { value: "320ms" },
			},
		},

		// Colours exist only in a colour mode. Dark is the default (app.html), and After Hours is the
		// only theme (docs/SPEC.md, ground-floor choice 4): the module that brings back the theme
		// settings decides how more presets switch these values, without touching components.
		semanticTokens: {
			colors: {
				background: { value: { _dark: "#0B1828" } },
				surface: { value: { _dark: "#142D45" } },
				raised: { value: { _dark: "#1B3952" } },
				// Decorative panel separation; `control-border` bounds fields and controls.
				border: { value: { _dark: "#35536D" } },
				"control-border": { value: { _dark: "#708597" } },
				primary: { value: { _dark: "#6BE4E4" } },
				secondary: { value: { _dark: "#4F9ECF" } },
				text: { value: { _dark: "#F2F8FF" } },
				muted: { value: { _dark: "#B3C6D8" } },
				success: { value: { _dark: "#9CDDBD" } },
				warning: { value: { _dark: "#F0C680" } },
				danger: { value: { _dark: "#FFACB5" } },
			},
		},

		textStyles: {
			display: {
				value: {
					fontFamily: "display",
					fontSize: "display",
					fontWeight: "display",
					lineHeight: "display",
					letterSpacing: "display",
				},
			},
			h1: {
				value: {
					fontFamily: "display",
					fontSize: "h1",
					fontWeight: "semibold",
					lineHeight: "h1",
					letterSpacing: "h1",
				},
			},
			h2: {
				value: { fontFamily: "body", fontSize: "h2", fontWeight: "semibold", lineHeight: "h2" },
			},
			h3: {
				value: { fontFamily: "body", fontSize: "h3", fontWeight: "semibold", lineHeight: "h3" },
			},
			body: {
				value: { fontFamily: "body", fontSize: "body", fontWeight: "regular", lineHeight: "body" },
			},
			label: {
				value: {
					fontFamily: "body",
					fontSize: "label",
					fontWeight: "semibold",
					lineHeight: "label",
				},
			},
			table: {
				value: {
					fontFamily: "body",
					fontSize: "table",
					fontWeight: "regular",
					lineHeight: "table",
				},
			},
			caption: {
				value: {
					fontFamily: "body",
					fontSize: "caption",
					fontWeight: "regular",
					lineHeight: "caption",
				},
			},
			// Operational numbers use tabular mono glyphs.
			number: {
				value: {
					fontFamily: "mono",
					fontSize: "number",
					fontWeight: "medium",
					lineHeight: "number",
					fontVariantNumeric: "tabular-nums",
				},
			},
			code: {
				value: { fontFamily: "mono", fontSize: "code", fontWeight: "regular", lineHeight: "code" },
			},
		},
	},
});
