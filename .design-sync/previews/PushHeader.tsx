import { PushHeader, IconButton, Icon } from 'rezet';

export function Basic() {
  return (
    <div style={{ width: 360 }}>
      <PushHeader title="Tortilla de patatas" onBack={() => {}} />
    </div>
  );
}

export function WithTrailing() {
  return (
    <div style={{ width: 360 }}>
      <PushHeader
        title="Editar receta"
        onBack={() => {}}
        trailing={
          <IconButton ariaLabel="Guardar" onClick={() => {}}>
            <Icon name="check" size={18} />
          </IconButton>
        }
      />
    </div>
  );
}
