import { supabase } from '@/lib/supabase';
import { clearChatMessageCache } from '@/utils/chatMessageCache';
import {
    identityRotation,
    OWNER_ID_STORE,
    PRIVATE_KEY_STORE,
    purgeSharedSecrets,
    purgeVaultRAM,
    vaultIdentity,
    VaultIdentityState,
} from '@/utils/crypto';
import { useAppForeground } from '@/hooks/useAppForeground';
import { clearMediaCache } from '@/utils/mediaCache';
import { vaultPasscode } from '@/utils/vaultPasscode';
import * as Sentry from '@sentry/react-native';
import { Session } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

// 'device_locked'   → the account is already active on ANOTHER device.
// 'needs_passcode'  → there's a usable identity here but the 6-digit PIN is
//                     missing on THIS device (first login / takeover with password).
// 'locked_timeout'  → there's a PIN, but >12h have passed since the last unlock.
export type VaultState = 'loading' | 'device_locked' | 'needs_passcode' | 'locked_timeout' | VaultIdentityState;

export type PasscodeResult = { ok: true } | { ok: false; message: string };

/** How often the app asks for the passcode again. */
const AUTO_LOCK_MS = 12 * 60 * 60 * 1000;

const DEVICE_ID_STORE = 'nimly_device_id';

/**
 * Stable identifier for this device: a UUID generated ONCE and stored in the
 * Keychain. Don't use anything derived from Device.* (model, name, OS build):
 * `osInternalBuildId` in particular is the iOS build, not the hardware's — it
 * changes only with each system update, and that was locking out legitimate
 * devices.
 */
const getDeviceId = async (): Promise<string> => {
    let id = await SecureStore.getItemAsync(DEVICE_ID_STORE);
    if (!id) {
        id = randomUUID();
        await SecureStore.setItemAsync(DEVICE_ID_STORE, id);
    }
    return id;
};

