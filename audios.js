import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const grid = document.querySelector('[data-audio-grid]');
const player = new Audio();
let activeButton = null;

const iconFor = (category = '') => {
  const normalized = category.toLowerCase();
  if (normalized.includes('sono')) return 'moon-icon';
  if (normalized.includes('ansiedade')) return 'cloud-icon';
  if (normalized.includes('foco')) return 'focus-icon';
  if (normalized.includes('auto')) return 'user-icon';
  return 'heart-icon';
};

const landscapeMarkup = (style) => {
  if (style === 'card-river') return '<div class="card-art"><span class="mist-hills"></span><span class="river"></span></div>';
  if (style === 'card-peak') return '<div class="card-art"><span class="peak-main"></span><span class="cloud-bed"></span></div>';
  if (style === 'card-sunset') return '<div class="card-art"><span class="beach-line"></span></div>';
  return '<div class="card-art"><span class="range r1"></span><span class="range r2"></span><span class="water-lines"></span></div>';
};

const createCard = (audio) => {
  const article = document.createElement('article');
  article.className = `audio-card ${audio.cover_style || 'card-night'}`;
  article.innerHTML = `
    ${landscapeMarkup(audio.cover_style)}
    <div class="card-footer">
      <div>
        <h3>${audio.title}</h3>
        <span><span class="tiny-icon ${iconFor(audio.category)}"></span>${audio.duration_minutes || '-'} min</span>
      </div>
      <button class="card-play" type="button" aria-label="Reproduzir ${audio.title}" data-audio-src="${audio.audio_url}"></button>
    </div>
  `;
  return article;
};

const wirePlayButtons = () => {
  const buttons = document.querySelectorAll('.card-play, .mini-play, [data-play]');
  buttons.forEach((button) => {
    if (button.dataset.boundPlay === 'true') return;
    button.dataset.boundPlay = 'true';
    button.addEventListener('click', () => {
      const audioSrc = button.dataset.audioSrc;

      buttons.forEach((item) => {
        if (item !== button) {
          item.classList.remove('is-playing');
          item.setAttribute('aria-pressed', 'false');
        }
      });

      if (!audioSrc) {
        button.classList.toggle('is-playing');
        button.setAttribute('aria-pressed', button.classList.contains('is-playing') ? 'true' : 'false');
        return;
      }

      if (activeButton === button && !player.paused) {
        player.pause();
        button.classList.remove('is-playing');
        button.setAttribute('aria-pressed', 'false');
        return;
      }

      activeButton = button;
      player.src = audioSrc;
      player.play();
      button.classList.add('is-playing');
      button.setAttribute('aria-pressed', 'true');
    });
  });
};

player.addEventListener('ended', () => {
  activeButton?.classList.remove('is-playing');
  activeButton?.setAttribute('aria-pressed', 'false');
  activeButton = null;
});

const loadAudios = async () => {
  if (!grid) return;

  const { data, error } = await supabase
    .from('audios')
    .select('title, category, duration_minutes, audio_url, cover_style')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    wirePlayButtons();
    return;
  }

  data.forEach((audio) => {
    grid.prepend(createCard(audio));
  });
  wirePlayButtons();
};

loadAudios();
