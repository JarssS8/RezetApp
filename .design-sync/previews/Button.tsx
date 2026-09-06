import { Button } from 'rezet';
import { Icon } from 'rezet';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
      <Button variant="primary" onClick={() => {}}>Guardar</Button>
      <Button variant="secondary" onClick={() => {}}>Cancelar</Button>
      <Button variant="danger" onClick={() => {}}>Eliminar</Button>
      <Button variant="quiet" onClick={() => {}}>Ver detalles</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
      <Button size="cta" full onClick={() => {}}>Empezar a cocinar</Button>
      <Button size="primary" onClick={() => {}}>Guardar receta</Button>
      <Button size="secondary" onClick={() => {}}>Editar</Button>
    </div>
  );
}

export function WithIconAndDisabled() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
      <Button variant="primary" icon={<Icon name="check" size={16} />} onClick={() => {}}>
        Marcar como cocinada
      </Button>
      <Button variant="secondary" disabled onClick={() => {}}>
        No disponible
      </Button>
    </div>
  );
}