export function useVaultSecurity() {
    const [vaultState, setVaultState] = useState<VaultState>('loading');

    // Prevents checkSession and onAuthStateChange from running setup at the same time.
    const setupInFlight = useRef<Promise<VaultState> | null>(null);
    // Realtime channel that watches for anyone else claiming the account.
    const securityChannelRef = useRef<any>(null);
    // userId whose "device lock" we hold (to release it on sign-out).
    const ownedUserIdRef = useRef<string | null>(null);
    // Prevents a runSetup triggered by the re-login's SIGNED_IN from stepping on
    // an in-progress "force takeover".
    const takeoverInFlightRef = useRef(false);

    const handleRemoteTakeover = async () => {
        Alert.alert(
            'Signed out',
            'Your account is now active on another device. Nimly can only be used on one device at a time.'
        );
        await supabase.auth.signOut();
    };

    const watchForTakeover = (userId: string, myDeviceId: string) => {
        const channelName = `security_check_${userId}`;
        supabase.removeChannel(supabase.channel(channelName));

        return supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
                (payload) => {
                    const latest = payload.new.current_device_id;
                    if (latest && latest !== myDeviceId) handleRemoteTakeover();
                }
            )
            .subscribe();
    };

    /** Marks this device as the account's active one and watches for changes. */
    const claimDevice = async (userId: string) => {
        const myDeviceId = await getDeviceId();
        try {
            await supabase.from('profiles').update({ current_device_id: myDeviceId }).eq('id', userId);
            ownedUserIdRef.current = userId;

            if (securityChannelRef.current) {
                await supabase.removeChannel(securityChannelRef.current);
            }
            securityChannelRef.current = watchForTakeover(userId, myDeviceId);
        } catch (e) {
            console.error('claimDevice failed:', e);
        }
    };

    /** Releases the server lock ONLY if it's still ours (avoids stepping on another device). */
    const releaseDevice = async () => {
        const userId = ownedUserIdRef.current;
        ownedUserIdRef.current = null;
        if (securityChannelRef.current) {
            await supabase.removeChannel(securityChannelRef.current);
            securityChannelRef.current = null;
        }
        if (!userId) return;
        try {
            await supabase
                .from('profiles')
                .update({ current_device_id: null })
                .eq('id', userId)
                .eq('current_device_id', await getDeviceId());
        } catch (e) {
            console.error('releaseDevice failed:', e);
        }
    };

    useEffect(() => {
        return () => {
            if (securityChannelRef.current) supabase.removeChannel(securityChannelRef.current);
        };
    }, []);

    /**
     * Vault usable here → 'ready', unless:
     *  - the local PIN is missing on this device → 'needs_passcode'
     *  - >12h have passed since the last unlock → 'locked_timeout'
     * All local: no network needed.
     */
    const finishReady = async (): Promise<VaultState> => {
        let next: VaultState = 'ready';
        try {
            if (!(await vaultPasscode.hasLocal())) {
                next = 'needs_passcode';
            } else {
                const last = await vaultPasscode.lastUnlockAt();
                if (!last || Date.now() - last > AUTO_LOCK_MS) next = 'locked_timeout';
            }
        } catch { /* when in doubt, let it through */ }
        setVaultState(next);
        return next;
    };

    const runSetup = useCallback(async (userSession: Session | null): Promise<VaultState> => {
        if (!userSession?.user) return 'loading';
        if (takeoverInFlightRef.current) return 'loading';
        const currentUserId = userSession.user.id;

        try {
            const storedOwnerId = await SecureStore.getItemAsync(OWNER_ID_STORE);
            let localPrivateKey = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);

            // Account switch: the previous user's keys don't work here.
            if (storedOwnerId && storedOwnerId !== currentUserId) {
                await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
                await identityRotation.clear();
                localPrivateKey = null;
            }

            // We already have THIS user's private key on THIS device: that's
            // already proof of legitimacy. We claim it directly, without comparing
            // against the fingerprint stored on the server — that fingerprint may
            // have gone stale (e.g. something in the system changed) and it
            // shouldn't be able to block a device that already has the right keys.
            if (localPrivateKey && storedOwnerId === currentUserId) {
                await SecureStore.setItemAsync(OWNER_ID_STORE, currentUserId);
                await claimDevice(currentUserId);
                return finishReady();
            }

            // No local key: it does matter which device the server says has the account.
            const myDeviceId = await getDeviceId();
            const { data: profile } = await supabase
                .from('profiles')
                .select('current_device_id, public_key')
                .eq('id', currentUserId)
                .maybeSingle();

            const lockedTo = profile?.current_device_id ?? null;
            const heldByAnotherDevice = !!lockedTo && lockedTo !== myDeviceId;

            // HARD LOCK: another device has the account.
            if (heldByAnotherDevice) {
                setVaultState('device_locked');
                return 'device_locked';
            }

            // Free, but did the server already have an identity?
            if (profile?.public_key) {
                // Legitimate migration (the other device signed out / was lost):
                // requires explicit confirmation because history is lost.
                setVaultState('needs_new_identity');
                return 'needs_new_identity';
            }

            // First identity for the account.
            await vaultIdentity.generateIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, currentUserId);
            await claimDevice(currentUserId);
            return finishReady();
        } catch (error) {
            console.error('Vault Initialization Error:', error);
            Sentry.captureException(error, { tags: { area: 'vault-init' } });
            setVaultState('needs_new_identity');
            return 'needs_new_identity';
        }
    }, []);

    const setupVaultIdentity = useCallback((userSession: Session | null): Promise<VaultState> => {
        if (!userSession?.user) return Promise.resolve<VaultState>('loading');
        if (setupInFlight.current) return setupInFlight.current;
        const p = runSetup(userSession).finally(() => { setupInFlight.current = null; });
        setupInFlight.current = p;
        return p;
    }, [runSetup]);

    /**
     * Migration: device without keys and a free account. Creates a new identity
     * (the previous encrypted history becomes unreadable) and claims the device.
     */
    const confirmNewIdentity = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        await vaultIdentity.createFreshIdentity();
        if (user) {
            await SecureStore.setItemAsync(OWNER_ID_STORE, user.id);
            await claimDevice(user.id);
        }
        await finishReady();
    }, []);

    /** Creates the 6-digit PIN (server + local) and unlocks the app. */
    const createPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter 6 digits.' };
        try {
            await vaultPasscode.setRemote(code);
            await vaultPasscode.saveLocal(code);
            await vaultPasscode.touchUnlock();
            setVaultState('ready');
            return { ok: true };
        } catch (e) {
            console.error('createPasscode failed:', e);
            return { ok: false, message: 'Could not save your passcode. Check your connection.' };
        }
    }, []);

    /** Periodic unlock (12h): validated against the LOCAL hash, no network. */
    const unlockWithPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter 6 digits.' };
        const ok = await vaultPasscode.verifyLocal(code);
        if (!ok) return { ok: false, message: 'Wrong passcode.' };
        await vaultPasscode.touchUnlock();
        setVaultState('ready');
        return { ok: true };
    }, []);

    // Shared core: releases the server lock and takes control here with a NEW
    // identity (the previous encrypted history becomes unreadable).
    // If `localPasscode` is given, it's saved for the auto-lock before resolving.
    const doTakeover = async (userId: string, localPasscode?: string): Promise<PasscodeResult> => {
        takeoverInFlightRef.current = true;
        try {
            await supabase.from('profiles').update({ current_device_id: null }).eq('id', userId);
            await vaultIdentity.createFreshIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, userId);
            await claimDevice(userId);
            if (localPasscode) {
                await vaultPasscode.saveLocal(localPasscode);
                await vaultPasscode.touchUnlock();
            }
            await finishReady();
            return { ok: true };
        } catch (e) {
            console.error('doTakeover failed:', e);
            Sentry.captureException(e, { tags: { area: 'vault-takeover' } });
            return { ok: false, message: 'Could not set up this device. Check your connection and try again.' };
        } finally {
            takeoverInFlightRef.current = false;
        }
    };

    /** Takeover with the 6-digit PIN (main path). */
    const takeoverWithPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, message: 'Could not verify your account.' };

        const res = await vaultPasscode.verifyRemote(code);
        if (!res.ok) {
            if (res.reason === 'no_passcode') return { ok: false, message: 'No passcode set. Use your account password instead.' };
            if (res.reason === 'locked') return { ok: false, message: 'Too many attempts. Try again in 15 minutes.' };
            if (res.reason === 'wrong') return { ok: false, message: `Wrong passcode. ${res.attemptsLeft} attempt(s) left.` };
            return { ok: false, message: 'Could not check your passcode. Check your connection.' };
        }

        return doTakeover(user.id, code);
    }, []);

    /** Fallback: takeover with the account password ("I forgot my passcode"). */
    const forceTakeover = useCallback(async (password: string): Promise<PasscodeResult> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return { ok: false, message: 'Could not verify your account.' };

        const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
        if (authError) return { ok: false, message: 'Incorrect password.' };

        return doTakeover(user.id);
    }, []);

    const purgeVaultData = async () => {
        if (__DEV__) console.log('Vault: signed out, purging local security keys');
        await releaseDevice();
        await SecureStore.deleteItemAsync('nymly_vault_seed');
        await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
        await SecureStore.deleteItemAsync(OWNER_ID_STORE);
        await identityRotation.clear();
        await vaultPasscode.clearLocal();
        purgeVaultRAM();
        purgeSharedSecrets();
        await clearChatMessageCache();
        await clearMediaCache();
        setVaultState('loading');
    };

    // Auto-lock: when returning to the foreground, if the vault was ready and
    // >12h have passed since the last unlock, require the PIN again.
    useAppForeground(() => {
        if (vaultState !== 'ready') return;
        (async () => {
            const last = await vaultPasscode.lastUnlockAt();
            if (!last || Date.now() - last > AUTO_LOCK_MS) {
                if (await vaultPasscode.hasLocal()) setVaultState('locked_timeout');
            }
        })();
    });

    return {
        vaultState,
        setupVaultIdentity,
        confirmNewIdentity,
        createPasscode,
        unlockWithPasscode,
        takeoverWithPasscode,
        forceTakeover,
        purgeVaultData,
    };
}
