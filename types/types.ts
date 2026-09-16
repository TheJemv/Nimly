export type PostType = "IMAGE" | "TEXT" | "VIDEO";

export interface User {
    id: string; // UUID from auth.users / public.profiles
    username: string;
    avatar_url: string | null;
    avatar_config?: any; // jsonb
    description: string | null;
    current_device_id?: string | null;
    expo_push_token?: string | null;
    public_key?: string | null;
    created_at: string;

    // Optional relations (populated when queried)
    friends?: Friend[];
    friend_requests?: Request[];
}

export interface Friend {
    id: string;
    user_id: string; // 👈 Corrected from user_id_1
    friend_id: string; // 👈 Corrected from user_id_2
    created_at: string;

    // The friend's object after the join
    friend_profile?: User;
}

export interface Request {
    id: string;
    from_id: string;
    to_id: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    created_at: string;

    // Who sent the request
    sender?: User;
}

export interface Post {
    id: string;
    user_id: string;
    type: PostType;
    content: string | null;
    media_url: string | null; // 👈 Added from your DB
    created_at: string;

    // HLS streaming (self-hosted media API). Transcoding runs on the backend:
    // 'raw' just uploaded -> 'ready' (serves HLS) | 'error' (stays on MP4).
    playback_status?: 'raw' | 'ready' | 'error';
    hls_path?: string | null;

    // Relations (loaded via joins)
    author?: User;
    likes?: Like[];
    comments?: Comment[];

    // Calculated fields (counts)
    likes_count?: number;
    comments_count?: number;
}

export interface Like {
    id: string;
    user_id: string;
    post_id: string;
    created_at: string;

    // User who liked it
    user?: User;
}

export interface Comment {
    id: string;
    user_id: string;
    post_id: string;
    content: string;
    created_at: string;

    // User who commented
    author?: User;
}

export interface Chat {
    id: string;
    created_at: string;

    // Relations for messaging
    messages?: Message[];
    participants?: User[]; // Users in the chat (Many to Many)
    last_message?: Message; // The last message sent
}

export interface Message {
    id: string;
    chat_id: string;
    sender_id: string;
    receiver_id: string | null; // 👈 Added from your DB
    content: string | null;
    image_url: string | null; // 👈 Added from your DB
    type: string; // In the DB this is a 'message_content_type' enum
    is_read: boolean;

    // 👈 Added encryption and reply fields from your DB
    encryption_iv?: string | null;
    encryption_tag?: string | null;
    reply_to_id?: string | null;
    reply_to_story_id?: string | null;
    
    created_at: string;

    // Who sent the message
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
    user_id: string; // 👈 Was missing from your DB
    media_url: string;
    /** Bare path inside the 'stories' bucket. Resolved to `file://` in the
     *  viewer via the disk cache (mediaCache). See api/stories.ts. */
    media_path?: string;
    media_type: "image" | "video"; // 👈 Required per the DB
    is_view_once: boolean; // 👈 Corrected from your DB
    created_at: string;

    // HLS streaming (same pipeline as posts). 'ready' -> serves HLS.
    playback_status?: 'raw' | 'ready' | 'error';
    hls_path?: string | null;

    // Virtual fields (loaded from the UI or SQL functions)
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