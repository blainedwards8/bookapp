<script>
    let { data } = $props();
    const story = data.story;

    const tags = Array.isArray(story.tags)
        ? story.tags
        : (typeof story.tags === 'string' ? story.tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    // Render content: preserve line breaks as paragraph breaks
    const paragraphs = (story.content ?? '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);
</script>

<svelte:head>
    <title>{story.title} — Short Story Archive</title>
    <meta name="description" content={story.summary || `Read "${story.title}" by ${story.author}.`} />
</svelte:head>

<div class="reader-shell">
    <nav class="breadcrumb">
        <a href="/" class="back-link">← Back to Library</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-book">{story.book_title}</span>
    </nav>

    <article class="reader">
        <header class="story-head">
            <div class="meta-top">
                <span class="book-badge">{story.book_title}</span>
                <span class="page-badge">p. {story.page_number}</span>
            </div>
            <h1>{story.title}</h1>
            <p class="byline">by {story.author}</p>

            {#if story.summary}
                <blockquote class="synopsis">{story.summary}</blockquote>
            {/if}

            {#if tags.length}
                <div class="tag-row">
                    {#each tags as tag}
                        <span class="tag">#{tag}</span>
                    {/each}
                </div>
            {/if}
        </header>

        <hr class="divider" />

        <div class="story-body">
            {#if paragraphs.length}
                {#each paragraphs as para}
                    <p>{para}</p>
                {/each}
            {:else}
                <div class="no-content">
                    <p>No story content has been added yet.</p>
                    <a href="/" class="edit-prompt">Go back and edit this entry to add the story text.</a>
                </div>
            {/if}
        </div>
    </article>
</div>

<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');

    :global(body) {
        font-family: 'Inter', sans-serif;
        background: #f8fafc;
        margin: 0;
        color: #1e293b;
    }

    .reader-shell {
        max-width: 720px;
        margin: 0 auto;
        padding: 2rem 1.5rem 6rem;
    }

    /* Breadcrumb */
    .breadcrumb {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: #94a3b8;
        margin-bottom: 2.5rem;
    }
    .back-link {
        color: #2563eb;
        text-decoration: none;
        font-weight: 500;
    }
    .back-link:hover { text-decoration: underline; }
    .breadcrumb-sep { color: #cbd5e1; }
    .breadcrumb-book { color: #64748b; }

    /* Story header */
    .reader { background: white; border-radius: 16px; padding: 3rem; box-shadow: 0 4px 24px rgb(0 0 0 / 0.07); }

    .meta-top {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.25rem;
    }

    .book-badge {
        font-size: 0.75rem;
        font-weight: 600;
        color: #7c3aed;
        background: #f5f3ff;
        border: 1px solid #ddd6fe;
        padding: 3px 10px;
        border-radius: 999px;
    }

    .page-badge {
        font-size: 0.75rem;
        color: #475569;
        background: #f1f5f9;
        padding: 3px 10px;
        border-radius: 999px;
    }

    .story-head h1 {
        font-family: 'Lora', Georgia, serif;
        font-size: 2.25rem;
        font-weight: 600;
        line-height: 1.25;
        color: #0f172a;
        margin: 0 0 0.5rem;
    }

    .byline {
        font-style: italic;
        color: #64748b;
        font-size: 1rem;
        margin: 0 0 1.5rem;
    }

    .synopsis {
        border-left: 3px solid #2563eb;
        margin: 0 0 1.5rem;
        padding: 0.75rem 1.25rem;
        color: #475569;
        font-size: 0.95rem;
        line-height: 1.6;
        background: #f8faff;
        border-radius: 0 8px 8px 0;
        font-style: italic;
    }

    .tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .tag {
        font-size: 0.75rem;
        color: #2563eb;
        background: #eff6ff;
        padding: 3px 10px;
        border-radius: 4px;
        font-weight: 500;
    }

    .divider {
        border: none;
        border-top: 1px solid #e2e8f0;
        margin: 2rem 0;
    }

    /* Story body text */
    .story-body p {
        font-family: 'Lora', Georgia, serif;
        font-size: 1.1rem;
        line-height: 1.85;
        color: #334155;
        margin: 0 0 1.5em;
        text-indent: 1.5em;
    }

    .story-body p:first-child { text-indent: 0; }

    .no-content {
        text-align: center;
        padding: 3rem 1rem;
        color: #94a3b8;
    }
    .no-content p { font-size: 1rem; margin-bottom: 1rem; }
    .edit-prompt {
        color: #2563eb;
        text-decoration: none;
        font-size: 0.9rem;
    }
    .edit-prompt:hover { text-decoration: underline; }
</style>
