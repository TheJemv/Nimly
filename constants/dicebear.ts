import * as adventurer from '@dicebear/adventurer';
import * as adventurerNeutral from '@dicebear/adventurer-neutral';
import * as avataaars from '@dicebear/avataaars';
import * as avataaarsNeutral from '@dicebear/avataaars-neutral';
import * as bigEarsNeutral from '@dicebear/big-ears-neutral';
import * as bigSmile from '@dicebear/big-smile';
import * as bottts from '@dicebear/bottts';
import * as botttsNeutral from '@dicebear/bottts-neutral';
import * as croodles from '@dicebear/croodles';
import * as croodlesNeutral from '@dicebear/croodles-neutral';
import * as dylan from '@dicebear/dylan';
import * as funEmoji from '@dicebear/fun-emoji';
import * as lorelei from '@dicebear/lorelei';
import * as loreleiNeutral from '@dicebear/lorelei-neutral';
import * as micah from '@dicebear/micah';
import * as miniavs from '@dicebear/miniavs';
import * as notionists from '@dicebear/notionists';
import * as notionistsNeutral from '@dicebear/notionists-neutral';
import * as openPeeps from '@dicebear/open-peeps';
import * as personas from '@dicebear/personas';
import * as pixelArt from '@dicebear/pixel-art';
import * as pixelArtNeutral from '@dicebear/pixel-art-neutral';

export const COLORES_FONDO = ["DC143C", "D27D46", "76C2D9", "E5A0A0", "B2A4D4", "94C9A9", "E6C975", "161616"];

/**
 * Avatar por defecto derivado del username. Debe coincidir con lo que genera el
 * trigger `handle_new_user_profile` en la base de datos, para que un perfil
 * creado por el trigger y uno reparado desde el cliente se vean idénticos.
 */
export const DEFAULT_AVATAR_STYLE_ID = "adventurer";
export const DEFAULT_AVATAR_BG = "b6e3f4";

export function buildDefaultAvatarConfig(username: string) {
    const seed = (username || "user").trim() || "user";
    return {
        styleId: DEFAULT_AVATAR_STYLE_ID,
        options: {
            seed,
            backgroundColor: [DEFAULT_AVATAR_BG],
        },
    };
}

export function buildDefaultAvatarUrl(username: string) {
    const seed = encodeURIComponent((username || "user").trim() || "user");
    return `https://api.dicebear.com/7.x/${DEFAULT_AVATAR_STYLE_ID}/svg?seed=${seed}&backgroundColor=${DEFAULT_AVATAR_BG}`;
}

export const ESTILOS_DICEBEAR = [
    { id: "adventurer", name: "Adventurer", collection: adventurer },
    { id: "adventurerNeutral", name: "Adventurer N", collection: adventurerNeutral },
    { id: "avataaars", name: "Avataaars", collection: avataaars },
    { id: "avataaarsNeutral", name: "Avataaars N", collection: avataaarsNeutral },
    { id: "bigEarsNeutral", name: "Big Ears N", collection: bigEarsNeutral },
    { id: "bigSmile", name: "Big Smile", collection: bigSmile },
    { id: "bottts", name: "Bottts", collection: bottts },
    { id: "botttsNeutral", name: "Bottts N", collection: botttsNeutral },
    { id: "croodles", name: "Croodles", collection: croodles },
    { id: "croodlesNeutral", name: "Croodles N", collection: croodlesNeutral },
    { id: "dylan", name: "Dylan", collection: dylan },
    { id: "funEmoji", name: "Fun Emoji", collection: funEmoji },
    { id: "lorelei", name: "Lorelei", collection: lorelei },
    { id: "loreleiNeutral", name: "Lorelei N", collection: loreleiNeutral },
    { id: "micah", name: "Micah", collection: micah },
    { id: "miniavs", name: "Miniavs", collection: miniavs },
    { id: "notionists", name: "Notionists", collection: notionists },
    { id: "notionistsNeutral", name: "Notionists N", collection: notionistsNeutral },
    { id: "openPeeps", name: "Open Peeps", collection: openPeeps },
    { id: "personas", name: "Personas", collection: personas },
    { id: "pixelArt", name: "Pixel Art", collection: pixelArt },
    { id: "pixelArtNeutral", name: "Pixel Art N", collection: pixelArtNeutral },
];