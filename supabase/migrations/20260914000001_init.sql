-- 速報公開のためのテーブル。
--
-- ADR-0003：同期は運営端末からサーバへの一方向・全量スナップショット。
-- サーバはロジックを持たない。受け取ったものを閲覧ページとして配信するだけ。
--
-- **大会データの正は端末内にある。** ここにあるのは公開用の複製にすぎない。
-- サーバが落ちても大会運営には影響しない。

create table if not exists public.tournaments (
  -- 大会ID。端末側で生成したものをそのまま使う。
  id           text primary key,
  -- 一覧と検索用。スナップショットからの抜き出し。
  name         text not null,
  date         text not null,
  venue        text not null default '',
  -- 更新用トークンのハッシュ。端末内データは暗号化しない（N-6-1）。
  -- これを失っても大会運営には影響しない。速報の更新が止まるだけ。
  token_hash   text not null,
  -- 公開しているか。運営者がいつでも止められる。
  published    boolean not null default true,
  -- 大会データの全量。個人情報は**端末側で絞ってから**送る。
  snapshot     jsonb not null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists tournaments_date_idx on public.tournaments (date desc);

alter table public.tournaments enable row level security;

-- 閲覧は誰でも。公開中のものだけ。
drop policy if exists tournaments_read on public.tournaments;
create policy tournaments_read
  on public.tournaments
  for select
  using (published = true);

-- 書き込みは RPC 経由のみ。テーブルへの直接の insert/update は許さない。

-- ---------------------------------------------------------------------------
-- 公開（アップサート）
-- ---------------------------------------------------------------------------

create or replace function public.publish_tournament(
  p_id         text,
  p_name       text,
  p_date       text,
  p_venue      text,
  p_token      text,
  p_snapshot   jsonb
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_existing text;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'トークンが短すぎます';
  end if;

  select token_hash into v_existing from public.tournaments where id = p_id;

  if v_existing is null then
    insert into public.tournaments (id, name, date, venue, token_hash, snapshot)
    values (p_id, p_name, p_date, coalesce(p_venue, ''), v_hash, p_snapshot);
  elsif v_existing = v_hash then
    update public.tournaments
       set name = p_name,
           date = p_date,
           venue = coalesce(p_venue, ''),
           snapshot = p_snapshot,
           updated_at = now()
     where id = p_id;
  else
    raise exception 'この大会を更新する権限がありません';
  end if;
end;
$$;

-- 公開の停止・再開。
create or replace function public.set_tournament_published(
  p_id text,
  p_token text,
  p_published boolean
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
begin
  update public.tournaments
     set published = p_published, updated_at = now()
   where id = p_id and token_hash = v_hash;
  if not found then
    raise exception 'この大会を更新する権限がありません';
  end if;
end;
$$;

grant execute on function public.publish_tournament(text, text, text, text, text, jsonb) to anon;
grant execute on function public.set_tournament_published(text, text, boolean) to anon;
