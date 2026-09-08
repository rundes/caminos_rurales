-- Visiovial Rural - Esquema de base de datos (Supabase / PostgreSQL 17)
-- Estado final: refleja 0001_schema.sql + 0002_storage_por_municipio.sql +
-- 0003a_tipos_falla.sql + 0003_recorridos.sql + 0004_recorridos_procesado.sql +
-- 0005_fallas_update.sql + 0006a_enums_sensor.sql + 0006_muestras_sensor.sql +
-- 0007_cuadros.sql + 0008_seguridad.sql + 0009_cupos.sql +
-- 0010_estado_observaciones.sql + 0011_alta_tramos.sql.
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
-- Calidad estimada de un segmento de 5 s / 100 m a partir de la rugosidad.
create type calidad_segmento as enum ('sin_dato', 'bueno', 'regular', 'malo', 'intransitable');
-- Quién originó una observación: la persona o el detector de impactos.
create type origen_observacion as enum ('manual', 'sensor');
-- Estado de gestión de una observación (0010).
create type estado_observacion as enum ('pendiente', 'en_obra', 'resuelta', 'descartada');

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

-- 4. TABLA TRAMOS (un registro por way de OSM, o dado de alta a mano por
-- municipio/auditor: geometría, km y localidad)
create table public.tramos (
  id text primary key,
  municipio text not null,
  nombre_codigo text not null,
  localidad text not null,
  km numeric(10, 3) not null,
  geometria jsonb not null,
  -- Alta/edición (0011): un tramo dado de baja (`activo = false`) deja de
  -- contar en la cobertura y en las listas de gestión, pero su historial
  -- (cobertura_tramos, muestras_sensor, fallas_deteccion, cuadros) nunca se
  -- borra ni se oculta — no hay política de delete. Semántica completa en
  -- `supabase/migrations/0011_alta_tramos.sql`.
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) on delete set null,
  actualizado_at timestamptz
);

-- 5. TABLA RECORRIDOS (track GPS simplificado de una salida)
create table public.recorridos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  municipio text not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  -- Lo calcula el servidor (`finalizarRecorrido`) sumando distancia dentro de
  -- cada segmento del track, nunca a través de un corte (pausa o
  -- interrupción de la grabación): ver `kmDeTrack` en `lib/track.ts`. Los
  -- cortes los deriva el propio servidor, no el cliente, de la unión de dos
  -- señales independientes (`unionCortes`): por tiempo (`derivarCortes`,
  -- timestamps de los puntos crudos, solo si vienen alineados con el track)
  -- y por distancia (`derivarCortesPorDistancia`, directo sobre la geometría
  -- del track, sin depender de los puntos crudos) — así un payload que
  -- manda `puntos` recortado, desalineado o ausente no logra que un salto
  -- sin recorrer se acredite como si lo fuera.
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
  -- 'sensor' = la generó el detector de impactos durante el recorrido.
  origen origen_observacion not null default 'manual',
  -- Pico de aceleración vertical (m/s²) del impacto que la originó.
  magnitud numeric,
  -- Tramo más cercano; lo asigna el servidor al procesar el recorrido.
  tramo_id text references public.tramos(id) on delete set null,
  created_at timestamp with time zone default now(),
  -- Seguimiento de gestión (0010): solo lo escriben municipio/auditor.
  estado estado_observacion not null default 'pendiente',
  estado_nota text,
  estado_at timestamptz,
  estado_por uuid references public.perfiles(id) on delete set null
);

