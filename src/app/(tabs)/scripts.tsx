import { ListScreen, type Row } from '@/components/ListScreen';

type Script = { id: string; title: string; status: string; stage?: string; shoot_plan?: string };

const pick = (b: { scripts: Script[] }): Row[] =>
  b.scripts.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    meta: s.shoot_plan === 'MISSING' ? 'No shoot plan' : undefined,
  }));

export default function Scripts() {
  return (
    <ListScreen
      title="Scripts"
      path="/api/scripts"
      pick={pick}
      order={['draft', 'approved', 'recorded', 'editing']}
      initial="draft"
      emptyText="No scripts at this stage."
    />
  );
}
