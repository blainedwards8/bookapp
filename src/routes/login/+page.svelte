<script>
    import { enhance } from '$app/forms';
    let { form } = $props();
    let loading = $state(false);
</script>

<div class="login-container">
    <div class="login-card">
        <h1>Archive Login</h1>
        <p class="subtitle">Please enter your credentials to manage the library.</p>

        {#if form?.error}
            <div class="error-msg">{form.error}</div>
        {/if}

        <form method="POST" action="?/login" use:enhance={() => {
            loading = true;
            return async ({ update }) => {
                await update();
                loading = false;
            };
        }}>
            <div class="field">
                <label for="email">Email Address</label>
                <input type="email" name="email" id="email" required placeholder="name@example.com" />
            </div>

            <div class="field">
                <label for="password">Password</label>
                <input type="password" name="password" id="password" required placeholder="••••••••" />
            </div>

            <button type="submit" class="login-btn" disabled={loading}>
                {loading ? 'Authenticating...' : 'Sign In'}
            </button>
        </form>
    </div>
</div>

<style>
    .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background-color: #f8fafc;
    }
    .login-card {
        background: white;
        padding: 2.5rem;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
        width: 100%;
        max-width: 400px;
    }
    h1 { margin: 0 0 0.5rem 0; font-size: 1.75rem; color: #0f172a; text-align: center; }
    .subtitle { color: #64748b; text-align: center; margin-bottom: 2rem; font-size: 0.9rem; }
    
    .error-msg {
        background: #fee2e2;
        color: #b91c1c;
        padding: 0.75rem;
        border-radius: 6px;
        margin-bottom: 1.5rem;
        font-size: 0.85rem;
        text-align: center;
        border: 1px solid #fecaca;
    }

    form { display: flex; flex-direction: column; gap: 1.25rem; }
    .field { display: flex; flex-direction: column; gap: 0.5rem; }
    label { font-size: 0.85rem; font-weight: 600; color: #475569; }
    input { padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; }
    input:focus { outline: 2px solid #2563eb; outline-offset: -1px; }

    .login-btn {
        background: #2563eb;
        color: white;
        border: none;
        padding: 0.85rem;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    .login-btn:hover:not(:disabled) { background: #1d4ed8; }
    .login-btn:disabled { opacity: 0.7; cursor: not-allowed; }
</style>