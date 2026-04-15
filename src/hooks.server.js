import pb from '$lib/pocketbase';

export const handle = async ({ event, resolve }) => {
    // Load the auth store from the request cookie
    pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');

    try {
        // Get an up-to-date auth state from the database if a token is present
        if (pb.authStore.isValid) {
            await pb.collection('users').authRefresh();
        }
    } catch (_) {
        // Clear the auth store on error (e.g., expired token)
        pb.authStore.clear();
    }

    event.locals.pb = pb;
    event.locals.user = pb.authStore.model;

    const response = await resolve(event);

    // Send back the updated auth store cookie to the client
    response.headers.append('set-cookie', pb.authStore.exportToCookie({ httpOnly: false }));

    return response;
};