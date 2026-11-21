/**
 * Static pt/es copy for the universal side panel (components/ui/side-panel.tsx)
 * and its first user, the Price Book category column. Keys are the exact
 * English strings passed to t(). Spread into staticDict in translations.ts.
 */
type Dict = Record<string, string>

export const sidePanelTranslations: Record<'pt' | 'es', Dict> = {
  pt: {
    'Collapse sidebar': 'Recolher barra lateral',
    'Expand sidebar': 'Expandir barra lateral',
    'Drag to reorder': 'Arraste para reordenar',
    'Categories': 'Categorias',
    'All categories': 'Todas as categorias',
    'Filter categories': 'Filtrar categorias',
    'Uncategorized': 'Sem categoria',
    'Move up': 'Mover para cima',
    'Move down': 'Mover para baixo',
    'Filter': 'Filtrar',
    'No matches': 'Nenhum resultado',
    'Could not reorder the categories.': 'Não foi possível reordenar as categorias.',
    'Integration categories': 'Categorias de integrações',
    'Notification events': 'Eventos de notificação',
  },
  es: {
    'Collapse sidebar': 'Contraer barra lateral',
    'Expand sidebar': 'Expandir barra lateral',
    'Drag to reorder': 'Arrastra para reordenar',
    'Categories': 'Categorías',
    'All categories': 'Todas las categorías',
    'Filter categories': 'Filtrar categorías',
    'Uncategorized': 'Sin categoría',
    'Move up': 'Mover arriba',
    'Move down': 'Mover abajo',
    'Filter': 'Filtrar',
    'No matches': 'Sin resultados',
    'Could not reorder the categories.': 'No se pudieron reordenar las categorías.',
    'Integration categories': 'Categorías de integraciones',
    'Notification events': 'Eventos de notificación',
  },
}
