create extension if not exists pgcrypto;

create table public.experiment_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.experiment_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  day_offset integer not null check (day_offset >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  category text not null check (category in ('Hands-on', 'Incubation', 'Assay')),
  protocol_label text,
  protocol_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experiment_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.experiment_templates(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  preferred_start_time time not null,
  avoid_weekends boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scheduled_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.experiment_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_name text not null,
  day_offset integer not null check (day_offset >= 0),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  category text not null check (category in ('Hands-on', 'Incubation', 'Assay')),
  conflict_label text,
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.protocol_links (
  id uuid primary key default gen_random_uuid(),
  step_id uuid references public.workflow_steps(id) on delete cascade,
  run_id uuid references public.experiment_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table public.research_note_links (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.experiment_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index workflow_steps_template_id_idx on public.workflow_steps(template_id);
create index experiment_runs_template_id_idx on public.experiment_runs(template_id);
create index scheduled_events_run_id_idx on public.scheduled_events(run_id);
create index protocol_links_step_id_idx on public.protocol_links(step_id);
create index protocol_links_run_id_idx on public.protocol_links(run_id);
create index research_note_links_run_id_idx on public.research_note_links(run_id);

alter table public.experiment_templates enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.experiment_runs enable row level security;
alter table public.scheduled_events enable row level security;
alter table public.protocol_links enable row level security;
alter table public.research_note_links enable row level security;

create policy "Users can manage their experiment templates"
  on public.experiment_templates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their workflow steps"
  on public.workflow_steps
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their experiment runs"
  on public.experiment_runs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their scheduled events"
  on public.scheduled_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their protocol links"
  on public.protocol_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their research note links"
  on public.research_note_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
