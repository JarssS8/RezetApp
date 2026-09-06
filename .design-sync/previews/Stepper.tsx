import { useState } from 'react';
import { Stepper } from 'rezet';

export function Servings() {
  const [value, setValue] = useState(4);
  return (
    <Stepper
      label="Raciones"
      value={value}
      onDecrement={() => setValue((v) => Math.max(1, v - 1))}
      onIncrement={() => setValue((v) => v + 1)}
    />
  );
}

export function Small() {
  const [value, setValue] = useState(2);
  return (
    <Stepper
      label="Paquetes"
      size="sm"
      value={value}
      onDecrement={() => setValue((v) => Math.max(0, v - 1))}
      onIncrement={() => setValue((v) => v + 1)}
      formatted={`${value} ud`}
    />
  );
}
