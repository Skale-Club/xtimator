// Static translations for Settings → Plan and billing and the settings
// navigation. Kept static (not left to the /api/translate fallback) so the
// page never renders half translated while a batch is in flight, and so
// money and plan wording is reviewed copy, not machine output.
//
// Templates with `{name}` placeholders are filled by <T values={...}> or by
// a `.replace` after t(): translate the template, keep the placeholder.

export const billingTranslations: Record<'pt' | 'es', Record<string, string>> = {
  pt: {
    // Settings navigation
    'Business': 'Negócio',
    'Team': 'Equipe',
    'Plan and billing': 'Plano e cobrança',
    'Estimate defaults': 'Padrões do orçamento',
    'Client message': 'Mensagem ao cliente',
    'AI knowledge': 'Conhecimento da IA',
    'You': 'Você',
    'Account': 'Conta',
    'Appearance': 'Aparência',
    'Connections': 'Conexões',
    'Connected': 'Conectado',
    'Not connected': 'Não conectado',
    'Beta': 'Beta',
    'Use Xtimator from inside Claude, Claude Code, or ChatGPT.': 'Use o Xtimator dentro do Claude, Claude Code ou ChatGPT.',
    '6 tools available · OAuth 2.0 · per-company scope': '6 ferramentas disponíveis · OAuth 2.0 · escopo por empresa',
    'Integrations': 'Integrações',

    // Page + current plan
    'Your plan, credits and payments.': 'Seu plano, seus créditos e pagamentos.',
    'Current plan': 'Plano atual',
    'Free': 'Grátis',
    'Pro': 'Pro',
    'Payment failed': 'Pagamento falhou',
    'Cancels at period end': 'Cancela no fim do período',
    'month': 'mês',
    'year': 'ano',
    'Ends on': 'Termina em',
    'Renews on': 'Renova em',
    'Free plan — your free credits never expire.': 'Plano grátis — seus créditos grátis nunca expiram.',
    'Free plan — your free credits never expire. Subscribe to Pro when they run out.':
      'Plano grátis — seus créditos grátis nunca expiram. Assine o Pro quando acabarem.',
    'This plan was set by support — contact us to change it.':
      'Este plano foi definido pelo suporte — fale com a gente para alterá-lo.',
    'This month': 'Este mês',
    'Photo limit per estimate': 'Limite de fotos por orçamento',
    'Counts reset at the start of each UTC calendar month.':
      'As contagens zeram no início de cada mês (UTC).',
    'Subscribe to Pro': 'Assinar o Pro',
    'We couldn’t charge your card. Manage your plan on xtimator.com from a web browser.':
      'Não conseguimos cobrar seu cartão. Gerencie seu plano em xtimator.com pelo navegador.',
    'We couldn’t charge your card — update your payment method to keep your plan.':
      'Não conseguimos cobrar seu cartão — atualize a forma de pagamento para manter seu plano.',
    'Manage your plan on xtimator.com from a web browser.':
      'Gerencie seu plano em xtimator.com pelo navegador.',
    'Only the company owner can manage billing.': 'Só o dono da empresa pode gerenciar a cobrança.',
    'Auto top-up is available on paid plans. Subscribe to a plan to turn it on.':
      'A recarga automática está disponível nos planos pagos. Assine um plano para ativá-la.',
    'Manage Subscription': 'Gerenciar assinatura',
    'Opening portal...': 'Abrindo portal...',
    'Could not open subscription portal. Please try again.':
      'Não foi possível abrir o portal da assinatura. Tente de novo.',

    // Credits
    'Credit balance': 'Saldo de créditos',
    'Your credits by type, and when they expire.': 'Seus créditos por tipo e quando expiram.',
    'credits available': 'créditos disponíveis',
    'credits': 'créditos',
    'used': 'usado',
    'Usage this billing cycle': 'Uso neste ciclo de cobrança',
    'Monthly credits': 'Créditos mensais',
    'Purchased credits': 'Créditos comprados',
    'Free credits': 'Créditos grátis',
    'Adjustments': 'Ajustes',
    'Expires': 'Expira em',
    'No expiry': 'Não expira',
    'Free credits never expire.': 'Créditos grátis nunca expiram.',
    'Free credits never expire. Subscribe to Pro when they run out.':
      'Créditos grátis nunca expiram. Assine o Pro quando acabarem.',
    'Monthly credits expire when your billing cycle renews.':
      'Os créditos mensais expiram quando seu ciclo de cobrança renova.',
    'You’re almost out of credits for this cycle.': 'Seus créditos deste ciclo estão quase no fim.',
    'You’re running low on credits for this cycle.': 'Seus créditos deste ciclo estão acabando.',
    'Top up now': 'Recarregar agora',

    // Activity
    'Recent activity': 'Atividade recente',
    'Your latest credit grants and usage.': 'Seus créditos recebidos e usados mais recentes.',
    'No credit activity yet.': 'Nenhuma movimentação de créditos ainda.',
    'Monthly grant': 'Créditos do mês',
    'Top-up': 'Recarga',
    'Adjustment': 'Ajuste',
    'Expired': 'Expirado',
    'Price research': 'Pesquisa de preços',
    'Xtimator AI chat': 'Chat do Xtimator AI',
    'Messages': 'Mensagens',
    'Usage': 'Uso',

    // Add credits
    'Add credits': 'Adicionar créditos',
    'One-time packs. Purchased credits expire {months} months after purchase.':
      'Pacotes avulsos. Créditos comprados expiram {months} meses após a compra.',
    'Subscribe to Pro to buy extra credits': 'Assine o Pro para comprar créditos extras',
    'Best value': 'Melhor custo',
    'Buy': 'Comprar',
    'Redirecting...': 'Redirecionando...',
    'Redirecting…': 'Redirecionando…',
    'Could not start top-up. Please try again.': 'Não foi possível iniciar a recarga. Tente de novo.',
    'Auto top-up': 'Recarga automática',
    'On': 'Ativa',
    "We'll add {amount} when your balance drops below {threshold} credits.":
      'Vamos adicionar {amount} quando seu saldo ficar abaixo de {threshold} créditos.',
    'Never run out mid-job. Turn on auto top-up to automatically add credits when your balance gets low.':
      'Não fique sem créditos no meio do serviço. Ative a recarga automática para adicionar créditos quando o saldo baixar.',
    'Auto-top-up failed — update your payment method to keep it active.':
      'A recarga automática falhou — atualize a forma de pagamento para mantê-la ativa.',
    'Manage': 'Gerenciar',
    'Enable auto-top-up': 'Ativar recarga automática',

    // Plan offer
    'Xtimator Pro': 'Xtimator Pro',
    '1 company and 1 user, with every feature included.': '1 empresa e 1 usuário, com todos os recursos incluídos.',
    'Billing interval': 'Período de cobrança',
    'Plan': 'Plano',
    'Monthly': 'Mensal',
    'Annual': 'Anual',
    '/ mo · billed annually': '/ mês · cobrado anualmente',
    'Save {pct}%': 'Economize {pct}%',
    'Resume subscription': 'Retomar assinatura',
    'Switch to annual': 'Mudar para anual',
    'Switch to monthly': 'Mudar para mensal',
    'Upgrade to Pro': 'Mudar para o Pro',
    'Switch to Pro': 'Mudar para o Pro',
    'Most popular': 'Mais popular',
    '1 company · 1 user': '1 empresa · 1 usuário',
    'All features included': 'Todos os recursos incluídos',
    'Monthly credits that renew with your plan': 'Créditos mensais que renovam com seu plano',
    '20 photos per estimate': '20 fotos por orçamento',
    'Custom branding': 'Sua marca nos orçamentos',
    'Priority email support': 'Suporte prioritário por e-mail',
    'Could not start checkout. Please try again.': 'Não foi possível iniciar o pagamento. Tente de novo.',
  },
  es: {
    // Settings navigation
    'Business': 'Negocio',
    'Team': 'Equipo',
    'Plan and billing': 'Plan y facturación',
    'Estimate defaults': 'Valores del presupuesto',
    'Client message': 'Mensaje al cliente',
    'AI knowledge': 'Conocimiento de la IA',
    'You': 'Usted',
    'Account': 'Cuenta',
    'Appearance': 'Apariencia',
    'Connections': 'Conexiones',
    'Integrations': 'Integraciones',

    // Page + current plan
    'Your plan, credits and payments.': 'Su plan, sus créditos y pagos.',
    'Current plan': 'Plan actual',
    'Free': 'Gratis',
    'Pro': 'Pro',
    'Payment failed': 'Pago fallido',
    'Cancels at period end': 'Se cancela al final del período',
    'month': 'mes',
    'year': 'año',
    'Ends on': 'Termina el',
    'Renews on': 'Se renueva el',
    'Free plan — your free credits never expire.': 'Plan gratis — sus créditos gratis nunca vencen.',
    'Free plan — your free credits never expire. Subscribe to Pro when they run out.':
      'Plan gratis — sus créditos gratis nunca vencen. Suscríbase a Pro cuando se acaben.',
    'This plan was set by support — contact us to change it.':
      'Este plan lo configuró soporte — contáctenos para cambiarlo.',
    'This month': 'Este mes',
    'Photo limit per estimate': 'Límite de fotos por presupuesto',
    'Counts reset at the start of each UTC calendar month.':
      'Los conteos se reinician al inicio de cada mes (UTC).',
    'Subscribe to Pro': 'Suscribirse a Pro',
    'We couldn’t charge your card. Manage your plan on xtimator.com from a web browser.':
      'No pudimos cobrar su tarjeta. Gestione su plan en xtimator.com desde un navegador.',
    'We couldn’t charge your card — update your payment method to keep your plan.':
      'No pudimos cobrar su tarjeta — actualice su método de pago para mantener su plan.',
    'Manage your plan on xtimator.com from a web browser.':
      'Gestione su plan en xtimator.com desde un navegador.',
    'Only the company owner can manage billing.': 'Solo el dueño de la empresa puede gestionar la facturación.',
    'Auto top-up is available on paid plans. Subscribe to a plan to turn it on.':
      'La recarga automática está disponible en los planes de pago. Suscríbete a un plan para activarla.',
    'Manage Subscription': 'Gestionar suscripción',
    'Opening portal...': 'Abriendo portal...',
    'Could not open subscription portal. Please try again.':
      'No se pudo abrir el portal de suscripción. Inténtelo de nuevo.',

    // Credits
    'Credit balance': 'Saldo de créditos',
    'Your credits by type, and when they expire.': 'Sus créditos por tipo y cuándo vencen.',
    'credits available': 'créditos disponibles',
    'credits': 'créditos',
    'used': 'usado',
    'Usage this billing cycle': 'Uso en este ciclo de facturación',
    'Monthly credits': 'Créditos mensuales',
    'Purchased credits': 'Créditos comprados',
    'Free credits': 'Créditos gratis',
    'Adjustments': 'Ajustes',
    'Expires': 'Vence el',
    'No expiry': 'No vence',
    'Free credits never expire.': 'Los créditos gratis nunca vencen.',
    'Free credits never expire. Subscribe to Pro when they run out.':
      'Los créditos gratis nunca vencen. Suscríbase a Pro cuando se acaben.',
    'Monthly credits expire when your billing cycle renews.':
      'Los créditos mensuales vencen cuando se renueva su ciclo de facturación.',
    'You’re almost out of credits for this cycle.': 'Casi no le quedan créditos en este ciclo.',
    'You’re running low on credits for this cycle.': 'Le quedan pocos créditos en este ciclo.',
    'Top up now': 'Recargar ahora',

    // Activity
    'Recent activity': 'Actividad reciente',
    'Your latest credit grants and usage.': 'Sus últimos créditos recibidos y usados.',
    'No credit activity yet.': 'Todavía no hay movimientos de créditos.',
    'Monthly grant': 'Créditos del mes',
    'Top-up': 'Recarga',
    'Adjustment': 'Ajuste',
    'Expired': 'Vencido',
    'Price research': 'Investigación de precios',
    'Xtimator AI chat': 'Chat de Xtimator AI',
    'Messages': 'Mensajes',
    'Usage': 'Uso',

    // Add credits
    'Add credits': 'Agregar créditos',
    'One-time packs. Purchased credits expire {months} months after purchase.':
      'Paquetes únicos. Los créditos comprados vencen {months} meses después de la compra.',
    'Subscribe to Pro to buy extra credits': 'Suscríbase a Pro para comprar créditos extra',
    'Best value': 'Mejor valor',
    'Buy': 'Comprar',
    'Redirecting...': 'Redirigiendo...',
    'Redirecting…': 'Redirigiendo…',
    'Could not start top-up. Please try again.': 'No se pudo iniciar la recarga. Inténtelo de nuevo.',
    'Auto top-up': 'Recarga automática',
    'On': 'Activa',
    "We'll add {amount} when your balance drops below {threshold} credits.":
      'Agregaremos {amount} cuando su saldo baje de {threshold} créditos.',
    'Never run out mid-job. Turn on auto top-up to automatically add credits when your balance gets low.':
      'No se quede sin créditos a mitad de un trabajo. Active la recarga automática para agregar créditos cuando el saldo baje.',
    'Auto-top-up failed — update your payment method to keep it active.':
      'La recarga automática falló — actualice su método de pago para mantenerla activa.',
    'Manage': 'Gestionar',
    'Enable auto-top-up': 'Activar recarga automática',

    // Plan offer
    'Xtimator Pro': 'Xtimator Pro',
    '1 company and 1 user, with every feature included.': '1 empresa y 1 usuario, con todas las funciones incluidas.',
    'Billing interval': 'Período de facturación',
    'Plan': 'Plan',
    'Monthly': 'Mensual',
    'Annual': 'Anual',
    '/ mo · billed annually': '/ mes · facturado anualmente',
    'Save {pct}%': 'Ahorre {pct}%',
    'Resume subscription': 'Reanudar suscripción',
    'Switch to annual': 'Cambiar a anual',
    'Switch to monthly': 'Cambiar a mensual',
    'Upgrade to Pro': 'Cambiar a Pro',
    'Switch to Pro': 'Cambiar a Pro',
    'Most popular': 'Más popular',
    '1 company · 1 user': '1 empresa · 1 usuario',
    'All features included': 'Todas las funciones incluidas',
    'Monthly credits that renew with your plan': 'Créditos mensuales que se renuevan con su plan',
    '20 photos per estimate': '20 fotos por presupuesto',
    'Custom branding': 'Su marca en los presupuestos',
    'Priority email support': 'Soporte prioritario por correo',
    'Connected': 'Conectado',
    'Not connected': 'No conectado',
    'Beta': 'Beta',
    'Use Xtimator from inside Claude, Claude Code, or ChatGPT.': 'Use Xtimator dentro de Claude, Claude Code o ChatGPT.',
    '6 tools available · OAuth 2.0 · per-company scope': '6 herramientas disponibles · OAuth 2.0 · alcance por empresa',
    'Could not start checkout. Please try again.': 'No se pudo iniciar el pago. Inténtelo de nuevo.',
  },
}
