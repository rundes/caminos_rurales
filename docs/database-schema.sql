-- Visiovial Rural - Esquema de base de datos (Supabase / PostgreSQL 17)
-- Fuente: documentación del proyecto + políticas RLS, trigger y storage agregados.

-- 1. TIPOS ENUMERADOS
create type rol_usuario as enum ('productor', 'municipio', 'auditor');
create type estado_camino as enum ('bueno', 'regular', 'malo', 'intransitable');
create type origen_datos as enum ('app_sensor', 'camara_dashcam', 'formulario');
create type tipo_falla as enum ('bache', 'carcava', 'acumulacion_agua', 'falta_alcantarilla', 'maleza_alta');
create type nivel_severidad as enum ('baja', 'media', 'alta');

-- 2. TABLA PERFILES (sincronizada con auth.users)
create table public.perfiles (
  id uuid references auth.users on delete cascade primary key,
  nombre text not null,
  rol rol_usuario default 'productor'::rol_usuario,
  municipio_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. TABLA CAMINOS
create table public.caminos (
  id uuid default gen_random_uuid() primary key,
  nombre_codigo text not null,
  municipio text not null,
  estado_general estado_camino default 'regular'::estado_camino,
  ultima_actualizacion timestamp with time zone default now()
);

-- 4. TABLA RELEVAMIENTOS
create table public.relevamientos (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid references public.perfiles(id) on delete set null,
  camino_id uuid references public.caminos(id) on delete cascade,
  fecha timestamp with time zone default now() not null,
  origen_datos origen_datos not null,
  procesado_ia boolean default false,
  metadata jsonb default '{}'::jsonb
);

-- 5. TABLA FALLAS DETECTADAS
create table public.fallas_deteccion (
  id uuid default gen_random_uuid() primary key,
  relevamiento_id uuid references public.relevamientos(id) on delete cascade,
  tipo_falla tipo_falla not null,
  severidad nivel_severidad not null,
  latitud numeric(10, 8) not null,
  longitud numeric(11, 8) not null,
  url_evidencia_imagen text,
  created_at timestamp with time zone default now()
);

-- 6. ÍNDICES
create index caminos_municipio_idx on public.caminos (municipio);
create index relevamientos_camino_idx on public.relevamientos (camino_id);
create index relevamientos_usuario_idx on public.relevamientos (usuario_id);
create index fallas_relevamiento_idx on public.fallas_deteccion (relevamiento_id);
create index fallas_tipo_idx on public.fallas_deteccion (tipo_falla);

-- 7. FUNCIONES AUXILIARES (security definer evita recursión de RLS sobre perfiles)
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

-- 8. TRIGGER: crear perfil al registrarse
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

-- 9. ROW LEVEL SECURITY
alter table public.perfiles enable row level security;
alter table public.caminos enable row level security;
alter table public.relevamientos enable row level security;
alter table public.fallas_deteccion enable row level security;

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

-- relevamientos: lectura si el camino es del municipio; inserción propia.
create policy "relevamientos_select" on public.relevamientos
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or camino_id in (select id from public.caminos where municipio = public.municipio_actual())
  );

create policy "relevamientos_insert" on public.relevamientos
  for insert to authenticated
  with check (usuario_id = auth.uid());

create policy "relevamientos_update_propio" on public.relevamientos
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- fallas_deteccion: lectura si el relevamiento es visible; inserción sobre relevamientos propios.
-- La API de procesamiento IA inserta con la clave secreta (omite RLS).
create policy "fallas_select" on public.fallas_deteccion
  for select to authenticated
  using (
    relevamiento_id in (
      select r.id from public.relevamientos r
      where r.usuario_id = auth.uid()
         or r.camino_id in (select id from public.caminos where municipio = public.municipio_actual())
    )
  );

create policy "fallas_insert_propio" on public.fallas_deteccion
  for insert to authenticated
  with check (
    relevamiento_id in (select id from public.relevamientos where usuario_id = auth.uid())
  );

-- 10. STORAGE: bucket privado para evidencia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencia-vial',
  'evidencia-vial',
  false,
  104857600, -- 100 MB
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
);

-- Cada usuario sube a su carpeta {auth.uid()}/...; lectura para autenticados.
create policy "evidencia_insert_propio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencia-vial'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "evidencia_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'evidencia-vial');

create policy "evidencia_delete_propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidencia-vial'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
