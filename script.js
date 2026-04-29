const playButtons = document.querySelectorAll(
  '[data-play], .card-play, .mini-play'
);

playButtons.forEach((button) => {
  button.addEventListener('click', () => {
    playButtons.forEach((item) => {
      if (item !== button) item.classList.remove('is-playing');
    });

    button.classList.toggle('is-playing');
    button.setAttribute(
      'aria-pressed',
      button.classList.contains('is-playing') ? 'true' : 'false'
    );
  });
});

document.querySelector('.carousel-next')?.addEventListener('click', () => {
  const carousel = document.querySelector('.audio-carousel');
  carousel?.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-12px)' },
      { transform: 'translateX(0)' },
    ],
    {
      duration: 380,
      easing: 'ease-out',
    }
  );
});
