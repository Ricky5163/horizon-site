import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { R2_UPLOAD_ENDPOINT, SUPABASE_ADMIN_EMAILS, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.querySelector('[data-admin-form]');
const message = document.querySelector('[data-admin-message]');
const submit = document.querySelector('[data-admin-submit]');
const emailNode = document.querySelector('[data-admin-email]');
const allowlistNode = document.querySelector('[data-admin-allowlist]');
const logoutButton = document.querySelector('[data-logout]');
const audioList = document.querySelector('[data-admin-audio-list]');
const listMessage = document.querySelector('[data-admin-list-message]');
const refreshButton = document.querySelector('[data-audios-refresh]');

const normalizedAdmins = SUPABASE_ADMIN_EMAILS.map((email) => email.toLowerCase());

const setMessage = (text, type = 'info') => {
  if (!message) return;
  message.textContent = text;
  message.dataset.type = type;
};

const setListMessage = (text, type = 'info') => {
  if (!listMessage) return;
  listMessage.textContent = text;
  listMessage.dataset.type = type;
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

const deleteR2Object = async (objectKey, accessToken) => {
  if (!objectKey || !R2_UPLOAD_ENDPOINT) return;

  const response = await fetch(R2_UPLOAD_ENDPOINT, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: objectKey }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Audio removido do site, mas nao foi possivel apagar o ficheiro no R2.');
  }
};

const createAudioRow = (audio) => {
  const row = document.createElement('article');
  row.className = 'admin-audio-row';

  const details = document.createElement('div');
  details.className = 'admin-audio-details';

  const title = document.createElement('strong');
  title.textContent = audio.title;

  const meta = document.createElement('span');
  meta.textContent = `${audio.category || 'Sem categoria'} - ${audio.duration_minutes || '-'} min - ${audio.is_published ? 'Publicado' : 'Oculto'}`;

  const url = document.createElement('small');
  url.textContent = audio.object_key || audio.audio_url || 'Sem ficheiro associado';

  details.append(title, meta, url);

  const actions = document.createElement('div');
  actions.className = 'admin-audio-actions';

  const listen = document.createElement('a');
  listen.className = 'button button-secondary admin-small-button';
  listen.href = audio.audio_url;
  listen.target = '_blank';
  listen.rel = 'noreferrer';
  listen.textContent = 'Ouvir';

  const remove = document.createElement('button');
  remove.className = 'button admin-danger-button';
  remove.type = 'button';
  remove.textContent = 'Remover';
  remove.addEventListener('click', async () => {
    const confirmed = window.confirm(`Remover "${audio.title}" da biblioteca?`);
    if (!confirmed) return;

    remove.disabled = true;
    remove.textContent = 'A remover...';
    setListMessage('');

    try {
      const session = await requireAdminSession();
      if (!session) return;

      const { error } = await supabase.from('audios').delete().eq('id', audio.id);
      if (error) throw error;

      if (audio.object_key) {
        try {
          await deleteR2Object(audio.object_key, session.access_token);
          setListMessage('Audio removido da biblioteca e do R2.', 'success');
        } catch (r2Error) {
          setListMessage('Audio removido da biblioteca. O ficheiro no R2 pode ser apagado depois.', 'success');
        }
      } else {
        setListMessage('Audio removido da biblioteca.', 'success');
      }

      row.remove();
      if (audioList && !audioList.querySelector('.admin-audio-row')) {
        audioList.innerHTML = '<p class="admin-empty">Ainda nao ha audios na biblioteca.</p>';
      }
    } catch (error) {
      setListMessage(error.message || 'Nao foi possivel remover o audio.', 'error');
      remove.disabled = false;
      remove.textContent = 'Remover';
    }
  });

  actions.append(listen, remove);
  row.append(details, actions);
  return row;
};

const loadAdminAudios = async () => {
  if (!audioList) return;

  audioList.innerHTML = '<p class="admin-empty">A carregar audios...</p>';
  setListMessage('');

  const { data, error } = await supabase
    .from('audios')
    .select('id, title, category, duration_minutes, audio_url, object_key, is_published, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    audioList.innerHTML = '<p class="admin-empty">Nao foi possivel carregar a lista.</p>';
    setListMessage(error.message, 'error');
    return;
  }

  if (!data?.length) {
    audioList.innerHTML = '<p class="admin-empty">Ainda nao ha audios na biblioteca.</p>';
    return;
  }

  audioList.replaceChildren(...data.map(createAudioRow));
};

const session = await requireAdminSession();
if (session) await loadAdminAudios();

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
    await loadAdminAudios();
  } catch (error) {
    setMessage(error.message || 'Nao foi possivel guardar o audio.', 'error');
  } finally {
    setLoading(false);
  }
});

refreshButton?.addEventListener('click', loadAdminAudios);
