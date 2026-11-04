-- ContaKM: tabelle per salvare online uscite, bici e impostazioni di chi accede con Google.
-- Da incollare una volta in Supabase → SQL Editor → Run. Si può rieseguire senza danni.
--
-- Ogni riga appartiene a un utente (user_id) e le regole RLS fanno vedere e modificare
-- a ciascuno solo le proprie. I dati restano anche sul telefono: questo è la copia online.

-- ---------- Tabelle ----------

create table if not exists public.rides (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  started_at  bigint      not null,              -- id dell'uscita: inizio in millisecondi
  data        jsonb       not null,              -- tutta l'uscita, traccia compresa
  deleted     boolean     not null default false, -- eliminata su un telefono: va tolta anche dagli altri
  updated_at  timestamptz not null default now(),
  primary key (user_id, started_at)
);

create table if not exists public.bikes (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  data        jsonb       not null,              -- dati della bici e manutenzione
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.settings (
  user_id     uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb       not null,              -- preferenze e luoghi preferiti
  updated_at  timestamptz not null default now()
);

create index if not exists rides_user_updated on public.rides (user_id, updated_at);
create index if not exists bikes_user_updated on public.bikes (user_id, updated_at);

-- updated_at lo decide sempre il server: serve per scaricare solo le novità.
create or replace function public.contakm_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rides_touch on public.rides;
create trigger rides_touch before insert or update on public.rides
  for each row execute function public.contakm_touch();
drop trigger if exists bikes_touch on public.bikes;
create trigger bikes_touch before insert or update on public.bikes
  for each row execute function public.contakm_touch();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before insert or update on public.settings
  for each row execute function public.contakm_touch();

-- ---------- Ognuno vede solo i propri dati ----------

alter table public.rides    enable row level security;
alter table public.bikes    enable row level security;
alter table public.settings enable row level security;

drop policy if exists "solo le proprie uscite" on public.rides;
create policy "solo le proprie uscite" on public.rides
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "solo le proprie bici" on public.bikes;
create policy "solo le proprie bici" on public.bikes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "solo le proprie impostazioni" on public.settings;
create policy "solo le proprie impostazioni" on public.settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.rides, public.bikes, public.settings from anon;
grant select, insert, update, delete on public.rides, public.bikes, public.settings to authenticated;

-- ---------- Cancellazione dell'account (richiesta dal Play Store) ----------
-- Cancella l'utente che la chiama: con lui spariscono uscite, bici e impostazioni (on delete cascade).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Accesso richiesto';
  end if;
  delete from public.rides where user_id = uid;
  delete from public.bikes where user_id = uid;
  delete from public.settings where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
