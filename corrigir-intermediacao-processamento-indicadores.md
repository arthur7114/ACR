# Corrigir intermediação, processamento e indicadores

## Objetivo
Corrigir o falso estado de processamento, exibir o IPTU da intermediação sem alterar sua base de comissão e restaurar a escala verde → amarelo → laranja → vermelho.

## Tarefas
- [x] Criar testes para o estado de fechamento e para a composição financeira da intermediação.
- [x] Diferenciar rascunho, processamento ativo e erro na lista; direcionar rascunhos ao upload.
- [x] Separar aluguel/base, IPTU, total recebido, comissão e repasse na Intermediação.
- [x] Orientar a extração a preservar o valor exato do IPTU e o total da intermediação.
- [x] Restaurar a paleta verde → amarelo → laranja → vermelho do mapa de calor.
- [x] Atualizar contratos e roadmap.
- [ ] Validar testes focados, tipos, lint, build e checklist do projeto.

## Concluído quando
- [x] Grand Castelão em rascunho não aparece mais como “Processando” nem abre revisão vazia.
- [x] O caso LOCMAIS Mai/2026 resulta em base R$ 900, IPTU R$ 38,08, total R$ 938,08, comissão R$ 540 e repasse R$ 398,08.
- [x] A legenda e as células usam seis faixas progressivas de verde a vermelho.
