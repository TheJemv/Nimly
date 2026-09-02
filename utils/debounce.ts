/**
 * Agrupa llamadas seguidas en una sola ejecución `wait` ms después de la última.
 * `cancel()` descarta cualquier ejecución pendiente (útil en cleanup de efectos).
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
