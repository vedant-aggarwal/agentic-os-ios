import { ListScreen, type Row } from '@/components/ListScreen';

type Idea = { id: string; title: string; status: string; score?: number };

const pick = (b: { ideas: Idea[] }): Row[] =>
  [...b.ideas]
    .sort((a, z) => (z.score ?? 0) - (a.score ?? 0))
    .map((i) => ({ id: i.id, title: i.title, status: i.status, meta: i.score != null ? `Score ${i.score}` : undefined }));

export default function Ideas() {
  return (
    <ListScreen
      title="Ideas"
      path="/api/ideas"
      pick={pick}
      order={['inbox', 'selected', 'dropped']}
      initial="inbox"
      emptyText="No ideas in this list. New ideas land in the inbox when Content OS finds them."
    />
  );
}
