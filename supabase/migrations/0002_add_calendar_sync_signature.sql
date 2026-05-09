alter table public.experiment_runs
  add column if not exists sync_signature text;

create unique index if not exists experiment_runs_user_sync_signature_idx
  on public.experiment_runs (user_id, sync_signature)
  where sync_signature is not null;
