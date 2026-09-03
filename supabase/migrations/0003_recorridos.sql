-- Recorridos GPS, cobertura por tramo y gamificación.
-- Reemplaza el flujo "cargar viaje + simulador IA": elimina `relevamientos`
-- y reapunta `fallas_deteccion` (observaciones) al recorrido que las originó.
-- Requiere haber aplicado antes 0003a_tipos_falla.sql.

-- 1. TIPOS
create type recorrido_estado as enum ('finalizado', 'descartado');

-- 2. TÉRMINOS ACEPTADOS
alter table public.perfiles add column if not exists acepto_terminos_at timestamptz;

-- 3. TRAMOS (denominador de cobertura: un registro por way de OSM)
create table public.tramos (
  id text primary key,
  municipio text not null,
  nombre_codigo text not null,
  localidad text not null,
  km numeric(10, 3) not null,
  geometria jsonb not null
);

-- 4. RECORRIDOS
create table public.recorridos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  municipio text not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  km numeric(10, 3) not null default 0,
  puntos_gps integer not null default 0,
  track jsonb not null default '[]'::jsonb,
  estado recorrido_estado not null default 'finalizado',
  created_at timestamptz not null default now()
);

-- 5. COBERTURA POR TRAMO
create table public.cobertura_tramos (
  id uuid primary key default gen_random_uuid(),
  tramo_id text not null references public.tramos(id) on delete cascade,
  recorrido_id uuid not null references public.recorridos(id) on delete cascade,
  usuario_id uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tramo_id, recorrido_id)
);

-- 6. PUNTOS Y LOGROS
create table public.puntos_eventos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  municipio text not null,
  recorrido_id uuid references public.recorridos(id) on delete cascade,
  motivo text not null,
  puntos integer not null,
  created_at timestamptz not null default now()
);

create table public.logros (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  codigo text not null,
  otorgado_at timestamptz not null default now(),
  unique (usuario_id, codigo)
);

-- 7. OBSERVACIONES: fallas_deteccion pasa de relevamiento a recorrido.
-- Las políticas viejas dependen de relevamiento_id, así que se borran primero.
-- Las filas existentes son de pruebas de humo y quedarían huérfanas: se eliminan.
drop policy if exists "fallas_select" on public.fallas_deteccion;
drop policy if exists "fallas_insert_propio" on public.fallas_deteccion;

delete from public.fallas_deteccion;

alter table public.fallas_deteccion
  drop column relevamiento_id,
  add column recorrido_id uuid references public.recorridos(id) on delete cascade,
  add column descripcion text,
  add column url_evidencia_video text;

drop table public.relevamientos cascade;

-- 8. ÍNDICES
create index tramos_municipio_idx on public.tramos (municipio);
create index recorridos_usuario_idx on public.recorridos (usuario_id);
create index recorridos_municipio_idx on public.recorridos (municipio);
create index cobertura_tramo_idx on public.cobertura_tramos (tramo_id);
create index fallas_recorrido_idx on public.fallas_deteccion (recorrido_id);
create index puntos_usuario_idx on public.puntos_eventos (usuario_id);
create index puntos_municipio_idx on public.puntos_eventos (municipio);

-- 9. ROW LEVEL SECURITY
alter table public.tramos enable row level security;
alter table public.recorridos enable row level security;
alter table public.cobertura_tramos enable row level security;
alter table public.puntos_eventos enable row level security;
alter table public.logros enable row level security;

-- tramos: solo lectura por municipio (los siembra el servidor con la clave secreta).
create policy "tramos_select" on public.tramos
  for select to authenticated
  using (municipio = public.municipio_actual());

-- recorridos: lectura por municipio; escritura del propio.
create policy "recorridos_select" on public.recorridos
  for select to authenticated
  using (usuario_id = auth.uid() or municipio = public.municipio_actual());

create policy "recorridos_insert_propio" on public.recorridos
  for insert to authenticated
  with check (usuario_id = auth.uid());

create policy "recorridos_update_propio" on public.recorridos
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- observaciones: lectura si el recorrido es visible; inserción sobre recorridos propios.
create policy "fallas_select" on public.fallas_deteccion
  for select to authenticated
  using (
    recorrido_id in (
      select r.id from public.recorridos r
      where r.usuario_id = auth.uid() or r.municipio = public.municipio_actual()
    )
  );

create policy "fallas_insert_propio" on public.fallas_deteccion
  for insert to authenticated
  with check (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
  );

-- cobertura, puntos y logros: solo lectura; los escribe el servidor con la clave secreta.
create policy "cobertura_select" on public.cobertura_tramos
  for select to authenticated
  using (
    recorrido_id in (select id from public.recorridos where municipio = public.municipio_actual())
  );

create policy "puntos_select" on public.puntos_eventos
  for select to authenticated
  using (municipio = public.municipio_actual());

create policy "logros_select" on public.logros
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or usuario_id in (select id from public.perfiles where municipio_id = public.municipio_actual())
  );

-- 10. FUNCIONES DEL DASHBOARD
-- security definer para poder agregar sobre todo el municipio sin depender de
-- las políticas fila a fila; la primera línea corta si el municipio pedido no
-- es el del usuario autenticado.
create or replace function public.cobertura_municipio(p_municipio text)
returns table (localidad text, tramos integer, cubiertos integer, km numeric, km_cubiertos numeric)
language plpgsql
stable
security definer
set search_path = public
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
    where tr.municipio = p_municipio
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

create or replace function public.ranking_municipio(p_municipio text)
returns table (usuario_id uuid, nombre text, puntos bigint, posicion bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_municipio is distinct from public.municipio_actual() then return; end if;

  return query
  select
    p.id,
    p.nombre,
    sum(e.puntos)::bigint,
    rank() over (order by sum(e.puntos) desc)
  from public.puntos_eventos e
  join public.perfiles p on p.id = e.usuario_id
  where e.municipio = p_municipio
  group by p.id, p.nombre
  order by sum(e.puntos) desc;
end;
$$;

-- 11. STORAGE: la evidencia ahora también puede ser video WebM (grabado en el
-- navegador), además de los tipos que ya aceptaba el bucket.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
where id = 'evidencia-vial';
