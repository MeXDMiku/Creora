# Setting up image storage

**One-time, in Supabase. Ten minutes. Nothing in the app works for uploads until
this is done — and until it is, the Image block says so in plain words rather
than failing silently.**

Images by *address* work right now with no setup at all: paste a link, wire a
Database column into the block, point it at a Live Data field. This page is only
about **uploading files**.

---

## What you are creating

One bucket, called **`creora-images`**. The name is in
`src/lib/images.ts` as `IMAGE_BUCKET` — if you change it there, change it here.

The bucket must be **public**. Public means "anyone with the exact address can
view the file", which is what a picture on a website is. It does **not** mean
anyone can upload; that is decided separately, below, and it is the part worth
thinking about.

---

## Step 1 — create the bucket

Supabase dashboard → **Storage** → **New bucket**:

| field | value |
| :--- | :--- |
| Name | `creora-images` |
| Public bucket | **on** |
| File size limit | `5 MB` |
| Allowed MIME types | `image/png, image/jpeg, image/gif, image/webp, image/avif, image/svg+xml` |

Or run this in the **SQL Editor**, which does the same thing and is repeatable:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creora-images',
  'creora-images',
  true,
  5242880,
  array['image/png','image/jpeg','image/gif','image/webp','image/avif','image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = excluded.allowed_mime_types;
```

**Set the size and type limits on the bucket even though the app already checks
them.** The app's check is a courtesy that gives a good error message. The
bucket's check is the one that holds when somebody skips the app entirely.

---

## Step 2 — let people read

```sql
create policy "creora images are readable by anyone"
on storage.objects for select
using (bucket_id = 'creora-images');
```

---

## Step 3 — decide who may upload

**This is the decision. Read both.**

### Option A — signed-in sessions only *(start here)*

```sql
create policy "signed-in sessions may upload creora images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'creora-images');
```

Uploading from the editor works. **Visitor uploads on published pages also work**,
because Creora gives every visitor an anonymous Supabase session, and an
anonymous session still counts as `authenticated`. So this is not as restrictive
as it sounds — it stops someone with nothing but your project URL and the
publishable key, and not much more.

### Option B — genuinely anyone

```sql
create policy "anyone may upload creora images"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'creora-images');
```

Only if something breaks under A. The bucket's size and type limits still apply,
so the worst case is someone filling your 1GB of free storage with legitimate-
looking images. That is a real cost, and it is yours.

**Neither option lets anyone overwrite or delete an existing file**, because no
`update` or `delete` policy is created. That is deliberate: it means an upload
can never destroy a picture already on a live page. The cost is that unused
images accumulate — cleaning them up is in BACKLOG.md and is not urgent until
storage is actually filling.

---

## Step 4 — check it

In the editor, drop in an Image block and press **Upload**.

| what you see | what it means |
| :--- | :--- |
| The picture appears | Done. |
| "The image store has not been set up yet…" | Step 1 did not take — the bucket name does not match. |
| "…is refusing uploads" | Step 3 is missing, or you are testing signed-out under Option A. |
| "…did not give back an address" | The bucket is not public. Step 1, the `public` flag. |
| "…rejected that file for being too big" | The bucket's own limit is lower than the file. |

---

## What this costs

Supabase free tier: **1GB stored, 5GB egress a month**. A 5MB ceiling per file
means roughly 200 full-size images, or a few thousand sensibly-sized ones. Egress
is usually what runs out first on a page that gets traffic — a photo-heavy page
seen 10,000 times is not free. Worth knowing before a page goes anywhere.
