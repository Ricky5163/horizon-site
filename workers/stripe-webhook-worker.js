const textEncoder = new TextEncoder();

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const toHex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const toBase64 = (buffer) => {
  let binary = '';
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const timingSafeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const parseStripeSignature = (header) =>
  header.split(',').reduce(
    (acc, item) => {
      const [key, value] = item.split('=');
      if (key === 't') acc.timestamp = value;
      if (key === 'v1') acc.signatures.push(value);
      return acc;
    },
    { timestamp: '', signatures: [] },
  );

const verifyStripeSignature = async (payload, signatureHeader, webhookSecret) => {
  if (!signatureHeader || !webhookSecret) return false;

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  const receivedAt = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);

  if (!receivedAt || Math.abs(now - receivedAt) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signedPayload = `${timestamp}.${payload}`;
  const expected = toHex(await crypto.subtle.sign('HMAC', key, textEncoder.encode(signedPayload)));

  return signatures.some((signature) => timingSafeEqual(signature, expected));
};

const verifyAnyStripeSignature = async (payload, signatureHeader, env) => {
  const secrets = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_TEST_WEBHOOK_SECRET].filter(Boolean);

  for (const secret of secrets) {
    if (await verifyStripeSignature(payload, signatureHeader, secret)) return true;
  }

  return false;
};

const encryptionKey = async (secret) => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt']);
};

const encryptValue = async (value, env) => {
  if (!value) return null;
  if (!env.DATA_ENCRYPTION_KEY) throw new Error('DATA_ENCRYPTION_KEY is missing.');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env.DATA_ENCRYPTION_KEY);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(String(value)),
  );

  return {
    alg: 'AES-GCM',
    key_version: env.DATA_ENCRYPTION_KEY_VERSION || 'v1',
    iv: toBase64(iv),
    data: toBase64(encrypted),
  };
};

const supabaseFetch = async (env, path, options = {}) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase error ${response.status}: ${error}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

const hasProcessedEvent = async (event, env) => {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(event.id)}&select=event_id`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );

  if (!response.ok) throw new Error(`Could not check Stripe event: ${await response.text()}`);
  const rows = await response.json();
  return rows.length > 0;
};

const markEventProcessed = async (event, env) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/stripe_webhook_events`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      event_id: event.id,
      event_type: event.type,
    }),
  });

  if (response.status === 409) return;
  if (!response.ok) throw new Error(`Could not register Stripe event: ${await response.text()}`);
};

const planFromSession = (session, env) => {
  const amount = Number(session.amount_total || 0);
  const currency = String(session.currency || '').toLowerCase();
  const paymentLink = String(session.payment_link || '');
  const plusAmount = Number(env.PLUS_AMOUNT_CENTS || 999);
  const annualAmount = Number(env.ANNUAL_AMOUNT_CENTS || 7999);
  const expectedCurrency = String(env.STRIPE_CURRENCY || 'eur').toLowerCase();

  if (paymentLink && paymentLink === env.STRIPE_PLUS_PAYMENT_LINK_ID) return 'plus';
  if (paymentLink && paymentLink === env.STRIPE_ANNUAL_PAYMENT_LINK_ID) return 'annual';
  if (currency === expectedCurrency && amount === plusAmount) return 'plus';
  if (currency === expectedCurrency && amount === annualAmount) return 'annual';
  return 'plus';
};

