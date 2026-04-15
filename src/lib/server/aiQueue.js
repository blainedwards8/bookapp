import Queue from 'better-queue';
import { callOllama } from './ai';
import pb from '../pocketbase';

export const aiQueue = new Queue(async (task, cb) => {
    const { storyId, title, author, content } = task;
    
    try {
        console.log(`[AI Queue] Processing story: ${title || 'Untitled'} (${storyId})`);
        
        let prompt;
        if (content && content.trim()) {
            prompt = `Summarize the following short story titled "${title}" by ${author}. Provide a concise, engaging summary. \n\nStory Content:\n${content}`;
        } else {
            prompt = `Provide a short, engaging summary for a short story titled "${title}" by ${author}.`;
        }

        const summary = await callOllama(prompt);
        
        // Update the record in PocketBase
        // NOTE: This assumes the server has permission to update. 
        // In a typical PocketBase setup, you'd authorize with admin credentials here.
        await pb.collection('story').update(storyId, {
            summary: summary.trim(),
            queued: false
        });

        console.log(`[AI Queue] Successfully summarized: ${title}`);
        cb(null, summary);
    } catch (err) {
        console.error(`[AI Queue] Failed to process story ${storyId}:`, err);
        
        // Reset the queued flag so the UI doesn't stay stuck
        try {
            await pb.collection('story').update(storyId, { queued: false });
        } catch (dbErr) {
            console.error(`[AI Queue] Could not reset queued flag for ${storyId}:`, dbErr);
        }
        
        cb(err);
    }
}, { concurrent: 1 });
