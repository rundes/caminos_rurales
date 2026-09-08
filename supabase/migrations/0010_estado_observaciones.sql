-- Estado de gestión de observaciones (ola 2, producto).
-- 1. `fallas_deteccion` suma un estado de seguimiento (pendiente / en obra /
--    resuelta / descartada) que solo puede tocar el municipio o el auditor.
-- 2. La app deja de tener el update amplio que traía por defecto: se granulan
--    las columnas escribibles (mismo patrón que `perfiles` en 0008) y un
--    trigger rechaza cualquier cambio de estado que no venga de esos roles,
--    como respaldo de lo que la política de RLS no puede expresar sola
--    (RLS filtra filas, no columnas: sin el trigger, el dueño de la
--    observación podría colarse un cambio de estado por la política
--    `fallas_update_propio`, que sigue vigente para sus campos propios).
-- 3. `resumen_observaciones(p_municipio)` agrega el conteo por estado para el
--    panel de observaciones, con el mismo guardado de municipio que
--    `cobertura_municipio`/`ranking_municipio`.
-- Requiere haber aplicado antes 0009_cupos.sql.

-- 1. ENUM DE ESTADO (idempotente: 0010 puede reaplicarse sin fallar)
do $$
begin
  create type estado_observacion as enum ('pendiente', 'en_obra', 'resuelta', 'descartada');
exception
  when duplicate_object then null;
end;
$$;

-- 2. COLUMNAS DE SEGUIMIENTO
alter table public.fallas_deteccion
  add column if not exists estado estado_observacion not null default 'pendiente',
  add column if not exists estado_nota text,
  add column if not exists estado_at timestamptz,
  add column if not exists estado_por uuid references public.perfiles(id) on delete set null;

create index if not exists fallas_estado_idx on public.fallas_deteccion (estado);

-- 3. COLUMNAS ESCRIBIBLES DESDE LA APP
-- El grant amplio que traía la tabla por defecto se reemplaza por una lista
-- explícita: los campos propios que ya podía tocar el dueño (política
-- `fallas_update_propio`, 0005) más los de estado, que solo puede escribir
-- gestión (política nueva de abajo + el trigger que corta cualquier otra vía).
revoke update on public.fallas_deteccion from authenticated;
grant update (
  tipo_falla, severidad, latitud, longitud, descripcion,
  url_evidencia_imagen, url_evidencia_video,
  estado, estado_nota, estado_at, estado_por
) on public.fallas_deteccion to authenticated;

-- 4. RLS: solo municipio/auditor cambian el estado, sobre observaciones de su
-- propio municipio. La política `fallas_update_propio` (0005) sigue vigente
-- para que el dueño edite sus campos propios; el trigger de abajo es lo que
-- le impide usar esa misma política para tocar el estado.
drop policy if exists "fallas_update_estado_gestion" on public.fallas_deteccion;
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

-- 5. TRIGGER: nadie fuera de municipio/auditor puede cambiar el estado
-- (mirror de `perfiles_campos_protegidos`/`perfiles_no_escalar` de 0008).
-- `when (auth.uid() is not null)` deja pasar a la clave secreta, que necesita
-- poder reprocesar o corregir observaciones sin pasar por esta restricción.
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

drop trigger if exists fallas_estado_no_escalar on public.fallas_deteccion;
create trigger fallas_estado_no_escalar
  before update on public.fallas_deteccion
  for each row
  when (auth.uid() is not null)
  execute function public.fallas_estado_protegido();

-- 6. RESUMEN POR ESTADO (panel de observaciones)
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
