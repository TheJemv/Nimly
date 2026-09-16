// Scrubbing of sensitive data before it goes out to Sentry.
// Nimly is E2EE: no decrypted text, keys, seeds, or passcodes should leave
// the device, not even in a stack trace or a breadcrumb.

const SENSITIVE_KEY = /pass(code|word)|priv(ate)?.?key|secret|mnemonic|\bseed\b|_hash\b|\bcontent\b|cipher|\btoken\b|encrypt/i;

// Long base64 / hex blobs (encrypted packets, keys, tokens).
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

/** Sentry's `beforeSend`. Never throws: when in doubt, lets the event through. */
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
        /* don't block sending due to a scrub failure */
    }
    return event;
}

/** `beforeBreadcrumb`: discards low-level console noise, redacts the rest. */
export function scrubBreadcrumb(bc: any): any {
    if (bc.category === 'console' && bc.level !== 'error' && bc.level !== 'warning') return null;
    if (typeof bc.message === 'string') bc.message = redactString(bc.message);
    if (bc.data) bc.data = scrub(bc.data);
    return bc;
}
