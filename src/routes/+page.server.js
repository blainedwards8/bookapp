import { redirect, fail } from '@sveltejs/kit';

// Looks up a book by title; creates it if it doesn't exist. Returns the book ID.
async function findOrCreateBook(pb, title) {
    const trimmed = title?.trim();
    if (!trimmed) throw new Error('Book title is required');
    try {
        const existing = await pb.collection('book').getFirstListItem(`title="${trimmed.replace(/"/g, '\\"')}"`);
        return existing.id;
    } catch {
        // Not found — create it
        const created = await pb.collection('book').create({ title: trimmed });
        return created.id;
    }
}

// Helper for calling Ollama with exponential backoff
async function callOllama(prompt) {
    const url = `https://ai.a13.in/api/generate`;
    const payload = { model: "llama3", prompt: prompt, stream: false };

    let delay = 1000;
    for (let i = 0; i < 5; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Ollama request failed');
            const result = await response.json();
            return result.response;
        } catch (e) {
            if (i === 4) throw e;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

export const load = async ({ locals }) => {
    // If user is not logged in, redirect to login
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    try {
        const stories = await locals.pb.collection('story').getFullList({
            sort: 'created',
            expand: 'book'
        });

        // Normalize: surface the expanded book title as a flat `book_title` field
        // so the frontend can use `story.book_title` directly.
        const normalized = stories.map(s => ({
            ...s,
            book_title: s.expand?.book?.title ?? s.book_title ?? 'Unknown Book',
            page_number: s.page ?? s.page_number ?? 0
        }));
        
        return {
            stories: JSON.parse(JSON.stringify(normalized)),
            user: locals.user
        };
    } catch (e) {
        console.error("Failed to load stories:", e);
        return { stories: [], user: locals.user };
    }
};

export const actions = {
    logout: async ({ locals }) => {
        locals.pb.authStore.clear();
        throw redirect(303, '/login');
    },

    create: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const data = await request.formData();
        try {
            const bookId = await findOrCreateBook(locals.pb, data.get('book_title'));
            const tagsRaw = data.get('tags') ?? '';
            await locals.pb.collection('story').create({
                book: bookId,
                title: data.get('title'),
                author: data.get('author'),
                page: parseInt(data.get('page_number')) || 0,
                summary: data.get('summary'),
                tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
            });
            return { success: true };
        } catch (e) {
            console.error('Create failed:', e);
            return fail(422, { error: e.message });
        }
    },

    import: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const data = await request.formData();
        const raw = data.get('json_data');

        let stories;
        try {
            stories = JSON.parse(raw);
        } catch {
            return fail(422, { error: 'Invalid JSON. Please paste a valid JSON array.' });
        }

        if (!Array.isArray(stories)) {
            return fail(422, { error: 'JSON must be an array of story objects.' });
        }

        // Cache book lookups within a single import to avoid redundant DB calls
        const bookCache = {};
        let created = 0;
        const errors = [];

        for (const s of stories) {
            try {
                const bookTitle = s.book_title?.trim();
                if (!bookCache[bookTitle]) {
                    bookCache[bookTitle] = await findOrCreateBook(locals.pb, bookTitle);
                }
                const bookId = bookCache[bookTitle];

                const tagsRaw = s.tags;
                const tags = Array.isArray(tagsRaw)
                    ? tagsRaw.map(t => String(t).trim()).filter(Boolean)
                    : (typeof tagsRaw === 'string' ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []);

                await locals.pb.collection('story').create({
                    book: bookId,
                    title: s.title,
                    author: s.author ?? '',
                    page: parseInt(s.page_number ?? s.page) || 0,
                    summary: s.summary ?? '',
                    tags
                });
                created++;
            } catch (e) {
                errors.push(`"${s.title ?? 'unknown'}": ${e.message}`);
            }
        }

        if (errors.length) {
            console.error('Import errors:', errors);
            return { success: true, created, errors };
        }
        return { success: true, created };
    },

    update: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const data = await request.formData();
        const id = data.get('id');
        const bookTitle = data.get('book_title');

        const payload = {
            title: data.get('title'),
            author: data.get('author'),
            page: parseInt(data.get('page_number')) || 0,
            summary: data.get('summary'),
            content: data.get('content') ?? '',
            tags: data.get('tags').split(',').map(t => t.trim()).filter(Boolean)
        };

        // Resolve book relation if book_title was provided in the form
        if (bookTitle?.trim()) {
            payload.book = await findOrCreateBook(locals.pb, bookTitle);
        }

        console.log('[update] payload:', JSON.stringify(payload, null, 2));

        try {
            await locals.pb.collection('story').update(id, payload);
        } catch (e) {
            // Log the full PocketBase validation details so we can see the exact field failing
            console.error('[update] PocketBase error status:', e.status);
            console.error('[update] PocketBase error data:', JSON.stringify(e.data, null, 2));
            console.error('[update] PocketBase response:', JSON.stringify(e.response, null, 2));
            throw e;
        }

        return { success: true };
    },



    delete: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        const data = await request.formData();
        await locals.pb.collection('story').delete(data.get('id'));
        return { success: true };
    },

    generateSummary: async ({ request, locals }) => {
        if (!locals.user) return { success: false, error: "Unauthorized" };
        const data = await request.formData();
        const prompt = `Provide a short summary for "${data.get('title')}" by ${data.get('author')}.`;

        try {
            const summary = await callOllama(prompt);
            return { success: true, summary: summary.trim() };
        } catch (e) {
            return { success: false, error: "AI generation failed." };
        }
    }
};