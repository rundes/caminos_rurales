-- Permite editar observaciones propias (por ejemplo, corregir severidad o
-- descripción después de creadas). Antes solo existían políticas de select e
-- insert sobre fallas_deteccion.

create policy "fallas_update_propio" on public.fallas_deteccion
  for update to authenticated
  using (recorrido_id in (select id from public.recorridos where usuario_id = auth.uid()))
  with check (recorrido_id in (select id from public.recorridos where usuario_id = auth.uid()));
