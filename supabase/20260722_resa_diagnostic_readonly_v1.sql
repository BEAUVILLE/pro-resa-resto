begin transaction read only;

set local statement_timeout = '30s';

-- DIGIY PRO RESA — DIAGNOSTIC PRODUCTION V1 — LECTURE SEULE
-- Aucun téléphone, PIN, nom, slug ou profil d'abonné dans ce fichier.
-- Aucune création, modification ou suppression.
-- Objectif : confirmer le rail cloud de la fiche établissement RESA.

-- 01. Fonctions d'accès et fonctions RESA réellement installées.
select
  '01_FONCTIONS' as section,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname in (
      'digiy_verify_pin',
      'digiy_has_access',
      'digiy_has_module_access_from_abos',
      'digiy_resa_get_bookings_by_day'
    )
    or p.proname ilike '%resa%'
    or p.proname ilike '%booking%'
    or p.proname ilike '%reservation%'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 02. Relations liées à RESA.
select
  '02_RELATIONS' as section,
  n.nspname as schema_name,
  c.relname as relation_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'f' then 'foreign_table'
    else c.relkind::text
  end as relation_type,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p','v','m','f')
  and (
    c.relname ilike '%resa%'
    or c.relname ilike '%booking%'
    or c.relname ilike '%reservation%'
  )
order by c.relname;

-- 03. Colonnes.
select
  '03_COLONNES' as section,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    table_name ilike '%resa%'
    or table_name ilike '%booking%'
    or table_name ilike '%reservation%'
  )
order by table_name, ordinal_position;

-- 04. Contraintes.
select
  '04_CONTRAINTES' as section,
  rel.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and (
    rel.relname ilike '%resa%'
    or rel.relname ilike '%booking%'
    or rel.relname ilike '%reservation%'
  )
order by rel.relname, con.conname;

-- 05. RLS et politiques.
select
  '05_RLS' as section,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and (
    c.relname ilike '%resa%'
    or c.relname ilike '%booking%'
    or c.relname ilike '%reservation%'
  )
order by c.relname;

select
  '06_POLITIQUES' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    tablename ilike '%resa%'
    or tablename ilike '%booking%'
    or tablename ilike '%reservation%'
  )
order by tablename, policyname;

-- 07. Triggers.
select
  '07_TRIGGERS' as section,
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and (
    event_object_table ilike '%resa%'
    or event_object_table ilike '%booking%'
    or event_object_table ilike '%reservation%'
  )
order by event_object_table, trigger_name, event_manipulation;

-- 08. Droits des rôles web.
select
  '08_DROITS_TABLES' as section,
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','public')
  and (
    table_name ilike '%resa%'
    or table_name ilike '%booking%'
    or table_name ilike '%reservation%'
  )
order by table_name, grantee, privilege_type;

select
  '09_DROITS_FONCTIONS' as section,
  grantee,
  routine_name,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and grantee in ('anon','authenticated','public')
  and (
    routine_name ilike '%resa%'
    or routine_name ilike '%booking%'
    or routine_name ilike '%reservation%'
    or routine_name in (
      'digiy_verify_pin',
      'digiy_has_access',
      'digiy_has_module_access_from_abos'
    )
  )
order by routine_name, grantee;

-- 10. Résumé canonique utilisé par le frontend actuel.
select
  '10_RESUME' as section,
  to_regprocedure('public.digiy_verify_pin(text,text,text)') is not null
    as verify_pin_text_text_text,
  to_regprocedure('public.digiy_has_access(text,text)') is not null
    as has_access_text_text,
  to_regprocedure('public.digiy_has_module_access_from_abos(text,text)') is not null
    as abos_access_text_text,
  to_regprocedure('public.digiy_resa_get_bookings_by_day(text,date)') is not null
    as bookings_by_day_text_date,
  to_regclass('public.digiy_resa_public_fiches') is not null
    as public_fiches_present,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ilike '%resa%'
      and (
        p.proname ilike '%save%'
        or p.proname ilike '%upsert%'
        or p.proname ilike '%publish%'
        or p.proname ilike '%fiche%'
        or p.proname ilike '%establishment%'
        or p.proname ilike '%business%'
      )
  ) as resa_save_or_publish_rpc_present;

rollback;
