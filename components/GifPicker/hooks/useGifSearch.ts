import {
    getCategories,
    getTrendingGifs,
    searchGifs,
    type GifPage,
    type KlipyCategory,
    type KlipyGif,
} from '@/api/klipy/gifs';
import { useCallback, useEffect, useRef, useState } from 'react';

export type GifPickerMode = 'home' | 'trending' | 'search';

const SEARCH_DEBOUNCE_MS = 350;

// The sheet unmounts its content on close, so the home screen (categories and
// the trending tile) is cached here to open instantly the next time.
const HOME_TTL_MS = 10 * 60 * 1000;
let homeCache: { categories: KlipyCategory[]; trending: GifPage; at: number } | null = null;

export function useGifSearch() {
    const [mode, setMode] = useState<GifPickerMode>('home');
    const [query, setQuery] = useState('');

    const [categories, setCategories] = useState<KlipyCategory[]>(homeCache?.categories ?? []);
    const [trendingCover, setTrendingCover] = useState<KlipyGif | null>(homeCache?.trending.results[0] ?? null);
    const [homeLoading, setHomeLoading] = useState(!homeCache);
    const [homeError, setHomeError] = useState(false);

    const [results, setResults] = useState<KlipyGif[]>([]);
    const [next, setNext] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(false);

    // Every new search bumps this; responses from an older one are dropped.
    const requestId = useRef(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The grid calls loadMore on every scroll event near the end; state updates
    // land too late to stop the duplicates, this doesn't.
    const loadMoreInFlight = useRef(false);

    const loadHome = useCallback(async () => {
        if (homeCache && Date.now() - homeCache.at < HOME_TTL_MS) return;
        setHomeLoading(true);
        setHomeError(false);
        try {
            const [cats, trending] = await Promise.all([getCategories(), getTrendingGifs()]);
            homeCache = { categories: cats, trending, at: Date.now() };
            setCategories(cats);
            setTrendingCover(trending.results[0] ?? null);
        } catch {
            if (!homeCache) setHomeError(true);
        } finally {
            setHomeLoading(false);
        }
    }, []);

    useEffect(() => {
        loadHome();
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [loadHome]);

    const fetchFirstPage = useCallback(async (nextMode: GifPickerMode, term: string) => {
        const id = ++requestId.current;
        setResults([]);
        setNext(null);
        setError(false);
        setLoading(true);
        setLoadingMore(false);

        try {
            const page = nextMode === 'trending'
                ? (homeCache?.trending ?? await getTrendingGifs())
                : await searchGifs(term);
            if (id !== requestId.current) return;
            setResults(page.results);
            setNext(page.next);
        } catch {
            if (id === requestId.current) setError(true);
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, []);

    const loadMore = useCallback(async () => {
        if (!next || loading || loadMoreInFlight.current || mode === 'home') return;
        const id = requestId.current;
        loadMoreInFlight.current = true;
        setLoadingMore(true);

        try {
            const page = mode === 'trending'
                ? await getTrendingGifs(24, next)
                : await searchGifs(query.trim(), 24, next);
            if (id !== requestId.current) return;
            // A page can repeat items near the boundary; keys must stay unique.
            setResults(prev => {
                const seen = new Set(prev.map(g => g.id));
                return [...prev, ...page.results.filter(g => !seen.has(g.id))];
            });
            setNext(page.next);
        } catch {
            // Leave `next` as is so scrolling to the end again retries.
        } finally {
            loadMoreInFlight.current = false;
            if (id === requestId.current) setLoadingMore(false);
        }
    }, [next, loading, mode, query]);

    const goHome = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        requestId.current++;
        setQuery('');
        setMode('home');
        setResults([]);
        setNext(null);
        setError(false);
        setLoading(false);
        setLoadingMore(false);
    }, []);

    const changeQuery = useCallback((text: string) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        const term = text.trim();
        if (!term) {
            goHome();
            return;
        }

        // Drop whatever is in flight for the previous text while this one waits.
        requestId.current++;
        setMode('search');
        setLoading(true);
        debounceRef.current = setTimeout(() => fetchFirstPage('search', term), SEARCH_DEBOUNCE_MS);
    }, [fetchFirstPage, goHome]);

    const openCategory = useCallback((term: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setQuery(term);
        setMode('search');
        fetchFirstPage('search', term);
    }, [fetchFirstPage]);

    const openTrending = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setQuery('');
        setMode('trending');
        fetchFirstPage('trending', '');
    }, [fetchFirstPage]);

    const retry = useCallback(() => {
        if (mode === 'home') loadHome();
        else fetchFirstPage(mode, query.trim());
    }, [mode, query, loadHome, fetchFirstPage]);

    return {
        mode,
        query,
        categories,
        trendingCover,
        homeLoading,
        homeError,
        results,
        loading,
        loadingMore,
        hasMore: !!next,
        error,
        changeQuery,
        openCategory,
        openTrending,
        goHome,
        loadMore,
        retry,
    };
}
