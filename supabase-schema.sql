create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('photo', 'video')),
  caption text not null,
  collection text not null default 'Journal',
  image_url text not null,
  youtube_url text not null default '',
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

alter table public.posts enable row level security;

create policy "Public can view posts"
on public.posts for select
using (true);

create policy "Public can create posts"
on public.posts for insert
with check (true);

create policy "Public can delete posts"
on public.posts for delete
using (true);

create policy "Public can upload media"
on storage.objects for insert
with check (bucket_id = 'media');

create policy "Public can view media"
on storage.objects for select
using (bucket_id = 'media');

create policy "Public can delete media"
on storage.objects for delete
using (bucket_id = 'media');
