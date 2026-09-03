// Scrubbing de datos sensibles antes de que salgan a Sentry.
// Nimly es E2EE: nada de texto descifrado, llaves, seeds ni passcodes debe salir
// del dispositivo, ni siquiera en un stack trace o un breadcrumb.

const SENSITIVE_KEY = /pass(code|word)|priv(ate)?.?key|secret|mnemonic|\bseed\b|_hash\b|\bcontent\b|cipher|\btoken\b|encrypt/i;

// Bloques largos base64 / hex (paquetes cifrados, llaves, tokens).
const LONG_BLOB = /[A-Za-z0-9+/=_-]{80,}/g;
const FULL_BLOB = /^(?:v2:)?[A-Za-z0-9+/=:_-]{64,}$/;

const REDACTED = '[redacted]';

const redactString = (s: string): string => {
    if (FULL_BLOB.test(s.trim())) return `[redacted:${s.length}b]`;
    return s.replace(LONG_BLOB, '[redacted-blob]');
};

const scrub = (value: unknown, key = ''): unknown => {
    if (SENSITIVE_KEY.test(key)) return REDACTED;
    if (typeof value === 'string') return redactString(value);
    if (Array.isArray(value)) return value.map((v) => scrub(v, key));
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrub(v, k);
        return out;
    }
    return value;
};

/** `beforeSend` de Sentry. Nunca lanza: ante la duda deja pasar el evento. */
export function scrubSentryEvent(event: any): any {
    try {
        if (event.extra) event.extra = scrub(event.extra);
        if (event.contexts) event.contexts = scrub(event.contexts);
        if (typeof event.message === 'string') event.message = redactString(event.message);

        for (const ex of event.exception?.values ?? []) {
            if (typeof ex.value === 'string') ex.value = redactString(ex.value);
        }
        for (const bc of event.breadcrumbs ?? []) {
            if (typeof bc.message === 'string') bc.message = redactString(bc.message);
            if (bc.data) bc.data = scrub(bc.data);
        }
    } catch {
        /* no bloqueamos el envío por un fallo del scrub */
    }
    return event;
}

/** `beforeBreadcrumb`: descarta ruido de consola de bajo nivel, redacta el resto. */
export function scrubBreadcrumb(bc: any): any {
    if (bc.category === 'console' && bc.level !== 'error' && bc.level !== 'warning') return null;
    if (typeof bc.message === 'string') bc.message = redactString(bc.message);
    if (bc.data) bc.data = scrub(bc.data);
    return bc;
}
