-- Corrige imóveis de hospedagem Airbnb migrados do cadastro legado como
-- aluguel fixo de R$ 0,00. Receita variável não tem aluguel contratado:
-- o painel deve exibir "Não se aplica", nunca um zero artificial.
update public.imovel_vigencias as v
set
  modelo_receita = 'variavel',
  aluguel_contratado = null,
  fonte = 'Hospedagem Airbnb identificada no cadastro; receita variável sem aluguel contratado',
  atualizado_em = now()
from public.imoveis as i
where i.id = v.imovel_id
  and v.ativo is true
  and (
    public.acr_normalize_nome(coalesce(i.tipo, '')) = 'airbnb'
    or public.acr_normalize_nome(coalesce(i.inquilino_nome, '')) = 'airbnb'
  )
  and (
    v.modelo_receita is distinct from 'variavel'
    or v.aluguel_contratado is not null
  );
