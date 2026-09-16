/**
 * Groups consecutive calls into a single execution `wait` ms after the last one.
 * `cancel()` discards any pending execution (useful in effect cleanup).
 */
export function debounce<A extends any[]>(
    fn: (...args: A) => void,
    wait = 600
): ((...args: A) => void) & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: A) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, wait);
    };

    debounced.cancel = () => {
        if (timer) clearTimeout(timer);
        timer = null;
    };

    return debounced;
}
