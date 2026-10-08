import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';

// Nimly Face (facial recognition), called straight from the app.
const url = (process.env.EXPO_PUBLIC_NIMLY_FACE_URL || 'https://vision.nimly.cloud').replace(/\/+$/, '');
const apiKey = process.env.EXPO_PUBLIC_NIMLY_FACE_API_KEY;

/** false in builds without the API key: calls would only get a 401. */
export const isFaceConfigured = Boolean(apiKey);

const MISSING_KEY = __DEV__
    ? 'Falta EXPO_PUBLIC_NIMLY_FACE_API_KEY en .env.local (reinicia Metro con --clear después de ponerla).'
    : 'El registro facial no está disponible. Intenta más tarde.';

// Nimly Face takes 3–25 s to process an enrollment: leave room for the upload too.
const ENROLL_TIMEOUT_MS = 90_000;
const DELETE_TIMEOUT_MS = 10_000;
const BLUR_TIMEOUT_MS = 30_000;
const IDENTIFY_TIMEOUT_MS = 30_000;

const UNAVAILABLE = 'El registro facial no está disponible. Intenta más tarde.';
const ENROLL_FAILED = 'No se pudo registrar tu cara. Intenta más tarde.';
const DELETE_FAILED = 'No se pudo borrar tu cara. Intenta más tarde.';
const BLUR_FAILED = "Couldn't check the photo for faces";

/** Failed Nimly Face call. `rescan`: the video was the problem, sending it again won't help. */
export class FaceApiError extends Error {
    constructor(message: string, public rescan = false) {
        super(message);
        this.name = 'FaceApiError';
    }
}

// Never logs the API key: only method, URL, status and the server's answer.
const log = (message: string) => {
    if (__DEV__) console.log(`[nimly-face] ${message}`);
};

function requireKey(method: string, path: string) {
    if (!apiKey) {
        log(`${method} ${path} ✕ EXPO_PUBLIC_NIMLY_FACE_API_KEY not set (restart Metro with --clear after adding it)`);
        throw new FaceApiError(MISSING_KEY);
    }
    return apiKey;
}

// Logs the server's answer and parses its JSON (Cloudflare answers some errors with HTML).
function readAnswer(method: string, path: string, status: number, text: string, started: number) {
    log(`${method} ${path} ← ${status} in ${Date.now() - started}ms · ${text.slice(0, 300)}`);
    if (status === 401) log('the API key was rejected: check EXPO_PUBLIC_NIMLY_FACE_API_KEY');
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// status 0 = no answer (offline, timeout, server down).
async function request(path: string, init: RequestInit, timeoutMs: number) {
    const method = init.method ?? 'GET';
    const key = requireKey(method, path);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    log(`${method} ${url}${path} → sending`);
    try {
        const res = await fetch(`${url}${path}`, {
            ...init,
            headers: { 'X-API-Key': key },
            signal: controller.signal,
        });
        const text = await res.text().catch(() => '');
        return { status: res.status, data: readAnswer(method, path, res.status, text, started) };
    } catch (e: any) {
        const reason = controller.signal.aborted ? `timed out after ${timeoutMs / 1000}s` : e?.message ?? String(e);
        log(`${method} ${path} ✕ no answer after ${Date.now() - started}ms: ${reason}`);
        return { status: 0, data: null };
    } finally {
        clearTimeout(timer);
    }
}

// Faces are keyed by the Supabase user id (the username can change).
async function currentUserId() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new FaceApiError('Your session expired. Sign in again.');
    return session.user.id;
}

const ok = (status: number) => status >= 200 && status < 300;

