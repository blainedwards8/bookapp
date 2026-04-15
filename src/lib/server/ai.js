// Helper for calling Ollama with exponential backoff
export async function callOllama(prompt) {
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
