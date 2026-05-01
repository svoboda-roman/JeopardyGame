/**
 * Throw if `value` is null/undefined; otherwise return it narrowed.
 * Use for invariants the type system can't express — e.g. a row we
 * just inserted, a record we just looked up by a known-present key.
 */
export function invariant<T>(value: T | null | undefined, message: string): T {
	if (value === null || value === undefined) {
		throw new Error(`Invariant violated: ${message}`);
	}
	return value;
}
