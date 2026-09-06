import { AlertDialog } from 'rezet';

export function Basic() {
  return (
    <AlertDialog
      title="¿Eliminar receta?"
      body="Esta acción no se puede deshacer."
      confirmLabel="Cancelar"
      cancelLabel="Eliminar"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}
