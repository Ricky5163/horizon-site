import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ADMIN_EMAILS, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminEmails = SUPABASE_ADMIN_EMAILS.map((email) => email.toLowerCase());

const isAdmin = (email = '') => adminEmails.includes(email.toLowerCase());

const updateHeader = async () => {
  const loginLink = document.querySelector('.nav-actions .login');
  const primaryLink = document.querySelector('.nav-actions .button-primary');

  if (!loginLink || loginLink.dataset.sessionStatic === 'true') return;

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;

  const admin = isAdmin(session.user.email);
  loginLink.textContent = admin ? 'Admin' : 'Conta';
  loginLink.href = admin ? 'admin.html' : 'conta.html';
  loginLink.classList.toggle('active-login', window.location.pathname.endsWith(loginLink.getAttribute('href')));

  if (primaryLink instanceof HTMLAnchorElement) {
    primaryLink.textContent = 'Ver audios';
    primaryLink.href = 'audios.html';
  }
};

updateHeader();
