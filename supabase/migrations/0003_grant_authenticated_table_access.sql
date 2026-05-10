grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.experiment_templates to authenticated;
grant select, insert, update, delete on table public.workflow_steps to authenticated;
grant select, insert, update, delete on table public.experiment_runs to authenticated;
grant select, insert, update, delete on table public.scheduled_events to authenticated;
grant select, insert, update, delete on table public.protocol_links to authenticated;
grant select, insert, update, delete on table public.research_note_links to authenticated;
