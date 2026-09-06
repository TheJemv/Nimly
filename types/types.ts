export type PostType = "IMAGE" | "TEXT" | "VIDEO";

export interface User {
    id: string; // UUID de auth.users / public.profiles
    username: string;
    avatar_url: string | null;
    avatar_config?: any; // jsonb
    description: string | null;
    current_device_id?: string | null;
    expo_push_token?: string | null;
    public_key?: string | null;
    created_at: string;

    // Relaciones opcionales (se llenan al consultar)
    friends?: Friend[];
    friend_requests?: Request[];
}

export interface Friend {
    id: string;
    user_id: string; // 👈 Corregido de user_id_1
    friend_id: string; // 👈 Corregido de user_id_2
    created_at: string;

    // El objeto del amigo tras el join
    friend_profile?: User;
}

export interface Request {
    id: string;
    from_id: string;
    to_id: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    created_at: string;

    // Quién envió la solicitud
    sender?: User;
}

export interface Post {
    id: string;
    user_id: string;
    type: PostType;
    content: string | null;
    media_url: string | null; // 👈 Agregado de tu DB
    created_at: string;

    // Streaming HLS (media API self-hosted). El transcode corre en el backend:
    // 'raw' recién subido -> 'ready' (sirve HLS) | 'error' (se queda en MP4).
    playback_status?: 'raw' | 'ready' | 'error';
    hls_path?: string | null;

    // Relaciones (Cargadas mediante joins)
    author?: User;
    likes?: Like[];
    comments?: Comment[];

    // Campos calculados (conteo)
    likes_count?: number;
    comments_count?: number;
}

export interface Like {
    id: string;
    user_id: string;
    post_id: string;
    created_at: string;

    // Usuario que dio like
    user?: User;
}

export interface Comment {
    id: string;
    user_id: string;
    post_id: string;
    content: string;
    created_at: string;

    // Usuario que comentó
    author?: User;
}

export interface Chat {
    id: string;
    created_at: string;

    // Relaciones para mensajería
    messages?: Message[];
    participants?: User[]; // Usuarios en el chat (Muchos a Muchos)
    last_message?: Message; // El último mensaje enviado
}

export interface Message {
    id: string;
    chat_id: string;
    sender_id: string;
    receiver_id: string | null; // 👈 Agregado de tu DB
    content: string | null;
    image_url: string | null; // 👈 Agregado de tu DB
    type: string; // En DB es un enum 'message_content_type'
    is_read: boolean;
    
    // 👈 Agregados campos de Cifrado y Respuestas de tu DB
    encryption_iv?: string | null;
    encryption_tag?: string | null;
    reply_to_id?: string | null;
    reply_to_story_id?: string | null;
    
    created_at: string;

    // Quién envió el mensaje
    sender?: User;
}

export interface ViewerProfile {
    user_id: string;
    username: string;
    avatar_url: string | null;
    avatar_config?: any;
    has_liked?: boolean;
    reaction?: string;
    viewed_at?: string;
}

export interface Story {
    id: string;
    user_id: string; // 👈 Faltaba tu DB
    media_url: string;
    media_type: "image" | "video"; // 👈 Obligatorio según DB
    is_view_once: boolean; // 👈 Corregido de tu DB
    created_at: string;

    // Streaming HLS (mismo pipeline que los posts). 'ready' -> sirve HLS.
    playback_status?: 'raw' | 'ready' | 'error';
    hls_path?: string | null;

    // Virtuales (Cargados desde la UI o Funciones SQL)
    is_seen_by_me?: boolean;
    is_liked_by_me?: boolean;
    views_count?: number;

    viewers?: ViewerProfile[];
    likes?: any[];
}

export interface StoryGroup {
    user_id: string;
    username: string;
    avatar_config?: any;
    is_me: boolean;

    stories: Story[];
}