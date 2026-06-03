-- Adiciona coluna comentario_operador na tabela fechamentos
alter table public.fechamentos
add column if not exists comentario_operador text;
