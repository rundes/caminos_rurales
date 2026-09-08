-- Alta y edición de tramos (ola 2, producto).
-- 1. `tramos` deja de ser de solo lectura para municipio/auditor: se agregan
--    las políticas `tramos_insert_gestion` y `tramos_update_gestion`, mismo
--    patrón que `caminos_insert`/`caminos_update` (0001) — `rol_actual() in
--    ('municipio', 'auditor')` y `municipio = municipio_actual()` en ambas
--    (`using` y `with check`), así que una sesión de gestión no puede crear
--    ni mover un tramo hacia otro municipio.
-- 2. Sin política de `delete`: un tramo con historial de cobertura
--    (`cobertura_tramos`, `muestras_sensor`, `fallas_deteccion`, `cuadros`
--    referencian su `id`) no puede desaparecer y arrastrar el significado de
--    ese historial con él (los `on delete set null`/`on delete cascade` de
--    esas tablas convertirían un borrado en una corrupción silenciosa de
--    datos ya existentes). En su lugar, columna `activo boolean default
--    true`.
--
--    Semántica de `activo` (documentada acá porque no hay otro lugar mejor):
--    un tramo desactivado (camino cerrado, tramo duplicado por un error de
--    carga, fusionado con otro) deja de contar en todo lo que enumera "los
--    tramos del municipio" para decidir qué falta cubrir o mostrar en el
--    mapa operativo:
--      - `cobertura_municipio` (denominador de la cobertura: tramos, km,
--        cubiertos) filtra `tr.activo`.
--      - `lib/tramos-consultas.ts` (lista "Tramos" del dashboard) y
--        `lib/cobertura-consultas.ts` (capa de tramos del mapa) filtran
--        `activo = true` en la consulta a `tramos`.
--    Lo que NO cambia: el historial ya registrado contra ese `id` de tramo.
--    `rugosidad_tramos` y `cuadros_por_tramo` agregan `muestras_sensor` y
--    `cuadros` — filas que ya existen, atadas a un `tramo_id` concreto — y
--    unen `tramos` solo para acotar por municipio, no para enumerar "todos
--    los tramos"; por eso deliberadamente NO filtran por `activo`: desactivar
--    un tramo no debe borrar ni ocultar la rugosidad o las fotos que ya se
--    juntaron ahí. La página de detalle (`/dashboard/tramos/<id>`) tampoco
--    filtra por `activo` (sigue accesible por link directo, con una etiqueta
--    "Inactivo"): es donde se ve y se puede reactivar un tramo dado de baja.
--    En resumen: `activo` gobierna qué cuenta y qué se lista hacia adelante;
--    nunca oculta lo que ya pasó.
-- 3. Columnas de auditoría `creado_por uuid` y `actualizado_at timestamptz`,
--    más un trigger que las sella y bloquea cualquier cambio de fila que no
--    venga de municipio/auditor (mismo patrón defensivo que
--    `fallas_estado_no_escalar`, 0010: RLS ya lo exige vía `using`, el
--    trigger es la segunda barrera si una política futura amplía el update).
-- Requiere haber aplicado antes 0010_estado_observaciones.sql.

-- 1. COLUMNAS NUEVAS
alter table public.tramos
  add column if not exists activo boolean not null default true,
  add column if not exists creado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists actualizado_at timestamptz;

create index if not exists tramos_activo_idx on public.tramos (municipio, activo);

-- 2. RLS: alta y edición para municipio/auditor, sin delete
drop policy if exists "tramos_insert_gestion" on public.tramos;
create policy "tramos_insert_gestion" on public.tramos
  for insert to authenticated
  with check (
    public.rol_actual() in ('municipio', 'auditor')
    and municipio = public.municipio_actual()
  );

drop policy if exists "tramos_update_gestion" on public.tramos;
create policy "tramos_update_gestion" on public.tramos
  for update to authenticated
  using (
    public.rol_actual() in ('municipio', 'auditor')
    and municipio = public.municipio_actual()
  )
  with check (
    public.rol_actual() in ('municipio', 'auditor')
    and municipio = public.municipio_actual()
  );

-- 3. TRIGGER: sella auditoría y bloquea cambios fuera de municipio/auditor
create or replace function public.tramos_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.actualizado_at := now();
    return new;
  end if;

  -- UPDATE: blindaje mirror de `fallas_estado_no_escalar` (0010). RLS
  -- (`tramos_update_gestion`) ya exige rol_actual() in ('municipio',
  -- 'auditor'); esto es la segunda barrera si una política futura amplía el
  -- update. Se salta cuando no hay sesión (`auth.uid() is null`): la clave
  -- secreta (siembra, `scripts/seed-tramos.mjs`) conserva control total.
  if auth.uid() is not null and public.rol_actual() not in ('municipio', 'auditor') then
    raise exception 'Solo municipio o auditor pueden modificar un tramo'
      using errcode = '42501';
  end if;

  new.creado_por := old.creado_por; -- inmutable una vez creado
  new.actualizado_at := now();
  return new;
end;
$$;

drop trigger if exists tramos_auditoria on public.tramos;
create trigger tramos_auditoria
  before insert or update on public.tramos
  for each row
  execute function public.tramos_auditoria();

-- 4. COBERTURA_MUNICIPIO: el denominador (tramos, km, cubiertos) cuenta solo
-- tramos activos (ver semántica en el punto 2).
create or replace function public.cobertura_municipio(p_municipio text)
returns table (localidad text, tramos integer, cubiertos integer, km numeric, km_cubiertos numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_municipio is distinct from public.municipio_actual() then return; end if;

  return query
  with t as (
    select
      tr.localidad as loc,
      tr.km as km,
      exists (select 1 from public.cobertura_tramos c where c.tramo_id = tr.id) as cubierto
    from public.tramos tr
    where tr.municipio = p_municipio and tr.activo
  )
  select
    t.loc,
    count(*)::integer,
    count(*) filter (where t.cubierto)::integer,
    round(sum(t.km), 1),
    coalesce(round(sum(t.km) filter (where t.cubierto), 1), 0)
  from t
  group by t.loc
  order by t.loc;
end;
$$;

-- `rugosidad_tramos` y `cuadros_por_tramo` (docs/database-schema.sql,
-- secciones 11) quedan sin cambios a propósito: agregan sobre historial ya
-- registrado (`muestras_sensor`/`cuadros`) por `tramo_id`, no enumeran "los
-- tramos del municipio" — desactivar un tramo no debe ocultar esas filas. Ver
-- el punto 2 de este comentario para la semántica completa.

-- 5. search_path fijo en la función nueva (0008, sección 7: todas las
-- security definer de public lo fijan; `tramos_auditoria` ya lo trae arriba,
-- este bloque es solo para que una reaplicación de 0008 sobre esta migración
-- no la deje afuera).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.firma);
  end loop;
end;
$$;
