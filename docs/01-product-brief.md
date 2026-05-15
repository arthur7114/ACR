# 01 - Product Brief

## Produto

Plataforma interna de gestao e conciliacao de repasses imobiliarios para ACR Empreendimentos Imobiliarios Ltda. O modulo inicial e o Fechamento Imobiliario.

O sistema deve centralizar upload de documentos mensais, extracao de dados financeiros, normalizacao de layouts, conciliacao de repasses/despesas/comprovantes, revisao humana e preparacao dos lancamentos para o eGestor.

## Job to be done

Quando chegar o final do mes, o usuario quer subir no sistema o pacote de documentos enviado pela imobiliaria, mesmo que chegue em partes, para que o sistema extraia receitas, despesas, comprovantes e repasses, valide se tudo bate, aponte divergencias e gere um fechamento aprovado para lancamento no eGestor.

## Objetivos principais

- Reduzir o tempo de conferencia mensal.
- Substituir a planilha manual por base estruturada e auditavel.
- Padronizar diferentes layouts de imobiliarias em um modelo unico.
- Identificar erros, omissoes, despesas sem comprovante e repasses divergentes.
- Suportar documentos recebidos em multiplas remessas para a mesma competencia.
- Preparar dados para o eGestor sem deixar o eGestor ditar a modelagem interna.

## Fora do MVP 1

- Captura automatica de emails.
- n8n como fluxo principal.
- Lancamento automatico no eGestor sem revisao humana.
- Dashboard financeiro completo.
- App mobile.
- Conciliacao bancaria automatica.
- Multi-tenancy.
- Importacao historica da planilha manual.

## Decisoes obrigatorias

- MVP single-tenant para um proprietario.
- Fluxo principal nativo no sistema; n8n fica fora do MVP.
- Stack decidida: Next.js, Tailwind CSS, shadcn/ui, Supabase, Supabase Storage, Supabase Auth/RLS, Supabase Edge Functions, Supabase Realtime, Claude API e Vercel.
- IA auxilia extracao/classificacao, mas calculo, validacao e aprovacao sao deterministicos e humanos.
- O caso Alive / Grand Messejana II guia o MVP inicial.