export const faceApi = {
    /**
     * Registers the user's face from the face scan video (replaces any previous one).
     * `consented` must come from the biometric consent screen.
     */
    async enroll(videoUri: string, consented: boolean) {
        const key = requireKey('POST', '/enroll');
        // Streams the file from disk as multipart (this app's fetch can't take a file uri in
        // FormData). The file is face-scan-<uuid>.mp4: Nimly Face wants a .mp4/.mov name.
        const task = FileSystem.createUploadTask(`${url}/enroll`, videoUri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'video',
            mimeType: 'video/mp4',
            parameters: { user_id: await currentUserId(), consent: String(consented) },
            headers: { 'X-API-Key': key },
        });

        const started = Date.now();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            task.cancelAsync().catch(() => { });
        }, ENROLL_TIMEOUT_MS);
        log(`POST ${url}/enroll → uploading ${videoUri.split('/').pop()}`);

        let result: FileSystem.FileSystemUploadResult | null | undefined;
        try {
            result = await task.uploadAsync();
        } catch (e: any) {
            log(`POST /enroll ✕ no answer after ${Date.now() - started}ms: ${e?.message ?? e}`);
            throw new FaceApiError(UNAVAILABLE);
        } finally {
            clearTimeout(timer);
        }
        if (!result) {
            log(`POST /enroll ✕ ${timedOut ? `timed out after ${ENROLL_TIMEOUT_MS / 1000}s` : 'cancelled'}`);
            throw new FaceApiError(UNAVAILABLE);
        }

        const { status } = result;
        const data = readAnswer('POST', '/enroll', status, result.body, started);
        if (ok(status)) return;
        // Enrollment rejected: the message is already written for the user.
        // (A 422 with a list is a field we sent wrong: a bug, not for the user.)
        if (status === 422 && typeof data?.detail === 'string') throw new FaceApiError(data.detail, true);
        if (status === 413) throw new FaceApiError('El video es muy pesado. Graba uno más corto.', true);
        if (status === 400) throw new FaceApiError('No pudimos leer el video. Graba otra vez.', true);
        throw new FaceApiError(ENROLL_FAILED);
    },

    /**
     * Blurs the faces of every registered Nimly Face user in a photo; strangers stay as they
     * are. Resolves with a new JPEG in the cache: same size and orientation, no EXIF (GPS
     * included). The photo must be JPG/PNG/WebP (not HEIC), up to 25 MB and 120 MP.
     */
    async blurRegisteredFaces(imageUri: string) {
        const key = requireKey('POST', '/identify/image');
        // No `candidates`: every registered user gets blurred, not just a chosen few.
        const form = new FormData();
        form.append('image', new File(imageUri));

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), BLUR_TIMEOUT_MS);
        const started = Date.now();
        log(`POST ${url}/identify/image → sending ${imageUri.split('/').pop()}`);

        let res: Response;
        let image: Uint8Array | null = null;
        try {
            res = await fetch(`${url}/identify/image`, {
                method: 'POST',
                headers: { 'X-API-Key': key },
                body: form,
                signal: controller.signal,
            });
            // 200 is the JPEG itself, not JSON.
            if (res.ok) image = new Uint8Array(await res.arrayBuffer());
        } catch (e: any) {
            const reason = controller.signal.aborted ? `timed out after ${BLUR_TIMEOUT_MS / 1000}s` : e?.message ?? String(e);
            log(`POST /identify/image ✕ no answer after ${Date.now() - started}ms: ${reason}`);
            throw new FaceApiError(BLUR_FAILED);
        } finally {
            clearTimeout(timer);
        }

        if (!image) {
            // 400 unreadable/HEIC/too many MP, 401 key, 413 > 25 MB, 422 no image field.
            readAnswer('POST', '/identify/image', res.status, await res.text().catch(() => ''), started);
            throw new FaceApiError(BLUR_FAILED);
        }
        log(`POST /identify/image ← ${res.status} in ${Date.now() - started}ms · ${Math.round(image.length / 1024)} KB`);

        const blurred = new File(Paths.cache, `blurred-${Date.now()}.jpg`);
        blurred.create();
        blurred.write(image);
        return blurred.uri;
    },

    /**
     * Whether `userId` shows up in the photo (POST /identify). Only that user goes as
     * `candidates`, so the answer can't reveal anyone else who's in it.
     */
    async isUserInPhoto(imageUri: string, userId: string) {
        const form = new FormData();
        form.append('image', new File(imageUri));
        form.append('candidates', userId);

        const { status, data } = await request('/identify', { method: 'POST', body: form }, IDENTIFY_TIMEOUT_MS);
        if (!ok(status)) throw new FaceApiError("Couldn't check who is in the photo");
        return Array.isArray(data?.matched_users) && data.matched_users.includes(userId);
    },

    /** Deletes the user's face. Succeeds too if they never registered one (404). */
    async remove() {
        const userId = await currentUserId();
        const { status } = await request(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }, DELETE_TIMEOUT_MS);
        if (ok(status) || status === 404) return;
        throw new FaceApiError(DELETE_FAILED);
    },
};
