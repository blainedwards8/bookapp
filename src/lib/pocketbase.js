import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// The URL is now pulled from the PUBLIC_POCKETBASE_URL environment variable
// defined in your .env file or server environment.
const pb = new PocketBase(PUBLIC_POCKETBASE_URL || 'http://192.168.86.59:8090');

export default pb;