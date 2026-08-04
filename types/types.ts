export type PostType = "IMAGE" | "TEXT";

export interface User {
    id: string; // UUID de auth.users / public.profiles
    username: string;
    avatar_url: string;
    description: string;
    created_at: string;

    // Relaciones opcionales (se llenan al consultar)
    friends?: Friend[];
    friend_requests?: Request[];
}

export interface Friend {
    id: string;
    user_id_1: string;
    user_id_2: string;
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
    content: string;
    created_at: string;

    // Relaciones (Cargadas mediante .select('*, author:profiles(*), likes(*), comments(*)'))
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
    content: string;
    created_at: string;
    is_read: boolean;

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
    media_url: string;
    media_type?: "image" | "video";
    created_at: string;
    is_seen_by_me?: boolean;
    is_liked_by_me?: boolean;
    views_count?: number;
    is_view_once?: boolean;
    viewers?: ViewerProfile[];
}

export interface StoryGroup {
    user_id: string;
    username: string;
    avatar_url: string | null;
    avatar_config?: any;
    is_me: boolean;
    stories: Story[];
}
