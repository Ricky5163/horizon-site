# Horizon Stripe webhook + Resend

Este setup liga pagamentos Stripe a Supabase e envia email automatico via Resend.

## 1. Supabase

No SQL Editor da Supabase, corre o ficheiro:

```sql
supabase-stripe.sql
```

Isto cria:

- `public.user_subscriptions`: plano ativo do utilizador.
- `public.stripe_webhook_events`: eventos Stripe ja processados.
- RLS para o utilizador so ler a propria subscricao.

Os dados sensiveis recebidos do Stripe, como email e nome do cliente, entram cifrados nas colunas `encrypted_customer_email` e `encrypted_customer_name`.

## 2. Cloudflare Worker

Cria um Worker chamado:

```text
horizon-stripe-webhook
```

Cola o codigo de:

```text
workers/stripe-webhook-worker.js
```

Depois cria um dominio/route, por exemplo:

```text
https://stripe.horizonaudios.com
```

O endpoint do webhook sera:

```text
https://stripe.horizonaudios.com/
```

## 3. Secrets do Worker

Em Cloudflare Workers > Settings > Variables and Secrets, adiciona como **Secret**:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_TEST_WEBHOOK_SECRET
DATA_ENCRYPTION_KEY
RESEND_API_KEY
```

Valores normais/variaveis:

```text
STRIPE_CURRENCY=eur
PLUS_AMOUNT_CENTS=999
ANNUAL_AMOUNT_CENTS=7999
DATA_ENCRYPTION_KEY_VERSION=v1
```

O `DATA_ENCRYPTION_KEY` deve ser uma frase longa e aleatoria. Guarda-a fora do chat e nao a percas; sem ela, os dados cifrados antigos nao podem ser recuperados.

Opcional, mas recomendado:

```text
STRIPE_PLUS_PAYMENT_LINK_ID=plink_...
STRIPE_ANNUAL_PAYMENT_LINK_ID=plink_...
```

Se nao preencheres estes dois, o Worker identifica o plano pelo valor pago: 999 centimos para Plus e 7999 centimos para Anual.

## 4. Stripe

No Stripe Dashboard, cria um webhook endpoint:

```text
https://stripe.horizonaudios.com/
```

Seleciona estes eventos:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Depois copia o **Signing secret** do webhook e coloca em:

```text
STRIPE_WEBHOOK_SECRET
```

Para testar antes de usar pagamentos reais, muda o Stripe para **Test mode**, cria outro webhook endpoint com o mesmo URL e copia o signing secret de teste para:

```text
STRIPE_TEST_WEBHOOK_SECRET
```

O Worker aceita o secret real e o secret de teste, por isso podes validar o fluxo primeiro e manter a configuracao real preparada.

## 5. Resend

Confirma que o dominio `horizonaudios.com` esta verificado no Resend e que podes enviar com:

```text
info@horizonaudios.com
```

O Worker envia o email:

```text
from: Horizon <info@horizonaudios.com>
subject: Confirmacao da tua subscricao Horizon
```

## 6. Teste

1. No Stripe em **Test mode**, cria dois Payment Links de teste: Plus mensal e Anual.
2. Cola os links de teste em `stripe-config.js`, dentro de `STRIPE_PAYMENT_LINKS.test`.
3. Abre `https://horizonaudios.com/planos-teste.html`.
4. Entra no site com uma conta de utilizador.
5. Compra com um cartao de teste Stripe, por exemplo `4242 4242 4242 4242`.
6. Stripe chama o Worker.
7. Supabase atualiza `user_subscriptions`.
8. Resend envia o email de confirmacao.
9. O dashboard passa a mostrar Plus ou Anual.
