// A move between the story's steps dips like a projector changing reels (SPEC-recap-spike.md,
// "Motion"): for this share of the move the screen goes dark, the leaving step fading out while the
// entering one, and its entrance, wait. Story.svelte's transitions and the entrance keyframes in
// panda.config.ts both read it, so they stay in step.
export const reelChange = 0.3;
