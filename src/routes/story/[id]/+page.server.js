import { redirect, error } from '@sveltejs/kit';

export const load = async ({ params, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    try {
        const story = await locals.pb.collection('story').getOne(params.id, {
            expand: 'book'
        });

        return {
            story: JSON.parse(JSON.stringify({
                ...story,
                book_title: story.expand?.book?.title ?? story.book_title ?? 'Unknown Book',
                page_number: story.page ?? story.page_number ?? 0
            }))
        };
    } catch (e) {
        throw error(404, 'Story not found');
    }
};
