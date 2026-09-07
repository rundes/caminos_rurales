-- Endurecimiento de datos (ola 1, punto A).
-- 1. El perfil deja de ser escribible desde la app salvo `nombre` y
--    `acepto_terminos_at`: `rol`, `municipio_id` e `id` son inmutables para
--    cualquier sesión con `auth.uid()`. La clave secreta (service role, sin
--    `auth.uid()`) conserva el control total.
-- 2. `recorridos` solo admite altas en el municipio propio y ya no admite
--    modificaciones desde la app.
-- 3. `fallas_deteccion` solo admite altas con `origen = 'manual'`: las de
--    sensor las escribe el servidor al procesar el recorrido.
-- 4. Todas las funciones `security definer` fijan `search_path`.
-- 5. El municipio del perfil lo determina un código de invitación, no la
--    metadata que manda el cliente.
-- 6. Índices que faltaban en las consultas más frecuentes.
-- Requiere haber aplicado antes 0007_cuadros.sql.

-- 1. PERFILES: columnas escribibles y campos protegidos
-- El grant por columna corta el ataque antes de RLS; el trigger cubre
-- cualquier otra vía (por ejemplo una función que escriba la tabla).
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

-- `when (auth.uid() is not null)` deja pasar a la clave secreta: el servidor
-- necesita poder asignar el municipio al canjear un código de invitación.
drop trigger if exists perfiles_no_escalar on public.perfiles;
create trigger perfiles_no_escalar
  before update on public.perfiles
  for each row
  when (auth.uid() is not null)
  execute function public.perfiles_campos_protegidos();

-- 2. RECORRIDOS: alta solo en el municipio propio; sin update desde la app
-- (el post-procesado sella `procesado_at` con la clave secreta).
drop policy if exists "recorridos_update_propio" on public.recorridos;

drop policy if exists "recorridos_insert_propio" on public.recorridos;
create policy "recorridos_insert_propio" on public.recorridos
  for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and municipio = public.municipio_actual()
  );

-- 3. OBSERVACIONES: la app solo carga las manuales.
drop policy if exists "fallas_insert_propio" on public.fallas_deteccion;
create policy "fallas_insert_propio" on public.fallas_deteccion
  for insert to authenticated
  with check (
    recorrido_id in (select id from public.recorridos where usuario_id = auth.uid())
    and origen = 'manual'
  );

-- 4. CÓDIGOS DE INVITACIÓN
-- Sin políticas: solo la clave secreta y las funciones `security definer`
-- (handle_new_user) los leen. La app los canjea desde el servidor.
create table if not exists public.codigos_invitacion (
  codigo text primary key,
  municipio text not null,
  activo boolean not null default true,
  creado_at timestamptz default now()
);

alter table public.codigos_invitacion enable row level security;

insert into public.codigos_invitacion (codigo, municipio)
values ('MAIPU-2027', 'maipu')
on conflict (codigo) do nothing;

-- 5. ALTA DE USUARIO: el municipio sale del código, nunca de la metadata.
-- Si el código no existe o está inactivo el perfil queda en 'sin-asignar' y la
-- app lo manda a /pendiente a canjear uno válido.
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

-- 6. ÍNDICES QUE FALTABAN
create index if not exists puntos_recorrido_idx on public.puntos_eventos (recorrido_id);
create index if not exists puntos_usuario_fecha_idx on public.puntos_eventos (usuario_id, created_at desc);
create index if not exists cobertura_usuario_fecha_idx on public.cobertura_tramos (usuario_id, created_at desc);
create index if not exists cobertura_recorrido_idx on public.cobertura_tramos (recorrido_id);
create index if not exists fallas_fecha_idx on public.fallas_deteccion (created_at desc);
create index if not exists cuadros_t_idx on public.cuadros (t desc);

-- 7. search_path fijo en TODAS las funciones security definer de public
-- (municipio_actual, rol_actual, handle_new_user, cobertura_municipio,
-- ranking_municipio, rugosidad_tramos, cuadros_por_tramo,
-- perfiles_campos_protegidos y cualquiera que se agregue después).
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
