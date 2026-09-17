-- Auditoría run-2, hallazgo BAJO (send-timer-notifications/unbounded-outbound-fanout).
--
-- `endpoint` era texto libre y el cron lo visita cada minuto con el rol de
-- servicio. La validación del cliente es cortesía; el control real es este.

delete from public.push_subscription
 where endpoint !~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/';

alter table public.push_subscription
  add constraint push_subscription_endpoint_host_chk
  check (endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/');
