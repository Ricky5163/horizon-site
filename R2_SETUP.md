# Horizon audio storage with Cloudflare R2

Use R2 for the audio files and Supabase for the audio catalog.

## 1. Create the R2 bucket

Create a Cloudflare R2 bucket named:

```txt
horizon-audios
```

Connect a public custom domain to the bucket, for example:

```txt
audio.horizonaudios.com
```

The site stores this final public URL in Supabase:

```txt
https://audio.horizonaudios.com/audios/example.mp3
```

## 2. Create the upload Worker

Create a Cloudflare Worker using `workers/r2-audio-upload-worker.js`.

Add an R2 binding:

```txt
Binding name: AUDIO_BUCKET
Bucket: horizon-audios
```

Add Worker variables:

```txt
SUPABASE_URL=https://lauzvzwhfoqmjhzmigxr.supabase.co
SUPABASE_ANON_KEY=<same anon key from supabase-config.js>
ADMIN_EMAILS=admin@horizon.pt
ALLOWED_ORIGINS=https://horizonaudios.com
R2_PUBLIC_BASE_URL=https://audio.horizonaudios.com
```

Then expose the Worker at a route or custom domain, for example:

```txt
https://upload.horizonaudios.com/upload
```

## 3. Connect the dashboard

Update `supabase-config.js`:

```js
export const R2_UPLOAD_ENDPOINT = 'https://upload.horizonaudios.com/upload';
```

The admin dashboard will upload the audio file to R2, then insert the catalog row in Supabase.

## 4. Supabase

Run `supabase-admin.sql` in the Supabase SQL editor. The `audios` table stores:

- title
- category
- duration
- public R2 URL
- R2 object key
- publish state
