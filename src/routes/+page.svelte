<script>
            import { onMount, onDestroy } from 'svelte';
    import pb from '$lib/pocketbase';
    
    import { invalidateAll } from '$app/navigation';
    
    // ... same states ...
    let { data } = $props();

    // UI States
    let editingId = $state(null);
    let showAddForm = $state(false);
    let searchQuery = $state(data.search);
    let selectedBook = $state(data.selectedBook);
    let perPage = $state(data.pagination.perPage);
    let importMode = $state(false);
    let isGenerating = $state(false); // Used for bulk or immediate UI feedback
    let importResult = $state(null); // { created, errors? } or { error }

    // Real-time subscription for automatic updates
    onMount(() => {
        pb.collection('story').subscribe('*', function (e) {
            if (e.action === 'update') {
                invalidateAll();
            }
        });
    });

    onDestroy(() => {
        pb.collection('story').unsubscribe('*');
    });

    // Helper to find a story in the current dataset
    function getStoryById(id) {
        return data.stories.find(s => s.id === id);
    }

    // Svelte 5 Derived Rune: Get unique list of books from server-provided books collection
    let bookList = $derived(data.books.map(b => b.title));

    // Svelte 5 Derived Rune: Groups stories
    let groupedByBook = $derived.by(() => {
        return data.stories.reduce((acc, story) => {
            if (!acc[story.book_title]) acc[story.book_title] = [];
            acc[story.book_title].push(story);
            return acc;
        }, {});
    });

    function updateFilters() {
        const url = new URL(window.location.href);
        if (searchQuery) url.searchParams.set('search', searchQuery);
        else url.searchParams.delete('search');
        
        if (selectedBook !== 'All Books') url.searchParams.set('book', selectedBook);
        else url.searchParams.delete('book');
        
        url.searchParams.set('perPage', perPage);
        url.searchParams.set('page', '1');
        goto(url.toString(), { keepFocus: true, noScroll: true });
    }

    function goToPage(p) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', p);
        goto(url.toString(), { noScroll: false });
    }

    let searchTimeout;
    function handleSearchInput() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(updateFilters, 500);
    }

    const toggleEdit = (id) => editingId = editingId === id ? null : id;

    // AI Summary Generation - Now Backgrounded
    async function handleAISummary(e, storyId) {
        const form = e.target.closest('form');
        const formData = new FormData(form);
        
        // If it's a new story (storyId is null), we don't have an ID yet.
        // But the user's plan says "On New Stories, let's save the record".
        // The 'create' action already handles set queued: true and enqueue.
        // So for the Add form, we just submit the form normally.
        
        if (!storyId) {
            // This is handled by the normal form submission in 'create' action
            return;
        }

        isGenerating = true;
        try {
            const response = await fetch('?/generateSummary', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            const parsed = JSON.parse(result.data);
            const resData = JSON.parse(parsed[1]);

            if (!resData.success) {
                alert(resData.error || "Failed to enqueue summary task");
            }
            // If success, the background worker will update the DB and real-time will refresh the UI
        } catch (err) {
            console.error(err);
            alert("Connection error.");
        } finally {
            isGenerating = false;
        }
    }

    async function handleBulkSummarize() {
        if (!confirm('Queue all stories without summaries for AI generation?')) return;
        
        isGenerating = true;
        try {
            const response = await fetch('?/bulkGenerate', { method: 'POST' });
            const result = await response.json();
            const parsed = JSON.parse(result.data);
            const resData = JSON.parse(parsed[1]);

            if (resData.success) {
                alert(`Successfully enqueued ${resData.count} stories for summarization.`);
            } else {
                alert(resData.error || "Bulk generation failed.");
            }
        } catch (err) {
            console.error(err);
            alert("Error starting bulk process.");
        } finally {
            isGenerating = false;
        }
    }
</script>

<div class="app-container">
    <header class="main-header">
        <h1>Short Story Archive</h1>
        <div class="controls">
            <div class="filter-group">
                <label for="book-filter">Book</label>
                <select id="book-filter" bind:value={selectedBook} onchange={updateFilters} class="filter-select">
                    <option value="All Books">All Books</option>
                    {#each bookList as book}
                        <option value={book}>{book}</option>
                    {/each}
                </select>
            </div>
            
            <div class="filter-group">
                <label for="search-input">Search</label>
                <input 
                    id="search-input"
                    type="text" 
                    placeholder="Search stories..." 
                    bind:value={searchQuery}
                    oninput={handleSearchInput}
                    class="search-bar"
                />
            </div>

            <div class="filter-group">
                <label for="per-page">Per Page</label>
                <select id="per-page" bind:value={perPage} onchange={updateFilters} class="filter-select mini">
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                </select>
            </div>

            <button class="bulk-ai-btn" onclick={handleBulkSummarize} disabled={isGenerating}>
                {isGenerating ? 'Wait...' : '✨ Bulk AI'}
            </button>

            <button class="add-btn" onclick={() => showAddForm = !showAddForm}>
                {showAddForm ? 'Close Form' : '+ New Entry'}
            </button>
            <form method="POST" action="?/logout" use:enhance>
                <button type="submit" class="logout-btn">Sign Out</button>
            </form>
        </div>
    </header>

    {#if showAddForm}
        <section class="form-section">
            <div class="form-header">
                <h2>{importMode ? 'Bulk Import JSON' : 'Archive a New Story'}</h2>
                <button class="toggle-mode-btn" onclick={() => importMode = !importMode}>
                    {importMode ? 'Switch to Manual Form' : 'Switch to Bulk Import'}
                </button>
            </div>

            {#if importMode}
                <form method="POST" action="?/import" use:enhance={() => {
                    importResult = null;
                    return async ({ result, update }) => {
                        if (result.type === 'success') {
                            importResult = result.data;
                            await update({ reset: false });
                            if (!result.data?.errors?.length) {
                                setTimeout(() => { showAddForm = false; importMode = false; }, 1500);
                            }
                        } else if (result.type === 'failure') {
                            importResult = { error: result.data?.error ?? 'Import failed.' };
                        } else {
                            await update();
                        }
                    };
                }}>
                    <div class="field full">
                        <label for="json_data">Paste JSON Array</label>
                        <textarea 
                            name="json_data" 
                            rows="10" 
                            placeholder={`[{"book_title": "...", "title": "...", ...}]`}
                            required
                        ></textarea>
                        <p class="help-text">Paste a JSON array. Each object needs at least <code>book_title</code>, <code>title</code>, and <code>author</code>.</p>
                    </div>

                    {#if importResult}
                        {#if importResult.error}
                            <div class="import-banner error">{importResult.error}</div>
                        {:else}
                            <div class="import-banner success">✓ Imported {importResult.created} stor{importResult.created === 1 ? 'y' : 'ies'} successfully.
                                {#if importResult.errors?.length}<br/><small>Skipped: {importResult.errors.join('; ')}</small>{/if}
                            </div>
                        {/if}
                    {/if}

                    <button type="submit" class="submit-btn import-color">Import All Stories</button>
                </form>
            {:else}
                <form method="POST" action="?/create" use:enhance={() => {
                    return async ({ update }) => {
                        await update();
                        showAddForm = false;
                    };
                }}>
                    <div class="input-grid">
                        <div class="field">
                            <label for="book_title">Source Book</label>
                            <input name="book_title" placeholder="e.g. The Collected Works" required />
                        </div>
                        <div class="field">
                            <label for="title">Story Title</label>
                            <input name="title" placeholder="e.g. The Last Question" required />
                        </div>
                        <div class="field">
                            <label for="author">Author</label>
                            <input name="author" placeholder="e.g. Isaac Asimov" required />
                        </div>
                        <div class="field">
                            <label for="page_number">Page Number</label>
                            <input name="page_number" type="number" placeholder="42" />
                        </div>
                    </div>
                    <div class="field full">
                        <div class="label-row">
                            <label for="summary">Summary</label>
                            <span class="info-pill">Auto-summarized on save</span>
                        </div>
                        <textarea name="summary" rows="3" placeholder="Click save to generate summary automatically..."></textarea>
                    </div>
                    <div class="field full">
                        <label for="tags">Tags (comma separated)</label>
                        <input name="tags" placeholder="sci-fi, mystery, robots" />
                    </div>
                    <button type="submit" class="submit-btn">Save to Library</button>
                </form>
            {/if}
        </section>
    {/if}

    <section class="library-view">
        <div class="pagination-info">
            Showing {(data.pagination.page - 1) * data.pagination.perPage + 1} - {Math.min(data.pagination.page * data.pagination.perPage, data.pagination.totalItems)} of {data.pagination.totalItems} stories
        </div>

        {#each Object.entries(groupedByBook) as [book, stories]}
            <div class="book-group">
                <h2 class="book-title-header">{book}</h2>
                <div class="stories-grid">
                    {#each stories as story (story.id)}
                        <!-- ... same story card content ... -->
                        <article class="story-card" class:editing={editingId === story.id}>
                            {#if editingId === story.id}
                                <div class="edit-mode-container">
                                    <form method="POST" action="?/update" use:enhance={() => {
                                        return async ({ result, update }) => {
                                            if (result.type === 'success') {
                                                await update();
                                                editingId = null;
                                            } else if (result.type === 'failure') {
                                                console.error('Update failed:', result.data);
                                                await update({ reset: false });
                                            } else {
                                                await update();
                                            }
                                        };
                                    }}>
                                        <input type="hidden" name="id" value={story.id} />
                                        
                                        {#if data.form?.error && editingId === story.id}
                                            <div class="inline-error-banner">
                                                {data.form.error}
                                                {#if data.form.details}
                                                    <pre>{JSON.stringify(data.form.details, null, 2)}</pre>
                                                {/if}
                                            </div>
                                        {/if}

                                        <div class="edit-fields">
                                            <input name="book_title" value={story.book_title} class="edit-input" placeholder="Book Title" />
                                            <input name="title" value={story.title} class="edit-input" placeholder="Story Title" />
                                            <input name="author" value={story.author} class="edit-input" placeholder="Author" />
                                            <input name="page_number" type="number" value={story.page_number} class="edit-input" placeholder="Page" />
                                            
                                            <div class="label-row mini">
                                                <label for="summary">Summary</label>
                                                <button 
                                                    type="button" 
                                                    class="ai-btn small" 
                                                    onclick={(e) => handleAISummary(e, story.id)}
                                                    disabled={isGenerating || story.queued}
                                                >
                                                    {story.queued ? 'Queued' : (isGenerating ? '...' : '✨ AI')}
                                                </button>
                                            </div>
                                            <textarea name="summary" class="edit-input" placeholder="Summary" readonly={story.queued}>{story.summary}</textarea>
                                            
                                            <label class="edit-label">Story Content</label>
                                            <textarea name="content" class="edit-input content-area" placeholder="Paste or type the full story text here...">{story.content ?? ''}</textarea>
                                            
                                            <input name="tags" value={Array.isArray(story.tags) ? story.tags.join(', ') : story.tags} class="edit-input" placeholder="Tags" />
                                        </div>
                                        
                                        <div class="edit-actions">
                                            <button type="submit" class="save-btn">Save Changes</button>
                                            <button type="button" class="cancel-btn" onclick={() => editingId = null}>Cancel</button>
                                        </div>
                                    </form>

                                    <form method="POST" action="?/delete" class="delete-form" use:enhance>
                                        <input type="hidden" name="id" value={story.id} />
                                        <button type="submit" class="delete-btn" onclick={(e) => !confirm('Delete this story?') && e.preventDefault()}>Delete Story</button>
                                    </form>
                                </div>
                            {:else}
                                <div class="story-content">
                                    <div class="story-header">
                                        <h3>{story.title}</h3>
                                        <span class="page-pill">p. {story.page_number}</span>
                                    </div>
                                    <p class="author-label">by {story.author}</p>
                                    <p class="summary-text">{story.summary || 'No summary provided.'}</p>
                                    <div class="tag-list">
                                        {#each (Array.isArray(story.tags) ? story.tags : (typeof story.tags === 'string' ? story.tags.split(',') : [])) as tag}
                                            {#if typeof tag === 'string' && tag.trim()}
                                                <span class="tag">#{tag.trim()}</span>
                                            {/if}
                                        {/each}
                                    </div>
                                    <div class="card-actions">
                                        {#if story.content && story.content.trim()}
                                            <a href="/story/{story.id}" class="read-btn">Read Story →</a>
                                        {:else}
                                            <span class="read-btn disabled">No Content</span>
                                        {/if}
                                        <button class="inline-edit-btn" onclick={() => toggleEdit(story.id)}>Edit Entry</button>
                                    </div>
                                </div>
                            {/if}
                        </article>
                    {/each}
                </div>
            </div>
        {:else}
            <div class="empty-state">
                <p>No stories found matching your search.</p>
            </div>
        {/each}

        {#if data.pagination.totalPages > 1}
            <nav class="pagination">
                <button 
                    class="page-link" 
                    class:disabled={data.pagination.page === 1}
                    onclick={() => goToPage(data.pagination.page - 1)}
                >
                    &laquo; Prev
                </button>
                
                {#each Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
                    // Simple sliding window for page numbers
                    let start = Math.max(1, data.pagination.page - 2);
                    let end = Math.min(data.pagination.totalPages, start + 4);
                    if (end === data.pagination.totalPages) start = Math.max(1, end - 4);
                    return start + i;
                }).filter(p => p <= data.pagination.totalPages) as p}
                    <button 
                        class="page-link" 
                        class:active={data.pagination.page === p}
                        onclick={() => goToPage(p)}
                    >
                        {p}
                    </button>
                {/each}

                <button 
                    class="page-link" 
                    class:disabled={data.pagination.page === data.pagination.totalPages}
                    onclick={() => goToPage(data.pagination.page + 1)}
                >
                    Next &raquo;
                </button>
            </nav>
        {/if}
    </section>
</div>

<style>
    :global(body) {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background-color: #f8fafc;
        margin: 0;
        color: #1e293b;
    }

    .app-container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem;
    }

    .main-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2.5rem;
        flex-wrap: wrap;
        gap: 1rem;
    }

    .controls {
        display: flex;
        gap: 1.5rem;
        flex-wrap: wrap;
        align-items: flex-end;
    }

    .filter-group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .filter-group label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        color: #94a3b8;
        letter-spacing: 0.05em;
    }

    .filter-select {
        padding: 0.6rem 1rem;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background-color: white;
        color: #1e293b;
        cursor: pointer;
        min-width: 140px;
        transition: border-color 0.2s;
    }

    .filter-select:hover { border-color: #94a3b8; }
    .filter-select.mini { min-width: 80px; }

    .search-bar {
        padding: 0.6rem 1rem;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        width: 300px;
        transition: all 0.2s;
    }
    .search-bar:focus { outline: none; border-color: #2563eb; ring: 2px solid #dbeafe; }

    .add-btn {
        background-color: #2563eb;
        color: white;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        height: 38px;
    }

    .bulk-ai-btn {
        background: #f5f3ff;
        color: #7c3aed;
        border: 1px solid #ddd6fe;
        padding: 0.6rem 1rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        height: 38px;
        transition: all 0.2s;
    }
    .bulk-ai-btn:hover:not(:disabled) { background: #ede9fe; border-color: #c4b5fd; }
    .bulk-ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .info-pill { font-size: 0.7rem; color: #94a3b8; background: #f8fafc; padding: 2px 8px; border-radius: 999px; }

    .logout-btn {
        background: none;
        border: 1px solid #cbd5e1;
        color: #64748b;
        padding: 0.6rem 1.2rem;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
    }
    .logout-btn:hover { background: #fee2e2; color: #b91c1c; border-color: #fecaca; }

    .form-section {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        margin-bottom: 3rem;
    }

    .form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }

    .toggle-mode-btn {
        background: none;
        border: 1px solid #94a3b8;
        color: #64748b;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .toggle-mode-btn:hover { background: #f1f5f9; }

    .help-text { font-size: 0.8rem; color: #64748b; margin-top: 0.5rem; }

    .input-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-bottom: 1.5rem;
    }

    .field { display: flex; flex-direction: column; gap: 0.5rem; }
    .field label { font-size: 0.875rem; font-weight: 600; color: #64748b; }
    input, textarea { padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 1rem; }
    
    .label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
    .label-row.mini { margin-bottom: 0.5rem; margin-top: 0.5rem; }
    .label-row label { margin-bottom: 0; }
    
    .ai-btn {
        background: #f5f3ff;
        color: #7c3aed;
        border: 1px solid #ddd6fe;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .ai-btn:hover:not(:disabled) { background: #ede9fe; border-color: #c4b5fd; }
    .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ai-btn.small { padding: 2px 8px; }

    .submit-btn { background: #059669; color: white; border: none; padding: 1rem; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; }
    .import-color { background: #7c3aed; }

    .book-group { margin-bottom: 4rem; }
    .book-title-header { 
        font-size: 1.5rem; 
        color: #1e293b; 
        border-left: 4px solid #2563eb; 
        padding-left: 1rem; 
        margin-bottom: 1.5rem;
    }

    .stories-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1.5rem;
    }

    .story-card {
        background: white;
        border-radius: 10px;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
        transition: transform 0.2s, box-shadow 0.2s;
        position: relative;
    }

    .story-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); }
    
    .story-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem; }
    .story-header h3 { margin: 0; font-size: 1.25rem; color: #0f172a; }
    
    .page-pill { font-size: 0.75rem; background: #f1f5f9; padding: 2px 8px; border-radius: 999px; color: #475569; }
    
    .author-label { font-style: italic; color: #64748b; margin-top: 0; margin-bottom: 1rem; }
    .summary-text { font-size: 0.925rem; line-height: 1.5; color: #334155; margin-bottom: 1.5rem; }

    .tag-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
    .tag { font-size: 0.75rem; color: #2563eb; background: #eff6ff; padding: 2px 8px; border-radius: 4px; font-weight: 500; }

    .card-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 1.25rem; }

    .read-btn {
        font-size: 0.85rem;
        font-weight: 600;
        color: #2563eb;
        text-decoration: none;
        padding: 0.35rem 0.75rem;
        border: 1px solid #bfdbfe;
        border-radius: 6px;
        background: #eff6ff;
        transition: background 0.15s, border-color 0.15s;
    }
    .read-btn:hover { background: #dbeafe; border-color: #93c5fd; }
    
    .read-btn.disabled {
        background: #f1f5f9;
        color: #94a3b8;
        border-color: #e2e8f0;
        cursor: not-allowed;
        pointer-events: none;
    }

    .edit-label { font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 0.25rem; display: block; }
    .content-area { min-height: 200px; font-family: Georgia, serif; font-size: 0.95rem; line-height: 1.7; }

    .inline-edit-btn {
        margin-top: 1.5rem;
        background: none;
        border: none;
        color: #64748b;
        font-size: 0.8rem;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
    }

    .edit-mode-container { display: flex; flex-direction: column; gap: 1rem; }
    .edit-fields { display: flex; flex-direction: column; gap: 0.5rem; }
    .edit-input { width: 100%; box-sizing: border-box; }
    .edit-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    
    .save-btn { background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; flex: 1; }
    .cancel-btn { background: #e2e8f0; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    
    .delete-form { border-top: 1px solid #f1f5f9; padding-top: 1rem; }
    .delete-btn { width: 100%; background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.875rem; }
    .delete-btn:hover { background: #fecaca; }
    .import-banner { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
    .import-banner.success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .import-banner.error   { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }

    .inline-error-banner {
        background: #fee2e2;
        color: #b91c1c;
        border: 1px solid #fecaca;
        padding: 0.75rem;
        border-radius: 6px;
        margin-bottom: 1rem;
        font-size: 0.85rem;
    }
    .inline-error-banner pre {
        margin-top: 0.5rem;
        font-size: 0.75rem;
        white-space: pre-wrap;
        background: rgba(255, 255, 255, 0.5);
        padding: 0.5rem;
        border-radius: 4px;
    }

    /* Pagination Styles */
    .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        margin-top: 4rem;
        background: white;
        padding: 1rem;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .page-link {
        padding: 0.5rem 1rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: white;
        color: #475569;
        text-decoration: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .page-link:hover:not(.disabled):not(.active) {
        background: #f8fafc;
        border-color: #cbd5e1;
        color: #1e293b;
    }

    .page-link.active {
        background: #2563eb;
        color: white;
        border-color: #2563eb;
    }

    .page-link.disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .pagination-info {
        color: #94a3b8;
        font-size: 0.85rem;
        font-weight: 500;
        margin-bottom: 2rem;
        text-align: center;
        letter-spacing: 0.025em;
    }
</style>