const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is `value` a canonical UUID? */
export const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && UUID_RE.test(value.trim());

/**
 * Returns the normalized UUID or throws. Use it before interpolating a user
 * id into PostgREST `.or(...)` filters to avoid breaking/altering the query.
 */
export const assertUuid = (value: unknown, label = 'id'): string => {
    if (!isUuid(value)) throw new Error(`Invalid ${label}`);
    return (value as string).trim().toLowerCase();
};
