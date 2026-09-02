const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿`value` es un UUID canónico? */
export const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && UUID_RE.test(value.trim());

/**
 * Devuelve el UUID normalizado o lanza. Úsalo antes de interpolar un id de
 * usuario en filtros PostgREST `.or(...)` para evitar romper/alterar la query.
 */
export const assertUuid = (value: unknown, label = 'id'): string => {
    if (!isUuid(value)) throw new Error(`Invalid ${label}`);
    return (value as string).trim().toLowerCase();
};
