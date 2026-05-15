import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';
import { STRIPE_PAYMENT_LINKS } from './stripe-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const message = document.querySelector('[data-plan-message]');
const checkoutButtons = document.querySelectorAll('[data-stripe-plan]');
const params = new URLSearchParams(window.location.search);
const pageMode = document.body.dataset.stripeMode || params.get('stripe') || 'live';
const stripeMode = pageMode === 'test' ? 'test' : 'live';

const setMessage = (text, type = 'info') => {
  if (!message) return;
  message.textContent = text;
  message.dataset.type = type;
};

const checkoutUrlFor = (link, session) => {
  const url = new URL(link);
  if (session?.user?.email) url.searchParams.set('prefilled_email', session.user.email);
  if (session?.user?.id) url.searchParams.set('client_reference_id', session.user.id);
  url.searchParams.set('locale', 'pt');
  return url.href;
};

const startCheckout = async (plan) => {
  const paymentLink = STRIPE_PAYMENT_LINKS[stripeMode]?.[plan];

  if (!paymentLink) {
    const label = stripeMode === 'test' ? 'de teste' : 'real';
    setMessage(`Cria o Payment Link ${label} no Stripe e cola o URL em stripe-config.js para ativar este plano.`, 'error');
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    localStorage.setItem('horizon_checkout_plan', plan);
    window.location.href = 'entrar.html';
    return;
  }

  try {
    localStorage.setItem('horizon_checkout_plan', plan);
    localStorage.setItem('horizon_checkout_mode', stripeMode);
    window.location.href = checkoutUrlFor(paymentLink, data.session);
  } catch (error) {
    setMessage('O link Stripe deste plano ainda nao esta valido. Confirma o URL em stripe-config.js.', 'error');
  }
};

checkoutButtons.forEach((button) => {
  button.addEventListener('click', () => startCheckout(button.dataset.stripePlan));
});

const pendingCheckout = params.get('checkout');
if (pendingCheckout) {
  startCheckout(pendingCheckout);
}
