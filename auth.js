import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authView = document.querySelector('[data-auth-view]');
const authForm = document.querySelector('[data-auth-form]');
const authMessage = document.querySelector('[data-auth-message]');
const submitButton = document.querySelector('[data-auth-submit]');
const resetButton = document.querySelector('[data-reset-password]');
const tabs = document.querySelectorAll('[data-auth-tab]');
const logoutButton = document.querySelector('[data-logout]');
const accountEmail = document.querySelector('[data-account-email]');

let authMode = 'login';

const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE-ANON-KEY');

const setMessage = (message, type = 'info') => {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.dataset.type = type;
};

const setLoading = (loading) => {
  if (!submitButton) return;
  submitButton.disabled = loading;
  submitButton.textContent = loading ? 'A processar...' : authMode === 'login' ? 'Entrar' : 'Criar conta';
};

const updateMode = (mode) => {
  authMode = mode;
  tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.authTab === mode);
  });
  setLoading(false);
  setMessage('');
};

const redirectIfLoggedIn = async () => {
  if (!authView || !isConfigured()) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.href = 'conta.html';
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => updateMode(tab.dataset.authTab));
});

authForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!isConfigured()) {
    setMessage('Adiciona o URL e a anon key do teu projeto em supabase-config.js.', 'error');
    return;
  }

  const formData = new FormData(authForm);
  const email = String(formData.get('email')).trim();
  const password = String(formData.get('password'));

  setLoading(true);
  setMessage('');

  const action =
    authMode === 'login'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/conta.html` },
        });

  const { error } = await action;
  setLoading(false);

  if (error) {
    setMessage(error.message, 'error');
    return;
  }

  if (authMode === 'signup') {
    setMessage('Conta criada. Confirma o teu email para entrares.', 'success');
    return;
  }

  window.location.href = 'conta.html';
});

resetButton?.addEventListener('click', async () => {
  if (!isConfigured()) {
    setMessage('Adiciona o URL e a anon key do teu projeto em supabase-config.js.', 'error');
    return;
  }

  const email = authForm?.email.value.trim();
  if (!email) {
    setMessage('Escreve o teu email primeiro.', 'error');
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/entrar.html`,
  });

  setMessage(error ? error.message : 'Enviamos um email para recuperares a password.', error ? 'error' : 'success');
});

if (logoutButton) {
  const { data } = isConfigured() ? await supabase.auth.getSession() : { data: { session: null } };

  if (!isConfigured()) {
    window.location.href = 'entrar.html';
  } else if (!data.session) {
    window.location.href = 'entrar.html';
  } else {
    accountEmail.textContent = data.session.user.email;
  }

  logoutButton.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'entrar.html';
  });
}

redirectIfLoggedIn();

