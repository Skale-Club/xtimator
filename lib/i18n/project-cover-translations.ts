/**
 * Static pt/es copy for project thumbnails (components/projects/project-cover-dialog.tsx
 * and the row menus). Keys are the exact English strings passed to t().
 * Spread into staticDict in translations.ts.
 */
type Dict = Record<string, string>

export const projectCoverTranslations: Record<'pt' | 'es', Dict> = {
  pt: {
    // Custom project order (components/projects/project-table.tsx)
    'Custom order': 'Ordem personalizada',
    'Clear the search and filters to reorder.': 'Limpe a busca e os filtros para reordenar.',
    'Could not move the project.': 'Não foi possível mover o projeto.',
    'Thumbnail': 'Miniatura',
    'Change thumbnail': 'Alterar miniatura',
    'Choose a photo from this project or upload an image.': 'Escolha uma foto deste projeto ou envie uma imagem.',
    'Project photos': 'Fotos do projeto',
    'This project has no photos yet.': 'Este projeto ainda não tem fotos.',
    'Upload image': 'Enviar imagem',
    'Use first photo automatically': 'Usar a primeira foto automaticamente',
    'Remove thumbnail': 'Remover miniatura',
    'Thumbnail updated': 'Miniatura atualizada',
    'Thumbnail removed': 'Miniatura removida',
    'Current thumbnail': 'Miniatura atual',
    'Use this photo as thumbnail': 'Usar esta foto como miniatura',
    'Could not load the photos.': 'Não foi possível carregar as fotos.',
    'Could not update the thumbnail.': 'Não foi possível atualizar a miniatura.',
    'Unsupported image format. Please upload a PNG, JPG, or WebP file.': 'Formato de imagem não aceito. Envie um arquivo PNG, JPG ou WebP.',
    'This image is too large. Choose a smaller one.': 'Esta imagem é grande demais. Escolha uma menor.',
    'This image could not be read. Choose another one.': 'Não foi possível ler esta imagem. Escolha outra.',
    'This photo is in HEIC format. Choose a JPG or PNG, or set the camera to "Most compatible".': 'Esta foto está em formato HEIC. Escolha um JPG ou PNG, ou configure a câmera para "Mais compatível".',
  },
  es: {
    // Custom project order (components/projects/project-table.tsx)
    'Custom order': 'Orden personalizado',
    'Clear the search and filters to reorder.': 'Quita la búsqueda y los filtros para reordenar.',
    'Could not move the project.': 'No se pudo mover el proyecto.',
    'Thumbnail': 'Miniatura',
    'Change thumbnail': 'Cambiar miniatura',
    'Choose a photo from this project or upload an image.': 'Elige una foto de este proyecto o sube una imagen.',
    'Project photos': 'Fotos del proyecto',
    'This project has no photos yet.': 'Este proyecto aún no tiene fotos.',
    'Upload image': 'Subir imagen',
    'Use first photo automatically': 'Usar la primera foto automáticamente',
    'Remove thumbnail': 'Quitar miniatura',
    'Thumbnail updated': 'Miniatura actualizada',
    'Thumbnail removed': 'Miniatura quitada',
    'Current thumbnail': 'Miniatura actual',
    'Use this photo as thumbnail': 'Usar esta foto como miniatura',
    'Could not load the photos.': 'No se pudieron cargar las fotos.',
    'Could not update the thumbnail.': 'No se pudo actualizar la miniatura.',
    'Unsupported image format. Please upload a PNG, JPG, or WebP file.': 'Formato de imagen no admitido. Sube un archivo PNG, JPG o WebP.',
    'This image is too large. Choose a smaller one.': 'Esta imagen es demasiado grande. Elige una más pequeña.',
    'This image could not be read. Choose another one.': 'No se pudo leer esta imagen. Elige otra.',
    'This photo is in HEIC format. Choose a JPG or PNG, or set the camera to "Most compatible".': 'Esta foto está en formato HEIC. Elige un JPG o PNG, o configura la cámara en "Más compatible".',
  },
}
