-- ============================================================
-- PIMS Knowledge Management v1
-- Simple integration with existing PIMS tables
-- Run in Supabase SQL Editor
-- ============================================================

-- 1) TOPICS
create table if not exists public.knowledge_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) DOCUMENTS
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic_id uuid references public.knowledge_topics(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  doc_type text not null default 'link',
  drive_url text,
  owner text,
  tags text[],
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_documents_topic on public.knowledge_documents(topic_id);
create index if not exists idx_knowledge_documents_project on public.knowledge_documents(project_id);
create index if not exists idx_knowledge_documents_created_at on public.knowledge_documents(created_at desc);

-- 3) LESSONS LEARNED
create table if not exists public.knowledge_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic_id uuid references public.knowledge_topics(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  context text,
  problem text,
  solution text,
  lesson text,
  follow_up text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_lessons_topic on public.knowledge_lessons(topic_id);
create index if not exists idx_knowledge_lessons_project on public.knowledge_lessons(project_id);
create index if not exists idx_knowledge_lessons_created_at on public.knowledge_lessons(created_at desc);

-- 4) UPDATED_AT TRIGGER
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_knowledge_topics_updated_at on public.knowledge_topics;
create trigger trg_knowledge_topics_updated_at
before update on public.knowledge_topics
for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_documents_updated_at on public.knowledge_documents;
create trigger trg_knowledge_documents_updated_at
before update on public.knowledge_documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_lessons_updated_at on public.knowledge_lessons;
create trigger trg_knowledge_lessons_updated_at
before update on public.knowledge_lessons
for each row execute function public.set_updated_at();

-- 5) RLS
alter table public.knowledge_topics enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_lessons enable row level security;

-- Remove old policies if any
 drop policy if exists "knowledge_topics_select_all" on public.knowledge_topics;
 drop policy if exists "knowledge_topics_write_authenticated" on public.knowledge_topics;
 drop policy if exists "knowledge_documents_select_all" on public.knowledge_documents;
 drop policy if exists "knowledge_documents_write_authenticated" on public.knowledge_documents;
 drop policy if exists "knowledge_lessons_select_all" on public.knowledge_lessons;
 drop policy if exists "knowledge_lessons_write_authenticated" on public.knowledge_lessons;

-- v1 simple: authenticated users can read/write
create policy "knowledge_topics_select_all"
  on public.knowledge_topics for select
  using (true);

create policy "knowledge_topics_write_authenticated"
  on public.knowledge_topics for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "knowledge_documents_select_all"
  on public.knowledge_documents for select
  using (true);

create policy "knowledge_documents_write_authenticated"
  on public.knowledge_documents for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "knowledge_lessons_select_all"
  on public.knowledge_lessons for select
  using (true);

create policy "knowledge_lessons_write_authenticated"
  on public.knowledge_lessons for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 6) seed topics
insert into public.knowledge_topics (name, description)
values
  ('IUU Fishing', 'Pengetahuan terkait illegal fishing, patroli, temuan, dan tindak lanjut'),
  ('HAM', 'Catatan isu hak asasi manusia dan perlindungan kelompok rentan'),
  ('Lingkungan', 'Pengetahuan terkait konservasi, pencemaran, dan isu lingkungan pesisir'),
  ('Advokasi', 'Strategi, hasil, dan pembelajaran advokasi kebijakan'),
  ('Wilayah', 'Pengetahuan berbasis lokasi atau provinsi')
on conflict (name) do nothing;
