-- Cuadros georreferenciados de la cámara durante el recorrido (fase 12).
-- Cada fila es una foto JPEG guardada en el bucket de evidencia (`ruta`) con la
-- posición, el rumbo y la velocidad del momento de la captura. El binario no
-- vive acá: solo la referencia al objeto y su georreferenciación.
-- Requiere haber aplicado antes 0003_recorridos.sql y 0006_muestras_sensor.sql.

-- 1. TABLA
create table if not exists public.cuadros (
  id uuid primary key default gen_random_uuid(),
  recorrido_id uuid not null references public.recorridos(id) on delete cascade,
  -- Lo escribe la app con el usuario autenticado (la política lo exige).
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  -- Tramo más cercano a la captura; null si no hay ninguno a 40 m.
  tramo_id text references public.tramos(id) on delete set null,
  t timestamptz not null,
  latitud numeric(10, 8) not null,
  longitud numeric(11, 8) not null,
  rumbo numeric,
  velocidad_kmh numeric,
  -- Ruta del objeto en el almacenamiento: {uid}/{recorridoId}/...
  ruta text not null,
  created_at timestamptz not null default now(),
  -- La subida es diferida y con reintentos: el mismo cuadro puede llegar dos
  -- veces. El par (recorrido, instante) lo identifica y el upsert lo resuelve.
  unique (recorrido_id, t)
);

-- 2. ÍNDICES
create index if not exists cuadros_recorrido_idx on public.cuadros (recorrido_id);
create index if not exists cuadros_tramo_idx on public.cuadros (tramo_id);

-- 3. ROW LEVEL SECURITY
alter table public.cuadros enable row level security;

drop policy if exists "cuadros_select" on public.cuadros;
create policy "cuadros_select" on public.cuadros
  for select to authenticated
  using (
    recorrido_id in (
      select r.id from public.recorridos r
      where r.usuario_id = auth.uid() or r.municipio = public.municipio_actual()
    )
  );

drop policy if exists "cuadros_insert_propio" on public.cuadros;
create policy "cuadros_insert_propio" on public.cuadros
  for insert to authenticated
  with check (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

-- El upsert por (recorrido_id, t) necesita poder pisar la fila propia cuando la
-- subida se reintenta.
drop policy if exists "cuadros_update_propio" on public.cuadros;
create policy "cuadros_update_propio" on public.cuadros
  for update to authenticated
  using (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  )
  with check (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

drop policy if exists "cuadros_delete_propio" on public.cuadros;
create policy "cuadros_delete_propio" on public.cuadros
  for delete to authenticated
  using (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

-- 4. CUADROS POR TRAMO
-- Cuenta los cuadros asignados a cada tramo del municipio para el tooltip del
-- mapa. Como `rugosidad_tramos`, corta si el municipio pedido no es el del
-- usuario y agrega sobre todo el municipio sin depender de las políticas fila
-- a fila.
create or replace function public.cuadros_por_tramo(p_municipio text)
returns table (
  tramo_id text,
  cuadros int
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
  select c.tramo_id, count(*)::int as cuadros
  from public.cuadros c
  join public.tramos tr on tr.id = c.tramo_id
  where tr.municipio = p_municipio and c.tramo_id is not null
  group by c.tramo_id
  order by c.tramo_id;
end;
$$;
