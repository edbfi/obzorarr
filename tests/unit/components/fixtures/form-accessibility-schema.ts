import { z } from 'zod';

export const formAccessibilitySchema = z.object({
	timezone: z.string().min(1, 'Enter a timezone'),
	shareMode: z.enum(['public', 'private-oauth']),
	enabled: z.boolean()
});

export type FormAccessibilityFixtureData = z.infer<typeof formAccessibilitySchema>;

export const FIXTURE_FORM_ID = 'fixture';
