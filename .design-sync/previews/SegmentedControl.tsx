import { useState } from 'react';
import { SegmentedControl } from 'rezet';

export function Locations() {
  const [value, setValue] = useState<'nevera' | 'congelador' | 'despensa'>('nevera');
  return (
    <div style={{ width: 320 }}>
      <SegmentedControl
        value={value}
        onChange={setValue}
        options={[
          { value: 'nevera', label: 'Nevera' },
          { value: 'congelador', label: 'Congelador' },
          { value: 'despensa', label: 'Despensa' },
        ]}
      />
    </div>
  );
}

export function TwoOptions() {
  const [value, setValue] = useState<'metric' | 'imperial'>('metric');
  return (
    <div style={{ width: 220 }}>
      <SegmentedControl
        value={value}
        onChange={setValue}
        options={[
          { value: 'metric', label: 'Métrico' },
          { value: 'imperial', label: 'Imperial' },
        ]}
      />
    </div>
  );
}
