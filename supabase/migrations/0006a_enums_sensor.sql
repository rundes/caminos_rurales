-- Tipos enumerados de la captura por sensores.
-- Van en una migración aparte de 0006 porque un `create type` y su primer uso
-- en una tabla o política deben aplicarse en llamadas distintas a la Management
-- API para que el tipo ya esté visible al planificar la siguiente sentencia.
-- Idempotente: reaplicar el archivo no falla si los tipos ya existen.

do $$
begin
  create type public.calidad_segmento as enum (
    'sin_dato',
    'bueno',
    'regular',
    'malo',
    'intransitable'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.origen_observacion as enum ('manual', 'sensor');
exception
  when duplicate_object then null;
end
$$;
