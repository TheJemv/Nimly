// src/services/klipy/gifs.ts
import { klipyFetch } from "./client";

export interface KlipyMedia {
    url: string;
    dims: [number, number];
    size: number;
}

export interface KlipyGif {
    id: string;
    title: string;
    content_description?: string;
    media_formats: {
        gif?: KlipyMedia;
        mediumgif?: KlipyMedia;
        tinygif?: KlipyMedia;
    };
}

export interface KlipyCategory {
    searchterm: string;
    name: string;
    image: string;
}

export interface GifPage {
    results: KlipyGif[];
    /** Pagination token for the next page, or null when there are no more. */
    next: string | null;
}

// Only the formats we render — cuts the response to roughly a third.
const MEDIA_FILTER = "tinygif,mediumgif,gif";
// Keeps explicit GIFs out of a chat app that's on the App Store.
const CONTENT_FILTER = "medium";

const toPage = (data: any): GifPage => ({
    results: data?.results || [],
    next: data?.next || null,
});

/**
 * Searches for GIFs by keyword with pagination support.
 * @param query The search term or category identifier
 * @param limit Number of results per page (default: 24)
 * @param pos Pagination token (`next`) from the previous page
 */
export const searchGifs = async (query: string, limit = 24, pos?: string): Promise<GifPage> => {
    const params: Record<string, string | number> = {
        q: query,
        limit,
        media_filter: MEDIA_FILTER,
        contentfilter: CONTENT_FILTER,
    };
    if (pos) params.pos = pos;

    return toPage(await klipyFetch("/search", params));
};

/**
 * Fetches the currently trending GIFs.
 * @param limit Number of results per page (default: 24)
 * @param pos Pagination token (`next`) from the previous page
 */
export const getTrendingGifs = async (limit = 24, pos?: string): Promise<GifPage> => {
    const params: Record<string, string | number> = {
        limit,
        media_filter: MEDIA_FILTER,
        contentfilter: CONTENT_FILTER,
    };
    if (pos) params.pos = pos;

    return toPage(await klipyFetch("/featured", params));
};

/**
 * Fetches the available GIF categories/reactions for the initial view.
 */
export const getCategories = async (): Promise<KlipyCategory[]> => {
    const data = await klipyFetch("/categories", { contentfilter: CONTENT_FILTER });
    return data?.tags || [];
};