const upsertSubscription = async (env, payload) =>
  supabaseFetch(env, 'user_subscriptions?on_conflict=user_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });

const updateSubscriptionByStripeId = async (env, subscription) => {
  const stripeId = encodeURIComponent(`eq.${subscription.id}`);
  return supabaseFetch(env, `user_subscriptions?stripe_subscription_id=${stripeId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: subscription.status || 'unknown',
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    }),
  });
};

const emailHtml = ({ plan, amount, currency }) => {
  const planName = plan === 'annual' ? 'Horizon Anual' : 'Horizon Plus';
  const price = amount ? `${(amount / 100).toFixed(2)} ${String(currency || 'EUR').toUpperCase()}` : '';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#020914;color:#f7f9ff;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:34px 22px;">
      <div style="text-align:center;margin-bottom:28px;">
        <img src="https://horizonaudios.com/assets/horizon-mark-blue.png" width="78" height="78" alt="Horizon" style="border-radius:50%;display:inline-block;">
        <h1 style="font-family:Georgia,serif;letter-spacing:8px;font-size:32px;margin:18px 0 4px;">HORIZON</h1>
        <p style="letter-spacing:3px;font-size:11px;color:#94c2ff;margin:0;">O TEU ESPACO INTERIOR</p>
      </div>
      <div style="background:#061936;border:1px solid rgba(126,174,255,.3);border-radius:14px;padding:28px;">
        <h2 style="margin:0 0 12px;font-size:24px;">A tua subscricao esta ativa.</h2>
        <p style="line-height:1.7;color:#dbe7ff;margin:0 0 18px;">Obrigado por subscreveres o ${planName}. O teu acesso Horizon foi atualizado e podes voltar ao teu dashboard para continuar a tua pratica.</p>
        <p style="line-height:1.7;color:#dbe7ff;margin:0 0 22px;"><strong>Plano:</strong> ${planName}<br><strong>Valor:</strong> ${price}</p>
        <a href="https://horizonaudios.com/conta.html" style="display:inline-block;background:#2377dc;color:#fff;text-decoration:none;border-radius:999px;padding:14px 22px;font-weight:700;">Abrir dashboard</a>
      </div>
      <p style="color:#aebbd4;font-size:12px;line-height:1.6;margin-top:20px;text-align:center;">Se tiveres alguma pergunta, escreve para suporte@horizonaudios.com.</p>
    </div>
  </body>
</html>`;
};

const sendConfirmationEmail = async (env, to, order) => {
  if (!env.RESEND_API_KEY || !to) return;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Horizon <info@horizonaudios.com>',
      to: [to],
      subject: 'Confirmacao da tua subscricao Horizon',
      html: emailHtml(order),
    }),
  });

  if (!response.ok) throw new Error(`Resend error ${response.status}: ${await response.text()}`);
};

const handleCheckoutCompleted = async (event, env) => {
  const session = event.data.object;
  const userId = session.client_reference_id;
  if (!userId) throw new Error('checkout.session.completed missing client_reference_id.');

  const plan = planFromSession(session, env);
  const customerEmail = session.customer_details?.email || session.customer_email || '';
  const customerName = session.customer_details?.name || '';

  await upsertSubscription(env, {
    user_id: userId,
    plan,
    status: 'active',
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: session.subscription || null,
    stripe_payment_link_id: session.payment_link || null,
    stripe_checkout_session_id: session.id,
    encrypted_customer_email: await encryptValue(customerEmail, env),
    encrypted_customer_name: await encryptValue(customerName, env),
    last_event_id: event.id,
    updated_at: new Date().toISOString(),
  });

  try {
    await sendConfirmationEmail(env, customerEmail, {
      plan,
      amount: session.amount_total,
      currency: session.currency,
    });
  } catch (error) {
    console.error(error);
  }
};

const handleSubscriptionEvent = async (event, env) => {
  const subscription = event.data.object;
  await updateSubscriptionByStripeId(env, subscription);
};

export default {
  async fetch(request, env) {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

      const payload = await request.text();
      const stripeSignature = request.headers.get('Stripe-Signature') || '';
      const verified = await verifyAnyStripeSignature(payload, stripeSignature, env);
      if (!verified) return json({ error: 'Invalid Stripe signature' }, 400);

      const event = JSON.parse(payload);
      if (await hasProcessedEvent(event, env)) return json({ received: true, duplicate: true });

      if (event.type === 'checkout.session.completed') {
        await handleCheckoutCompleted(event, env);
      }

      if (
        event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        await handleSubscriptionEvent(event, env);
      }

      await markEventProcessed(event, env);
      return json({ received: true });
    } catch (error) {
      console.error(error);
      return json({ error: error.message || 'Webhook failed' }, 500);
    }
  },
};
