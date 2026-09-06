import { Calendar } from 'rezet';

export function Basic() {
  return <Calendar />;
}

export function SundayFirstNoAdjacent() {
  return <Calendar mondayFirst={false} showAdjacentDays={false} />;
}
