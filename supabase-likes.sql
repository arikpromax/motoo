-- ============================================================
-- MOTO MARKET WEST — спільні лічильники вподобань.
--
-- ДЕ ЦЕ ЗАПУСКАТИ:
--   Новий проєкт створювати НЕ ТРЕБА. Запускайте цей файл у вже
--   існуючому проєкті платформи (ortiatyxntdikaldepbp) —
--   Supabase Dashboard → SQL Editor → New query → вставити → Run.
--
--   Таблиця ключується по сайту, тому та сама база обслуговує
--   всі сайти платформи: motomarket, sushiboom, leleki і наступні.
--
-- ПІСЛЯ ЗАПУСКУ:
--   Project Settings → API → скопіювати "Project URL" і ключ
--   "anon public" у блок LIKES угорі app.js. Все.
-- ============================================================

-- лічильники: один рядок на позицію конкретного сайту
create table if not exists public.likes (
  site  text    not null,
  id    text    not null,
  count integer not null default 0,
  primary key (site, id)
);

-- читати може будь-хто, писати — тільки через функцію нижче
alter table public.likes enable row level security;

drop policy if exists "likes are public" on public.likes;
create policy "likes are public" on public.likes for select using (true);

-- атомарний +1 / -1: рахує сам сервер, тож два одночасні кліки не загубляться
create or replace function public.bump_like(site text, item text, delta int)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare c integer;
begin
  -- захист від накрутки чужим скриптом: приймаємо тільки +1 і -1
  if delta not in (-1, 1) then
    raise exception 'delta must be -1 or 1';
  end if;

  insert into public.likes (site, id, count)
  values (site, item, greatest(delta, 0))
  on conflict (site, id) do update
    set count = greatest(public.likes.count + delta, 0)
  returning count into c;

  return c;
end $$;

grant execute on function public.bump_like(text, text, int) to anon;
