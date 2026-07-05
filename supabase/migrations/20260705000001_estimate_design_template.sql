-- Estimate design template system: lets a company pick between visual
-- presentation styles for the estimate PDF and public share page. Purely
-- additive -- content/data computation is unaffected; existing companies
-- default to 'classic' (today's only design) with zero behavior change.
--
-- Distinct from estimate_template_greeting/opener/closer/signature, which
-- are plain-text message content for WhatsApp/SMS/MCP delivery, not
-- document visual design.
alter table companies
  add column estimate_template_style text not null default 'classic';

alter table companies
  add constraint companies_estimate_template_style_check
  check (estimate_template_style in ('classic', 'modern'));

comment on column companies.estimate_template_style is
  'Visual design template id for the estimate PDF/share page (classic|modern). classic is the original design; every existing company defaults to it silently.';
