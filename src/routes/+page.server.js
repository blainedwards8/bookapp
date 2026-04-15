import { redirect, fail } from '@sveltejs/kit';
import { aiQueue } from '$lib/server/aiQueue';
import { callOllama } from '$lib/server/ai';

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

export const load = async ({ locals, url }) => {
    // If user is not logged in, redirect to login
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    const page = parseInt(url.searchParams.get('page')) || 1;
    const perPage = parseInt(url.searchParams.get('perPage')) || 25;
    const search = url.searchParams.get('search') || '';
    const bookFilter = url.searchParams.get('book') || 'All Books';

    try {
        let filter = '';
        if (search) {
            const cleanSearch = search.replace(/"/g, '\\"');
            filter = `(title ~ "${cleanSearch}" || author ~ "${cleanSearch}" || summary ~ "${cleanSearch}" || tags ~ "${cleanSearch}")`;
        }

        if (bookFilter !== 'All Books') {
            const cleanBook = bookFilter.replace(/"/g, '\\"');
            const bFilter = `book.title = "${cleanBook}"`;
            filter = filter ? `(${filter}) && ${bFilter}` : bFilter;
        }

        const result = await locals.pb.collection('story').getList(page, perPage, {
            sort: 'created',
            expand: 'book',
            filter: filter
        });

        const books = await locals.pb.collection('book').getFullList({
            sort: 'title'
        });

        // Normalize: surface the expanded book title as a flat `book_title` field
        const normalized = result.items.map(s => ({
            ...s,
            book_title: s.expand?.book?.title ?? s.book_title ?? 'Unknown Book',
            page_number: s.page ?? s.page_number ?? 0
        }));
        
        return {
            stories: JSON.parse(JSON.stringify(normalized)),
            books: JSON.parse(JSON.stringify(books)),
            pagination: {
                page: result.page,
                perPage: result.perPage,
                totalItems: result.totalItems,
                totalPages: result.totalPages
            },
            search,
            selectedBook: bookFilter,
            user: locals.user
        };
    } catch (e) {
        console.error("Failed to load stories:", e);
        return { 
            stories: [], 
            books: [],
            pagination: { page: 1, perPage, totalItems: 0, totalPages: 0 },
            search,
            selectedBook: bookFilter,
            user: locals.user 
        };
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
            const title = data.get('title');
            const author = data.get('author');
            const summary = data.get('summary');
            const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

            // Create story with queued flag true
            const story = await locals.pb.collection('story').create({
                book: bookId,
                title,
                author,
                page: parseInt(data.get('page_number')) || 0,
                summary,
                tags,
                queued: true
            });

            // Enqueue summary generation
            aiQueue.push({
                storyId: story.id,
                title,
                author,
                content: '' // New stories don't have content yet in the add form
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

        if (!id) {
            return fail(400, { error: 'Missing story ID' });
        }

        const tagsRaw = data.get('tags') ?? '';
        const payload = {
            title: data.get('title'),
            author: data.get('author'),
            page: parseInt(data.get('page_number')) || 0,
            summary: data.get('summary'),
            content: data.get('content') ?? '',
            tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
        };

        try {
            // Resolve book relation if book_title was provided in the form
            if (bookTitle?.trim()) {
                payload.book = await findOrCreateBook(locals.pb, bookTitle);
            }

            await locals.pb.collection('story').update(id, payload);
            return { success: true };
        } catch (e) {
            console.error('[update] Failure:', e.status, JSON.stringify(e.data, null, 2));
            return fail(e.status || 400, { 
                error: e.message || 'Failed to update record',
                details: e.data || null 
            });
        }
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
        const storyId = data.get('id');
        const title = data.get('title');
        const author = data.get('author');
        const content = data.get('content') || '';

        if (!storyId) return fail(400, { error: "Missing story ID" });

        try {
            // Update story to show it's queued
            await locals.pb.collection('story').update(storyId, { queued: true });

            // Enqueue task
            aiQueue.push({ storyId, title, author, content });

            return { success: true, queued: true };
        } catch (e) {
            console.error('[generateSummary] Failed:', e);
            return fail(500, { error: "Failed to enqueue task" });
        }
    },

    bulkGenerate: async ({ locals }) => {
        if (!locals.user) return { success: false, error: "Unauthorized" };
        
        try {
            // Fetch stories that don't have a summary and aren't already queued
            // Need to filter locally if PocketBase doesn't support complex empty/null checks easily
            const stories = await locals.pb.collection('story').getFullList({
                filter: 'summary = "" && queued = false',
                expand: 'book'
            });

            for (const story of stories) {
                // Mark as queued
                await locals.pb.collection('story').update(story.id, { queued: true });
                
                // Enqueue
                aiQueue.push({
                    storyId: story.id,
                    title: story.title,
                    author: story.author,
                    content: story.content || ''
                });
            }

            return { success: true, count: stories.length };
        } catch (e) {
            console.error('[bulkGenerate] Failed:', e);
            return fail(500, { error: e.message });
        }
    }
};