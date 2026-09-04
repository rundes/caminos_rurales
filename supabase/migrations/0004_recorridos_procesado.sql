-- Marcador de procesamiento de un recorrido.
-- `finalizarRecorrido` inserta el recorrido y recién después calcula cobertura,
-- puntos, observaciones y logros. Si algo falla en el medio, la fila queda con
-- `procesado_at` en null y el próximo reintento del cliente vuelve a procesarla
-- (cada paso es idempotente). Se sella como último paso del proceso.

alter table public.recorridos add column if not exists procesado_at timestamptz;

create index if not exists recorridos_sin_procesar_idx
  on public.recorridos (created_at)
  where procesado_at is null;
