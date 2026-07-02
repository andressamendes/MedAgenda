-- Execute no SQL Editor do Supabase
-- Etapa 20: Integridade referencial de notification_logs (Auditoria P1.3)
--
-- Problema: notification_logs.event_id não tinha FK para events.id. Ao
-- excluir um evento (ex.: eventService.deleteEvent), as linhas de
-- notification_logs daquele event_id ficavam órfãs para sempre — nada as
-- removia, pois usuários não têm policy de DELETE sobre a tabela (só
-- SELECT) e o Edge Function nunca revisita eventos que já foram excluídos.
--
-- Requer: 01_events.sql (tabela events), 04_push_notifications.sql (tabela
-- notification_logs).

-- Remove logs órfãos pré-existentes (event_id que não corresponde a nenhum
-- evento atual) para permitir a criação da constraint abaixo sem violar
-- dados legados.
DELETE FROM notification_logs nl
WHERE NOT EXISTS (
  SELECT 1 FROM events e WHERE e.id = nl.event_id
);

-- Formaliza o vínculo já existente na prática entre notification_logs.event_id
-- e events.id. ON DELETE CASCADE remove automaticamente o histórico de
-- notificações de um evento quando ele é excluído — o mesmo padrão já usado
-- em todas as demais FKs do projeto. Não afeta eventos recorrentes: cada
-- ocorrência continua sendo uma linha própria em notification_logs
-- (chave user_id + event_id + event_date), todas apontando para o mesmo
-- event_id da linha-base em events.
ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
