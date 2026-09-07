-- Cupos diarios (antitrampa) y puntos únicos por motivo dentro de un recorrido.
-- Requiere haber aplicado antes 0003_recorridos.sql.

-- 1. USO DIARIO
-- Contador por usuario y día de subidas de evidencia y recorridos finalizados.
-- Sin políticas: la app nunca lee ni escribe esta tabla directo, solo a través
-- de `consumir_cupo` (security definer).
create table if not exists public.uso_diario (
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  dia date not null default current_date,
  subidas int not null default 0,
  recorridos int not null default 0,
  primary key (usuario_id, dia)
);

alter table public.uso_diario enable row level security;

-- 2. CONSUMIR_CUPO
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

-- 3. PUNTOS ÚNICOS POR MOTIVO DENTRO DE UN RECORRIDO
-- Hasta ahora `guardarPuntos`/`recalcularPuntosCuadros` idempotizaban borrando
-- todos los eventos del recorrido antes de reinsertar; eso abre una ventana
-- donde una carrera puede duplicar motivos. La restricción única fuerza el
-- upsert por (recorrido_id, motivo) en su lugar.
-- Filas duplicadas de antes de la restricción (si las hay) se depuran primero,
-- dejando la más vieja de cada (recorrido_id, motivo) por `created_at` (`id`
-- es uuid, no ordenable con `min`); las que no tienen recorrido_id quedan
-- afuera del filtro porque un unique permite múltiples nulos y no hay nada
-- que depurar ahí.
delete from public.puntos_eventos p
using (
  select id, row_number() over (
    partition by recorrido_id, motivo order by created_at, id
  ) as fila
  from public.puntos_eventos
  where recorrido_id is not null
) dup
where p.id = dup.id
  and dup.fila > 1;

-- `add constraint` no admite `if not exists`: se verifica a mano para poder
-- reaplicar esta migración sin que falle por duplicado.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'puntos_eventos_recorrido_motivo_unico'
  ) then
    alter table public.puntos_eventos
      add constraint puntos_eventos_recorrido_motivo_unico unique (recorrido_id, motivo);
  end if;
end;
$$;
