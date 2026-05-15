import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { R2_UPLOAD_ENDPOINT, SUPABASE_ADMIN_EMAILS, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.querySelector('[data-admin-form]');
const message = document.querySelector('[data-admin-message]');
const submit = document.querySelector('[data-admin-submit]');
const emailNode = document.querySelector('[data-admin-email]');
const allowlistNode = document.querySelector('[data-admin-allowlist]');
const logoutButton = document.querySelector('[data-logout]');

const normalizedAdmins = SUPABASE_ADMIN_EMAILS.map((email) => email.toLowerCase());

const setMessage = (text, type = 'info') => {
  if (!message) return;
  message.textContent = text;
  message.dataset.type = type;
};

const setLoading = (loading) => {
  if (!submit) return;
  submit.disabled = loading;
  submit.textContent = loading ? 'A guardar...' : 'Guardar audio';
};

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const requireAdminSession = async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const email = session?.user?.email?.toLowerCase();

  if (!session) {
    window.location.href = 'entrar.html';
    return null;
  }

  if (!email || !normalizedAdmins.includes(email)) {
    window.location.href = 'conta.html';
    return null;
  }

  if (emailNode) emailNode.textContent = session.user.email;
  if (allowlistNode) allowlistNode.textContent = SUPABASE_ADMIN_EMAILS.join(', ');
  return session;
};

const uploadAudio = async (file, title, accessToken) => {
  if (!R2_UPLOAD_ENDPOINT) {
    throw new Error('Configura o R2_UPLOAD_ENDPOINT em supabase-config.js ou usa um URL de audio.');
  }

  const safeName = slugify(title || file.name.replace(/\.[^.]+$/, '')) || 'audio';
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'mp3';
  const objectKey = `audios/${Date.now()}-${safeName}.${extension}`;
  const body = new FormData();
  body.append('file', file);
  body.append('key', objectKey);

  const response = await fetch(R2_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Nao foi possivel carregar o audio para R2.');

  return result;
};

await requireAdminSession();

logoutButton?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'entrar.html';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setLoading(true);
  setMessage('');

  try {
    const session = await requireAdminSession();
    if (!session) return;

    const formData = new FormData(form);
    const file = formData.get('audio_file');
    let audioUrl = String(formData.get('audio_url') || '').trim();
    let objectKey = '';

    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadAudio(file, String(formData.get('title') || 'audio'), session.access_token);
      audioUrl = uploaded.url;
      objectKey = uploaded.key;
    }

    if (!audioUrl) {
      setMessage('Adiciona um URL ou carrega um ficheiro de audio.', 'error');
      return;
    }

    const payload = {
      title: String(formData.get('title')).trim(),
      description: String(formData.get('description') || '').trim(),
      category: String(formData.get('category')),
      duration_minutes: Number(formData.get('duration_minutes')),
      audio_url: audioUrl,
      storage_provider: objectKey ? 'r2' : 'external',
      object_key: objectKey || null,
      cover_style: String(formData.get('cover_style')),
      is_published: formData.get('is_published') === 'on',
      created_by: session.user.id,
    };

    const { error } = await supabase.from('audios').insert(payload);
    if (error) throw error;

    form.reset();
    form.querySelector('input[name="is_published"]').checked = true;
    setMessage('Audio guardado na biblioteca.', 'success');
  } catch (error) {
    setMessage(error.message || 'Nao foi possivel guardar o audio.', 'error');
  } finally {
    setLoading(false);
  }
});
