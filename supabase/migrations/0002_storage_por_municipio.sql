-- Lectura de evidencia limitada a usuarios del mismo municipio que quien subió el archivo.
drop policy if exists "evidencia_select" on storage.objects;

create policy "evidencia_select_municipio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencia-vial'
    and (storage.foldername(name))[1] in (
      select id::text from public.perfiles where municipio_id = public.municipio_actual()
    )
  );
