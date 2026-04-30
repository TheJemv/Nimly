// constants/currentUser.ts
import { Post } from '@/types/post';

export const CURRENT_USER = {
    id: 'user_001',
    username: '@thebbc',
    displayName: 'BBC',
    isOnline: true,
    friendsCount: 150,
    bio: 'Just a regular person who loves coding and coffee. ☕️💻',
    avatar: `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 112 112\" fill=\"none\" shape-rendering=\"auto\"><metadata xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\"><rdf:RDF><rdf:Description><dc:title>Avataaars</dc:title><dc:creator>Pablo Stanley</dc:creator><dc:source xsi:type=\"dcterms:URI\">https://avataaars.com/</dc:source><dcterms:license xsi:type=\"dcterms:URI\">https://avataaars.com/</dcterms:license><dc:rights>Remix of „Avataaars” (https://avataaars.com/) by „Pablo Stanley”, licensed under „Free for personal and commercial use.” (https://avataaars.com/)</dc:rights></rdf:Description></rdf:RDF></metadata><mask id=\"viewboxMask\"><rect width=\"112\" height=\"112\" rx=\"0\" ry=\"0\" x=\"0\" y=\"0\" fill=\"#fff\" /></mask><g mask=\"url(#viewboxMask)\"><rect fill=\"#76C2D9\" width=\"112\" height=\"112\" x=\"0\" y=\"0\" /><g transform=\"translate(2 63)\"><rect x=\"22\" y=\"7\" width=\"64\" height=\"26\" rx=\"13\" fill=\"#000\" fill-opacity=\".6\"/><rect x=\"24\" y=\"9\" width=\"60\" height=\"22\" rx=\"11\" fill=\"#fff\"/><path d=\"M24.18 18H32V9.41A11 11 0 0 1 35 9h1v9h9V9h4v9h9V9h4v9h9V9h2c.68 0 1.35.06 2 .18V18h8.82l.05.28v3.44l-.05.28H75v8.82c-.65.12-1.32.18-2 .18h-2v-9h-9v9h-4v-9h-9v9h-4v-9h-9v9h-1a11 11 0 0 1-3-.41V22h-7.82a11.06 11.06 0 0 1 0-4Z\" fill=\"#E6E6E6\"/></g><g transform=\"translate(28 51)\"><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M16 8c0 4.42 5.37 8 12 8s12-3.58 12-8\" fill=\"#000\" fill-opacity=\".16\"/></g><g transform=\"translate(0 19)\"><path d=\"M44 22a14 14 0 1 1-28 0 14 14 0 0 1 28 0ZM96 22a14 14 0 1 1-28 0 14 14 0 0 1 28 0Z\" fill=\"#fff\"/><path d=\"M36 22a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM88 22a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z\" fill=\"#000\" fill-opacity=\".7\"/></g><g transform=\"translate(0 11)\"><path d=\"m31.23 20.42-.9.4c-5.25 2.09-13.2 1.21-18.05-1.12-.57-.27-.18-1.15.4-1.1 14.92 1.14 24.96-8.15 28.37-14.45.1-.18.41-.2.49-.03 2.3 5.32-4.45 13.98-10.3 16.3ZM80.77 20.42l.9.4c5.25 2.09 13.2 1.21 18.05-1.12.57-.27.18-1.15-.4-1.1-14.92 1.14-24.96-8.15-28.37-14.45-.1-.18-.41-.2-.49-.03-2.3 5.32 4.45 13.98 10.3 16.3Z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"#000\" fill-opacity=\".6\"/></g></g></svg`,
    posts: [
        {
            id: 'my_1',
            user: 'BBC',
            time: 'Posted · 1h ago',
            avatar: 'https://i.pravatar.cc/150?img=3',
            text: 'Working on something exciting today! 🔥',
            likes: '1.2k',
            comments: '34',
            shares: '8',
            image: null,
        },
        {
            id: 'my_2',
            user: 'BBC',
            time: 'Posted · 3d ago',
            avatar: 'https://i.pravatar.cc/150?img=3',
            text: '',
            likes: '5.6k',
            comments: '89',
            shares: '21',
            image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
        },
        {
            id: 'my_3',
            user: 'BBC',
            time: 'Posted · 1w ago',
            avatar: 'https://i.pravatar.cc/150?img=3',
            text: 'Just hit 150 friends on this app. Thanks for the love! 🙏',
            likes: '890',
            comments: '12',
            shares: '5',
            image: null,
        },
    ] satisfies Post[],
};