-- 7b. TABLA MUESTRAS_SENSOR (un segmento agregado de 5 s o 100 m)
create table public.muestras_sensor (
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

-- 7c. TABLA CUADROS (foto georreferenciada de la cámara durante el recorrido)
create table public.cuadros (
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
  -- Ruta del objeto en el bucket de evidencia: {uid}/{recorridoId}/...
  ruta text not null,
  created_at timestamptz not null default now(),
  -- La subida es diferida y con reintentos: el par (recorrido, instante)
  -- identifica al cuadro y el upsert resuelve el reenvío.
  unique (recorrido_id, t)
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
create index fallas_tramo_idx on public.fallas_deteccion (tramo_id);
create index fallas_origen_idx on public.fallas_deteccion (origen);
create index muestras_recorrido_idx on public.muestras_sensor (recorrido_id);
create index muestras_tramo_idx on public.muestras_sensor (tramo_id);
create index cuadros_recorrido_idx on public.cuadros (recorrido_id);
create index cuadros_tramo_idx on public.cuadros (tramo_id);
create index puntos_usuario_idx on public.puntos_eventos (usuario_id);
create index puntos_municipio_idx on public.puntos_eventos (municipio);
-- Índices de 0008: las consultas de inicio y de detalle filtran por recorrido
-- o por usuario ordenando por fecha descendente.
create index puntos_recorrido_idx on public.puntos_eventos (recorrido_id);
create index puntos_usuario_fecha_idx on public.puntos_eventos (usuario_id, created_at desc);
create index cobertura_usuario_fecha_idx on public.cobertura_tramos (usuario_id, created_at desc);
create index cobertura_recorrido_idx on public.cobertura_tramos (recorrido_id);
create index fallas_fecha_idx on public.fallas_deteccion (created_at desc);
create index cuadros_t_idx on public.cuadros (t desc);
create index fallas_estado_idx on public.fallas_deteccion (estado);
create index tramos_activo_idx on public.tramos (municipio, activo);

-- 10. FUNCIONES AUXILIARES (security definer evita recursión de RLS sobre perfiles)
create or replace function public.municipio_actual()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select municipio_id from public.perfiles where id = auth.uid();
$$;

create or replace function public.rol_actual()
returns rol_usuario
language sql
stable
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
as $$
begin
  if p_municipio is distinct from public.municipio_actual() then return; end if;

  return query
  -- `tr.activo` (0011): el denominador de cobertura cuenta solo tramos
  -- activos. `rugosidad_tramos`/`cuadros_por_tramo` (abajo) NO filtran por
  -- activo a propósito: agregan historial ya registrado por `tramo_id`, no
  -- enumeran "los tramos del municipio" — ver 0011_alta_tramos.sql.
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

create or replace function public.ranking_municipio(p_municipio text)
returns table (usuario_id uuid, nombre text, puntos bigint, posicion bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
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

-- Rugosidad estimada por tramo: agrega los segmentos con calidad conocida del
-- municipio (rms medio ponderado por muestras, velocidad media, calidad
-- predominante) y cuenta los impactos automáticos asignados al tramo.
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
set search_path = public, pg_temp
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

-- Cuadros de cámara por tramo: alimenta el tooltip del tramo en el mapa.
create or replace function public.cuadros_por_tramo(p_municipio text)
returns table (
  tramo_id text,
  cuadros int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
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

-- Conteo de observaciones por estado (0010): alimenta el panel de gestión.
create or replace function public.resumen_observaciones(p_municipio text)
returns table (estado estado_observacion, total int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_municipio is distinct from public.municipio_actual() then return; end if;

  return query
  select f.estado, count(*)::int
  from public.fallas_deteccion f
  join public.recorridos r on r.id = f.recorrido_id
  where r.municipio = p_municipio
  group by f.estado
  order by f.estado;
end;
$$;

-- 12. TRIGGER: crear perfil al registrarse
-- El formulario de registro envía nombre y codigo_invitacion en options.data.
-- El municipio sale del código (tabla `codigos_invitacion`, sección 14), nunca
-- de la metadata: si el código no existe o está inactivo el perfil queda en
-- 'sin-asignar' y la app manda a /pendiente a canjear uno válido.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text := upper(trim(coalesce(new.raw_user_meta_data ->> 'codigo_invitacion', '')));
  v_municipio text;
begin
  if v_codigo <> '' then
    select c.municipio into v_municipio
    from public.codigos_invitacion c
    where c.codigo = v_codigo and c.activo;
  end if;

  insert into public.perfiles (id, nombre, municipio_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    coalesce(v_municipio, 'sin-asignar')
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
alter table public.muestras_sensor enable row level security;
alter table public.cuadros enable row level security;
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

-- tramos: lectura por municipio (los siembra el servidor con la clave
-- secreta o los da de alta municipio/auditor); alta y edición solo para
-- municipio/auditor, dentro de su propio municipio; sin política de delete
-- (0011: `activo` reemplaza al borrado, ver sección 4 y el comentario del
-- trigger `tramos_auditoria` más abajo).
create policy "tramos_select" on public.tramos
  for select to authenticated
  using (municipio = public.municipio_actual());

create policy "tramos_insert_gestion" on public.tramos
  for insert to authenticated
  with check (
    public.rol_actual() in ('municipio', 'auditor')
    and municipio = public.municipio_actual()
  );

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

-- recorridos: lectura por municipio; escritura del propio.
create policy "recorridos_select" on public.recorridos
  for select to authenticated
  using (usuario_id = auth.uid() or municipio = public.municipio_actual());

-- Alta solo en el municipio propio. No hay política de update: el recorrido es
-- inmutable desde la app y el post-procesado lo sella con la clave secreta.
create policy "recorridos_insert_propio" on public.recorridos
  for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and municipio = public.municipio_actual()
  );

-- observaciones: lectura si el recorrido es visible; inserción manual sobre
-- recorridos propios (las de origen 'sensor' las escribe el servidor).
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
    and origen = 'manual'
  );

create policy "fallas_update_propio" on public.fallas_deteccion
  for update to authenticated
  using (recorrido_id in (select id from public.recorridos where usuario_id = auth.uid()))
  with check (recorrido_id in (select id from public.recorridos where usuario_id = auth.uid()));

-- Estado de gestión (0010): solo municipio/auditor, sobre su propio
-- municipio. Coexiste con `fallas_update_propio`; el trigger de la sección 17
-- es lo que impide que el dueño use esa política para tocar el estado.
create policy "fallas_update_estado_gestion" on public.fallas_deteccion
  for update to authenticated
  using (
    public.rol_actual() in ('municipio', 'auditor')
    and recorrido_id in (select id from public.recorridos where municipio = public.municipio_actual())
  )
  with check (
    public.rol_actual() in ('municipio', 'auditor')
    and recorrido_id in (select id from public.recorridos where municipio = public.municipio_actual())
  );

-- Solo se pueden borrar las observaciones automáticas (reprocesar un recorrido
-- las regenera); las manuales las escribió la persona y no se tocan.
create policy "fallas_delete_sensor_propio" on public.fallas_deteccion
  for delete to authenticated
  using (
    origen = 'sensor'
    and recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
  );

-- muestras de sensores: lectura por municipio; escritura y borrado del propio.
create policy "muestras_select" on public.muestras_sensor
  for select to authenticated
  using (
    recorrido_id in (
      select r.id from public.recorridos r
      where r.usuario_id = auth.uid() or r.municipio = public.municipio_actual()
    )
  );

create policy "muestras_insert_propio" on public.muestras_sensor
  for insert to authenticated
  with check (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

create policy "muestras_delete_propio" on public.muestras_sensor
  for delete to authenticated
  using (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

-- cuadros de cámara: lectura por municipio; escritura, actualización y borrado
-- del propio (el upsert de la subida diferida necesita poder pisar la fila).
create policy "cuadros_select" on public.cuadros
  for select to authenticated
  using (
    recorrido_id in (
      select r.id from public.recorridos r
      where r.usuario_id = auth.uid() or r.municipio = public.municipio_actual()
    )
  );

create policy "cuadros_insert_propio" on public.cuadros
  for insert to authenticated
  with check (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
  );

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

create policy "cuadros_delete_propio" on public.cuadros
  for delete to authenticated
  using (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and usuario_id = auth.uid()
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

-- 14. SEGURIDAD (0008): perfil inmutable y códigos de invitación
-- El perfil deja de ser escribible desde la app salvo `nombre` y
-- `acepto_terminos_at`. El grant por columna corta el intento antes de RLS; el
-- trigger cubre cualquier otra vía. La clave secreta (service role, sin
-- `auth.uid()`) conserva el control total: es la que asigna el municipio
-- cuando alguien canjea un código de invitación.
revoke update on public.perfiles from authenticated;
grant update (nombre, acepto_terminos_at) on public.perfiles to authenticated;

create or replace function public.perfiles_campos_protegidos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.rol is distinct from old.rol
    or new.municipio_id is distinct from old.municipio_id
  then
    raise exception 'El perfil no puede cambiar id, rol ni municipio_id desde la app'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger perfiles_no_escalar
  before update on public.perfiles
  for each row
  when (auth.uid() is not null)
  execute function public.perfiles_campos_protegidos();

-- Códigos de invitación por municipio: los lee `handle_new_user` (sección 12)
-- al crear el perfil y la acción `/pendiente` al canjearlos. RLS habilitado sin
-- políticas: nadie los ve desde la app, solo la clave secreta y las funciones
-- `security definer`.
create table public.codigos_invitacion (
  codigo text primary key,
  municipio text not null,
  activo boolean not null default true,
  creado_at timestamptz default now()
);

alter table public.codigos_invitacion enable row level security;

insert into public.codigos_invitacion (codigo, municipio)
values ('MAIPU-2027', 'maipu');

-- 15. STORAGE: bucket privado para evidencia
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

-- 16. CUPOS (0009): cupos diarios y puntos únicos por motivo dentro de un recorrido
-- Contador por usuario y día de subidas de evidencia y recorridos finalizados.
-- Sin políticas: la app nunca lee ni escribe esta tabla directo, solo a través
-- de `consumir_cupo` (security definer).
create table public.uso_diario (
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  dia date not null default current_date,
  subidas int not null default 0,
  recorridos int not null default 0,
  primary key (usuario_id, dia)
);

alter table public.uso_diario enable row level security;

-- Suma 1 al contador del tipo pedido para el usuario autenticado y el día de
-- hoy (upsert) y devuelve si todavía está dentro del máximo. Sin sesión no hay
-- cupo que dar: devuelve false.
create or replace function public.consumir_cupo(p_tipo text, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_n int;
begin
  if v_usuario is null then
    return false;
  end if;

  if p_tipo = 'subidas' then
    insert into public.uso_diario (usuario_id, dia, subidas)
    values (v_usuario, current_date, 1)
    on conflict (usuario_id, dia)
    do update set subidas = public.uso_diario.subidas + 1
    returning subidas into v_n;
  elsif p_tipo = 'recorridos' then
    insert into public.uso_diario (usuario_id, dia, recorridos)
    values (v_usuario, current_date, 1)
    on conflict (usuario_id, dia)
    do update set recorridos = public.uso_diario.recorridos + 1
    returning recorridos into v_n;
  else
    raise exception 'Tipo de cupo inválido: %', p_tipo;
  end if;

  return v_n <= p_max;
end;
$$;

revoke all on function public.consumir_cupo(text, int) from public;
grant execute on function public.consumir_cupo(text, int) to authenticated;

-- `guardarPuntos`/`recalcularPuntosCuadros` idempotizaban borrando todos los
-- eventos del recorrido antes de reinsertar; eso abría una ventana donde una
-- carrera podía duplicar motivos. La restricción única fuerza el upsert por
-- (recorrido_id, motivo) en su lugar (ver sección 8, tabla `puntos_eventos`).
alter table public.puntos_eventos
  add constraint puntos_eventos_recorrido_motivo_unico unique (recorrido_id, motivo);

-- 17. ESTADO DE OBSERVACIONES (0010): columnas escribibles y trigger de resguardo
-- El grant amplio que traía la tabla por defecto se reemplaza por una lista
-- explícita: los campos propios que ya podía tocar el dueño (política
-- `fallas_update_propio`, 0005) más los de estado, que solo puede escribir
-- gestión (política `fallas_update_estado_gestion` de la sección 13 + el
-- trigger de abajo, que corta cualquier otra vía).
revoke update on public.fallas_deteccion from authenticated;
grant update (
  tipo_falla, severidad, latitud, longitud, descripcion,
  url_evidencia_imagen, url_evidencia_video,
  estado, estado_nota, estado_at, estado_por
) on public.fallas_deteccion to authenticated;

create or replace function public.fallas_estado_protegido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
    new.estado is distinct from old.estado
    or new.estado_nota is distinct from old.estado_nota
    or new.estado_at is distinct from old.estado_at
    or new.estado_por is distinct from old.estado_por
  ) and public.rol_actual() not in ('municipio', 'auditor') then
    raise exception 'Solo municipio o auditor pueden cambiar el estado de una observación'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger fallas_estado_no_escalar
  before update on public.fallas_deteccion
  for each row
  when (auth.uid() is not null)
  execute function public.fallas_estado_protegido();

-- 18. ALTA DE TRAMOS (0011): auditoría y blindaje de la fila
-- Sella `creado_por`/`actualizado_at` en cada alta/edición y bloquea
-- cualquier cambio de fila que no venga de municipio/auditor (RLS
-- `tramos_update_gestion`, sección 13, ya lo exige vía `using`; esto es la
-- segunda barrera si una política futura amplía el update — mismo patrón que
-- `fallas_estado_protegido` arriba). Se salta el bloqueo cuando no hay sesión
-- (`auth.uid() is null`): la clave secreta (siembra, `scripts/seed-tramos.mjs`)
-- conserva control total.
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

  if auth.uid() is not null and public.rol_actual() not in ('municipio', 'auditor') then
    raise exception 'Solo municipio o auditor pueden modificar un tramo'
      using errcode = '42501';
  end if;

  new.creado_por := old.creado_por;
  new.actualizado_at := now();
  return new;
end;
$$;

create trigger tramos_auditoria
  before insert or update on public.tramos
  for each row
  execute function public.tramos_auditoria();
