import { IconButton, Icon } from 'rezet';

export function Sizes() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <IconButton ariaLabel="Añadir" onClick={() => {}}>
        <Icon name="plus" />
      </IconButton>
      <IconButton ariaLabel="Buscar" size={48} onClick={() => {}}>
        <Icon name="search" size={20} />
      </IconButton>
      <IconButton ariaLabel="Eliminar" size={32} onClick={() => {}}>
        <Icon name="trash" size={15} />
      </IconButton>
    </div>
  );
}
