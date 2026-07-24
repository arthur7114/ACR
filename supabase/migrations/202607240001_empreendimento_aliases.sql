-- Permite que um empreendimento tenha rótulos alternativos (aliases) que
-- resolvem para o mesmo registro/regra comercial. Útil quando um documento
-- usa uma variação de nome (ex.: sufixo de fase/etapa) para o mesmo
-- empreendimento já cadastrado, evitando criação silenciosa de um
-- empreendimento novo sem regra comercial associada.
alter table public.empreendimentos
  add column if not exists aliases text[] not null default '{}';
