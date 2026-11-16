export type AddressHeaderEnv = { readonly ADDRESS_HEADER?: string | undefined };

/**
 * The header adapter-bun reads the client's address from, lower-cased as it reads it, or
 * undefined when the variable is unset or empty and the address is the connection's. adapter-bun
 * reads and uses the variable itself; the app reads it only to know whether it is set
 * (SPEC-sign-in.md, "Configuration").
 */
export function readAddressHeader(env: AddressHeaderEnv): string | undefined {
	return env.ADDRESS_HEADER?.toLowerCase() || undefined;
}
