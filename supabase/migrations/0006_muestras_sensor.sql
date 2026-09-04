-- Muestras de sensores del celular durante el recorrido.
-- Cada fila es un segmento agregado (5 s o 100 m) con rugosidad, velocidad y
-- calidad estimada. Los impactos no viven acá: se guardan como observaciones
-- en `fallas_deteccion` con `origen = 'sensor'`.
-- Requiere haber aplicado antes 0006a_enums_sensor.sql.

-- 1. TABLA
create table if not exists public.muestras_sensor (
  id uuid primary key default gen_random_uuid(),
  recorrido_id uuid not null references public.recorridos(id) on delete cascade,
  -- Lo escribe la app con el usuario autenticado (la política lo exige).
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  -- Tramo más cercano al cierre del segmento; null si no hay ninguno a 40 m.
  tramo_id text references public.tramos(id) on delete set null,
  t timestamptz not null,
  latitud numeric(10, 8) not null,
  longitud numeric(11, 8) not null,
  velocidad_kmh numeric not null default 0,
  rumbo numeric,
  altitud numeric,
  rms_vertical numeric not null default 0,
  pico_vertical numeric not null default 0,
  frenadas integer not null default 0,
  laterales integer not null default 0,
  muestras integer not null default 0,
  calidad calidad_segmento not null default 'sin_dato',
  created_at timestamptz not null default now()
);

-- 2. OBSERVACIONES: origen (manual/sensor), magnitud del impacto y tramo.
alter table public.fallas_deteccion
  add column if not exists origen origen_observacion not null default 'manual',
  add column if not exists magnitud numeric,
  add column if not exists tramo_id text references public.tramos(id) on delete set null;

-- 3. ÍNDICES
create index if not exists muestras_recorrido_idx on public.muestras_sensor (recorrido_id);
create index if not exists muestras_tramo_idx on public.muestras_sensor (tramo_id);
create index if not exists fallas_tramo_idx on public.fallas_deteccion (tramo_id);
create index if not exists fallas_origen_idx on public.fallas_deteccion (origen);

-- 4. ROW LEVEL SECURITY
alter table public.muestras_sensor enable row level security;

drop policy if exists "muestras_select" on public.muestras_sensor;
create policy "muestras_select" on public.muestras_sensor
  for select to authenticated
  using (
    recorrido_id in (
      select r.id from public.recorridos r
      where r.usuario_id = auth.uid() or r.municipio = public.municipio_actual()
    )
  );

drop policy if exists "muestras_insert_propio" on public.muestras_sensor;
create policy "muestras_insert_propio" on public.muestras_sensor
  for insert to authenticated
  with check (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

-- Reprocesar un recorrido borra sus muestras antes de reinsertarlas.
drop policy if exists "muestras_delete_propio" on public.muestras_sensor;
create policy "muestras_delete_propio" on public.muestras_sensor
  for delete to authenticated
  using (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

-- Solo se pueden borrar las observaciones automáticas: las manuales las escribió
-- la persona y no las toca el reprocesamiento.
drop policy if exists "fallas_delete_sensor_propio" on public.fallas_deteccion;
create policy "fallas_delete_sensor_propio" on public.fallas_deteccion
  for delete to authenticated
  using (
    origen = 'sensor'
    and recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
  );

-- 5. RUGOSIDAD POR TRAMO
-- Agrega los segmentos con calidad conocida de todo el municipio: rms medio
-- ponderado por cantidad de muestras, velocidad media, calidad predominante
-- (moda) e impactos registrados sobre el tramo.
create or replace function public.rugosidad_tramos(p_municipio text)
returns table (
  tramo_id text,
  segmentos int,
  rms_medio numeric,
  velocidad_media numeric,
  impactos int,
  calidad calidad_segmento
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_municipio is distinct from public.municipio_actual() then return; end if;

  return query
  with seg as (
    select
      m.tramo_id as tid,
      m.rms_vertical as rms,
      m.velocidad_kmh as vel,
      greatest(m.muestras, 1) as peso,
      m.calidad as cal
    from public.muestras_sensor m
    join public.tramos tr on tr.id = m.tramo_id
    where tr.municipio = p_municipio and m.calidad <> 'sin_dato'
  ),
  agregado as (
    select
      s.tid,
      count(*)::int as segmentos,
      round(sum(s.rms * s.peso) / nullif(sum(s.peso), 0), 3) as rms_medio,
      round(avg(s.vel), 1) as velocidad_media
    from seg s
    group by s.tid
  ),
  moda as (
    select distinct on (s.tid) s.tid, s.cal
    from seg s
    group by s.tid, s.cal
    order by s.tid, count(*) desc, s.cal
  ),
  impacto as (
    select f.tramo_id as tid, count(*)::int as impactos
    from public.fallas_deteccion f
    join public.tramos tr on tr.id = f.tramo_id
    where tr.municipio = p_municipio and f.origen = 'sensor'
    group by f.tramo_id
  )
  select
    a.tid,
    a.segmentos,
    a.rms_medio,
    a.velocidad_media,
    coalesce(i.impactos, 0),
    m.cal
  from agregado a
  join moda m on m.tid = a.tid
  left join impacto i on i.tid = a.tid
  order by a.tid;
end;
$$;
