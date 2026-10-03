import { defineParams } from '@sveltejs/kit/params';

const matchYear = (param: string): boolean => /^\d{4}$/.test(param);

export const params = defineParams({
	year: (param) => (matchYear(param) ? param : undefined)
});
