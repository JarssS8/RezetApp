import { StepNumber } from 'rezet';

export function Sequence() {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <StepNumber n={1} />
      <StepNumber n={2} />
      <StepNumber n={3} size={32} />
    </div>
  );
}
