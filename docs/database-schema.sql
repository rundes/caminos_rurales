-- Visiovial Rural - Esquema de base de datos (Supabase / PostgreSQL 17)
-- Estado final: refleja 0001_schema.sql + 0002_storage_por_municipio.sql +
-- 0003a_tipos_falla.sql + 0003_recorridos.sql + 0004_recorridos_procesado.sql.
-- Una instalación nueva puede
-- correr solo este archivo. La tabla `relevamientos` ya no existe: el flujo
-- es recorrido GPS -> cobertura de tramos -> puntos e insignias.

-- 1. TIPOS ENUMERADOS
create type rol_usuario as enum ('productor', 'municipio', 'auditor');
create type estado_camino as enum ('bueno', 'regular', 'malo', 'intransitable');
create type origen_datos as enum ('app_sensor', 'camara_dashcam', 'formulario');
create type tipo_falla as enum (
  'bache',
  'carcava',
  'acumulacion_agua',
  'falta_alcantarilla',
  'maleza_alta',
  'alcantarilla_rota',
  'senalizacion',
  'otro'
);
create type nivel_severidad as enum ('baja', 'media', 'alta');
create type recorrido_estado as enum ('finalizado', 'descartado');

-- 2. TABLA PERFILES (sincronizada con auth.users)
create table public.perfiles (
  id uuid references auth.users on delete cascade primary key,
  nombre text not null,
  rol rol_usuario default 'productor'::rol_usuario,
  municipio_id text not null,
  acepto_terminos_at timestamptz,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. TABLA CAMINOS (agrupador por código; el denominador de cobertura es `tramos`)
create table public.caminos (
  id uuid default gen_random_uuid() primary key,
  nombre_codigo text not null,
  municipio text not null,
  estado_general estado_camino default 'regular'::estado_camino,
  ultima_actualizacion timestamp with time zone default now()
);

-- 4. TABLA TRAMOS (un registro por way de OSM: geometría, km y localidad)
create table public.tramos (
  id text primary key,
  municipio text not null,
  nombre_codigo text not null,
  localidad text not null,
  km numeric(10, 3) not null,
  geometria jsonb not null
);

-- 5. TABLA RECORRIDOS (track GPS simplificado de una salida)
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
  -- Sello del post-procesado (cobertura, puntos, observaciones, logros).
  -- Null = insertado pero sin procesar: el reintento vuelve a procesarlo.
  procesado_at timestamptz,
  created_at timestamptz not null default now()
);

-- 6. TABLA COBERTURA POR TRAMO
create table public.cobertura_tramos (
  id uuid primary key default gen_random_uuid(),
  tramo_id text not null references public.tramos(id) on delete cascade,
  recorrido_id uuid not null references public.recorridos(id) on delete cascade,
  usuario_id uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tramo_id, recorrido_id)
);

-- 7. TABLA OBSERVACIONES (en la UI se llaman "observaciones")
create table public.fallas_deteccion (
  id uuid default gen_random_uuid() primary key,
  recorrido_id uuid references public.recorridos(id) on delete cascade,
  tipo_falla tipo_falla not null,
  severidad nivel_severidad not null,
  latitud numeric(10, 8) not null,
  longitud numeric(11, 8) not null,
  descripcion text,
  url_evidencia_imagen text,
  url_evidencia_video text,
  created_at timestamp with time zone default now()
);

-- 8. PUNTOS Y LOGROS
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

-- 9. ÍNDICES
create index caminos_municipio_idx on public.caminos (municipio);
create index tramos_municipio_idx on public.tramos (municipio);
create index recorridos_usuario_idx on public.recorridos (usuario_id);
create index recorridos_municipio_idx on public.recorridos (municipio);
create index recorridos_sin_procesar_idx on public.recorridos (created_at) where procesado_at is null;
create index cobertura_tramo_idx on public.cobertura_tramos (tramo_id);
create index fallas_recorrido_idx on public.fallas_deteccion (recorrido_id);
create index fallas_tipo_idx on public.fallas_deteccion (tipo_falla);
create index puntos_usuario_idx on public.puntos_eventos (usuario_id);
create index puntos_municipio_idx on public.puntos_eventos (municipio);

-- 10. FUNCIONES AUXILIARES (security definer evita recursión de RLS sobre perfiles)
create or replace function public.municipio_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select municipio_id from public.perfiles where id = auth.uid();
$$;

create or replace function public.rol_actual()
returns rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

-- 11. FUNCIONES DEL DASHBOARD
-- Agregan sobre todo el municipio sin depender de las políticas fila a fila;
-- la primera línea corta si el municipio pedido no es el del usuario.
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

-- 12. TRIGGER: crear perfil al registrarse
-- El formulario de registro envía nombre y municipio_id en options.data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, municipio_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    coalesce(new.raw_user_meta_data ->> 'municipio_id', 'sin-asignar')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 13. ROW LEVEL SECURITY
alter table public.perfiles enable row level security;
alter table public.caminos enable row level security;
alter table public.tramos enable row level security;
alter table public.recorridos enable row level security;
alter table public.cobertura_tramos enable row level security;
alter table public.fallas_deteccion enable row level security;
alter table public.puntos_eventos enable row level security;
alter table public.logros enable row level security;

-- perfiles: cada usuario ve y edita el propio; ve los de su municipio.
create policy "perfiles_select" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or municipio_id = public.municipio_actual());

create policy "perfiles_update_propio" on public.perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- caminos: lectura por municipio; escritura solo rol municipio/auditor.
create policy "caminos_select" on public.caminos
  for select to authenticated
  using (municipio = public.municipio_actual());

create policy "caminos_insert" on public.caminos
  for insert to authenticated
  with check (
    municipio = public.municipio_actual()
    and public.rol_actual() in ('municipio', 'auditor')
  );

create policy "caminos_update" on public.caminos
  for update to authenticated
  using (municipio = public.municipio_actual() and public.rol_actual() in ('municipio', 'auditor'))
  with check (municipio = public.municipio_actual());

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

-- 14. STORAGE: bucket privado para evidencia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencia-vial',
  'evidencia-vial',
  false,
  104857600, -- 100 MB
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
);

-- Cada usuario sube a su carpeta {auth.uid()}/...; lectura limitada a su municipio.
create policy "evidencia_insert_propio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencia-vial'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "evidencia_select_municipio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencia-vial'
    and (storage.foldername(name))[1] in (
      select id::text from public.perfiles where municipio_id = public.municipio_actual()
    )
  );

create policy "evidencia_delete_propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidencia-vial'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
