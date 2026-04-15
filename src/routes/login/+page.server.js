import { error, redirect } from '@sveltejs/kit';

export const actions = {
    login: async ({ request, locals }) => {
        const data = await request.formData();
        const email = data.get('email');
        const password = data.get('password');

        try {
            await locals.pb.collection('users').authWithPassword(email, password);
        } catch (err) {
            console.error('Login error:', err);
            return { success: false, error: 'Invalid email or password.' };
        }

        throw redirect(303, '/');
    }
};