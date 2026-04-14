import db from '$lib/server/database';

// Helper for calling Ollama with exponential backoff
async function callOllama(prompt) {
    const url = `https://ai.a13.in/api/generate`;
    
    const payload = {
        model: "gemma4:e4b", // Adjust model name as needed for your Ollama instance
        prompt: prompt,
        stream: false
    };

    let delay = 1000;
    for (let i = 0; i < 5; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Ollama request failed');
            }

            const result = await response.json();
            return result.response;
        } catch (e) {
            if (i === 4) throw e;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

export const load = async () => {
    try {
        const stories = db.prepare('SELECT * FROM stories ORDER BY book_title ASC, page_number ASC').all();
        return {
            stories
        };
    } catch (e) {
        console.error("Failed to load stories:", e);
        return { stories: [] };
    }
};

export const actions = {
    create: async ({ request }) => {
        const data = await request.formData();
        
        const insert = db.prepare(`
            INSERT INTO stories (book_title, title, author, page_number, summary, tags)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        insert.run(
            data.get('book_title'),
            data.get('title'),
            data.get('author'),
            parseInt(data.get('page_number')) || 0,
            data.get('summary'),
            data.get('tags')
        );

        return { success: true };
    },

    update: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        const update = db.prepare(`
            UPDATE stories 
            SET book_title = ?, title = ?, author = ?, page_number = ?, summary = ?, tags = ?
            WHERE id = ?
        `);
        
        update.run(
            data.get('book_title'),
            data.get('title'),
            data.get('author'),
            parseInt(data.get('page_number')) || 0,
            data.get('summary'),
            data.get('tags'),
            id
        );

        return { success: true };
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        
        const del = db.prepare('DELETE FROM stories WHERE id = ?');
        del.run(id);

        return { success: true };
    },

    import: async ({ request }) => {
        const data = await request.formData();
        const jsonStr = data.get('json_data');
        
        try {
            const stories = JSON.parse(jsonStr);
            
            if (!Array.isArray(stories)) {
                return { success: false, error: "Data must be a JSON array." };
            }

            const insert = db.prepare(`
                INSERT INTO stories (book_title, title, author, page_number, summary, tags)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            const transaction = db.transaction((storiesArray) => {
                for (const story of storiesArray) {
                    insert.run(
                        story.book_title || "Unknown Book",
                        story.title || "Untitled",
                        story.author || "Unknown Author",
                        parseInt(story.page_number) || 0,
                        story.summary || "",
                        story.tags || ""
                    );
                }
            });

            transaction(stories);
            return { success: true };
        } catch (e) {
            return { success: false, error: "Invalid JSON format: " + e.message };
        }
    },

    generateSummary: async ({ request }) => {
        const data = await request.formData();
        const title = data.get('title');
        const author = data.get('author');
        const book = data.get('book_title');

        if (!title || !author) {
            return { success: false, error: "Title and Author are required for AI summary." };
        }

        const prompt = `Provide a short, engaging summary (max 3 sentences) for the short story titled "${title}" by ${author} found in the book "${book}". Focus on the premise and theme.`;

        try {
            const summary = await callOllama(prompt);
            return { success: true, summary: summary.trim() };
        } catch (e) {
            console.error("Ollama Error:", e);
            return { success: false, error: "AI generation failed. Please check if the Ollama instance is reachable." };
        }
    }
};