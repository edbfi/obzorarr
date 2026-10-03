import { getContext, setContext } from 'svelte';

/**
 * In-house replacement for the Formsnap field context. The components in this
 * folder read only the store-based superForm API (`form`, `formId`, `errors`,
 * `constraints`, `tainted`), which sveltekit-superforms 2.x and 3.x share.
 *
 * Ids are derived from the form id and the field name, so they are stable across
 * renders and identical in the server HTML and after hydration:
 * `<formId>-<name>-control`, `-label`, `-description` and `-errors`.
 */

const FORM_FIELD_CONTEXT = Symbol('obzorarr.form-field');

export interface FormFieldIds {
	control: string;
	label: string;
	description: string;
	errors: string;
}

export interface FormFieldConstraints {
	required?: boolean;
	[key: string]: unknown;
}

export interface FormFieldContext {
	readonly name: string;
	readonly ids: FormFieldIds;
	readonly errors: string[];
	readonly constraints: FormFieldConstraints;
	readonly tainted: boolean;
	/**
	 * Declared on `Field` (the `description` prop) rather than registered by
	 * `Description` itself: `Control` renders before `Description`, and a server
	 * render is a single pass, so a late registration could never reach the
	 * control's server HTML.
	 */
	readonly hasDescription: boolean;
}

export interface FormControlAttributes {
	id: string;
	name: string;
	'aria-describedby': string | undefined;
	'aria-invalid': 'true' | undefined;
	'aria-required': 'true' | undefined;
	'data-form-error': '' | undefined;
}

export function setFormField(context: FormFieldContext): FormFieldContext {
	return setContext(FORM_FIELD_CONTEXT, context);
}

export function getFormField(): FormFieldContext {
	const context = getContext<FormFieldContext | undefined>(FORM_FIELD_CONTEXT);
	if (!context) {
		throw new Error('Form components must be rendered inside <Form.Field>.');
	}
	return context;
}

/** Keeps an id segment to characters that are valid and selector-safe. */
export function toIdSegment(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]+/g, '_');
}

export function formFieldIds(formId: string, name: string): FormFieldIds {
	const base = `${toIdSegment(formId)}-${toIdSegment(name)}`;
	return {
		control: `${base}-control`,
		label: `${base}-label`,
		description: `${base}-description`,
		errors: `${base}-errors`
	};
}

/** Reads a dotted or bracketed field path (`a.b`, `items[0]`) from an object. */
export function getValueAtPath(path: string, source: unknown): unknown {
	let value: unknown = source;
	for (const key of path.split(/[[\].]/).filter(Boolean)) {
		if (typeof value !== 'object' || value === null) return undefined;
		value = (value as Record<string, unknown>)[key];
	}
	return value;
}

/** Normalizes a superforms error entry (array or `{ _errors }`) to a string list. */
export function extractErrorArray(errors: unknown): string[] {
	if (Array.isArray(errors)) return errors.map(String);
	if (typeof errors === 'object' && errors !== null && '_errors' in errors) {
		const nested = (errors as { _errors?: unknown })._errors;
		if (Array.isArray(nested)) return nested.map(String);
	}
	return [];
}

/**
 * The attributes a control receives from `Control`. `aria-describedby` lists the
 * description only when the field declares one, and the errors container only
 * while there are errors, so it never points at a missing or empty element.
 */
export function formControlAttributes(field: FormFieldContext): FormControlAttributes {
	const hasErrors = field.errors.length > 0;
	const describedBy = [
		field.hasDescription ? field.ids.description : undefined,
		hasErrors ? field.ids.errors : undefined
	].filter(Boolean);
	return {
		id: field.ids.control,
		name: field.name,
		'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
		'aria-invalid': hasErrors ? 'true' : undefined,
		'aria-required': field.constraints.required ? 'true' : undefined,
		'data-form-error': hasErrors ? '' : undefined
	};
}
