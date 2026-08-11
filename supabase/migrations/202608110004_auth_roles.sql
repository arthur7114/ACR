-- Perfis de acesso ficam no JWT (auth.users.raw_app_meta_data.role).
-- Bootstrap deterministico: o usuario mais antigo torna-se admin; demais,
-- operadores. Novos usuarios recebem o perfil explicitamente pela API admin.
with ranked_users as (
  select id, row_number() over (order by created_at, id) as position
  from auth.users
)
update auth.users as users
set raw_app_meta_data = coalesce(users.raw_app_meta_data, '{}'::jsonb) ||
  jsonb_build_object('role', case when ranked_users.position = 1 then 'admin' else 'operador' end)
from ranked_users
where users.id = ranked_users.id
  and not (coalesce(users.raw_app_meta_data, '{}'::jsonb) ? 'role');
