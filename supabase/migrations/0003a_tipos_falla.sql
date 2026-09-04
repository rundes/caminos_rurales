-- Nuevos tipos de observación para el flujo de recorridos.
-- Va en un archivo aparte porque la Management API aplica cada archivo como
-- una sola consulta y `alter type ... add value` no puede convivir con el uso
-- del valor nuevo en la misma transacción: se aplica ANTES de 0003_recorridos.sql.
alter type tipo_falla add value if not exists 'alcantarilla_rota';
alter type tipo_falla add value if not exists 'senalizacion';
alter type tipo_falla add value if not exists 'otro';
