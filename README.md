# Visiovial Rural

Plataforma de relevamiento del estado de caminos rurales de la Provincia de Buenos Aires.

## Documentación

- `docs/superpowers/specs/2026-09-02-visiovial-rural-design.md`: diseño del MVP.
- `docs/system-prompt.md`: reglas de desarrollo.
- `docs/database-schema.sql`: esquema Supabase con RLS, trigger y storage.
- `docs/step-by-step-guide.md`: fases de implementación.
- `docs/fuentes-datos.md`: fuentes de datos de referencia (UBA, OSM, SENASA, MapBiomas, GSW).

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (Auth, Postgres, Storage), react-leaflet.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las claves del proyecto Supabase
npm run dev
```

Scripts:

- `npm test`: tests unitarios (Vitest).
- `npm run test:coverage`: cobertura.
- `npm run tipos`: regenera `lib/supabase/database.types.ts` ejecutando `npx --yes supabase gen types` (no requiere instalación local; requiere `SUPABASE_ACCESS_TOKEN`).
- `node scripts/aplicar-sql.mjs <archivo.sql>`: aplica SQL al proyecto (requiere `SUPABASE_ACCESS_TOKEN`).
- `node scripts/generar-partidos.mjs`: regenera `lib/partidos.ts` desde la API georef.

## Roles

Los usuarios nuevos tienen rol `productor`. Para crear caminos hace falta `municipio` o `auditor`; se cambia desde Supabase:

```sql
update public.perfiles set rol = 'municipio' where id = '<uuid>';
```

## Verificación manual

Checklist para validar el flujo completo en el proyecto Supabase real:

- [ ] Registrar un usuario con partido → aparece en `perfiles`.
- [ ] Promover ese usuario a rol `municipio` vía SQL (ver arriba).
- [ ] Crear un camino.
- [ ] Cargar un viaje con al menos una foto → la evidencia se sube a `evidencia-vial/{uid}/{relevamiento}/`.
- [ ] El resumen del viaje muestra N fallas detectadas.
- [ ] El dashboard se actualiza con los nuevos datos.
- [ ] El mapa muestra marcadores y el filtro por tipo de falla funciona.
- [ ] El popup "Ver evidencia" abre una URL firmada.

## Smoke test de integración

Con `npm run dev` corriendo y `SUPABASE_ACCESS_TOKEN` en el entorno:

```bash
node scripts/smoke.mjs
```

Verifica contra el proyecto Supabase real: trigger de perfil, RLS por municipio y rol, políticas de storage, endpoint `/api/procesar-ia` (200/409/401), URLs firmadas y rutas protegidas. Crea y borra sus propios datos de prueba.
