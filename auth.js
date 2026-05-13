import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ADMIN_EMAILS, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authView = document.querySelector('[data-auth-view]');
const authForm = document.querySelector('[data-auth-form]');
const authMessage = document.querySelector('[data-auth-message]');
const submitButton = document.querySelector('[data-auth-submit]');
const resetButton = document.querySelector('[data-reset-password]');
const emailInput = document.querySelector('input[name="email"]');
const passwordInput = document.querySelector('input[name="password"]');
const tabs = document.querySelectorAll('[data-auth-tab]');
const logoutButton = document.querySelector('[data-logout]');
const accountEmail = document.querySelector('[data-account-email]');
const accountName = document.querySelector('[data-account-name]');
const accountSince = document.querySelector('[data-account-since]');
const accountStatus = document.querySelector('[data-account-status]');
const adminLink = document.querySelector('[data-admin-link]');

let authMode = 'login';

const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE-ANON-KEY');

const siteOrigin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? window.location.origin
  : 'https://horizonaudios.com';
const pageUrl = (path) => new URL(path, `${siteOrigin}/`).href;
const isAdminEmail = (email = '') => SUPABASE_ADMIN_EMAILS.map((item) => item.toLowerCase()).includes(email.toLowerCase());
const displayNameFromEmail = (email = '') => email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'utilizador';
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

const completeAuthRedirect = async () => {
  if (!isConfigured()) return;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const errorDescription = params.get('error_description');

  if (errorDescription) {
    setMessage(decodeURIComponent(errorDescription), 'error');
    return;
  }

  if (!code) return;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    setMessage(error.message, 'error');
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
};

const waitForImplicitSession = async () => {
  if (!window.location.hash.includes('access_token')) return;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    await wait(120);
  }
};

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
  if (passwordInput) {
    passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  }
  setLoading(false);
  setMessage('');
};

const redirectIfLoggedIn = async () => {
  if (!authView || !isConfigured()) return;
  await completeAuthRedirect();
  await waitForImplicitSession();
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.href = isAdminEmail(data.session.user.email) ? 'admin.html' : 'conta.html';
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
          options: { emailRedirectTo: pageUrl('conta.html') },
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

  window.location.href = isAdminEmail(email) ? 'admin.html' : 'conta.html';
});

resetButton?.addEventListener('click', async () => {
  if (!isConfigured()) {
    setMessage('Adiciona o URL e a anon key do teu projeto em supabase-config.js.', 'error');
    return;
  }

  const email = emailInput?.value.trim();
  if (!email) {
    setMessage('Escreve o teu email primeiro.', 'error');
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: pageUrl('entrar.html'),
  });

  setMessage(error ? error.message : 'Enviamos um email para recuperares a password.', error ? 'error' : 'success');
});

if (logoutButton) {
  await completeAuthRedirect();
  await waitForImplicitSession();
  const { data } = isConfigured() ? await supabase.auth.getSession() : { data: { session: null } };

  if (!isConfigured()) {
    window.location.href = 'entrar.html';
  } else if (!data.session) {
    window.location.href = 'entrar.html';
  } else {
    accountEmail.textContent = data.session.user.email;
    if (accountName) accountName.textContent = displayNameFromEmail(data.session.user.email);
    if (accountSince) {
      accountSince.textContent = new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date(data.session.user.created_at));
    }
    if (accountStatus) {
      accountStatus.textContent = data.session.user.email_confirmed_at || data.session.user.confirmed_at
        ? 'Email confirmado'
        : 'Email por confirmar';
    }
    if (adminLink && isAdminEmail(data.session.user.email)) adminLink.hidden = false;
  }

  logoutButton.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'entrar.html';
  });
}

redirectIfLoggedIn();
