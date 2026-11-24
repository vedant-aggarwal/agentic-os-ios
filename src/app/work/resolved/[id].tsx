import { useLocalSearchParams } from 'expo-router';
import { ResolvedThread } from '@/work/resolved/ResolvedThread';

// One resolved session's saved chat (src/work/resolved/ResolvedThread.tsx). Keyed by id so another starts fresh.
export default function ResolvedRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rid = Array.isArray(id) ? id[0] : id;
  if (!rid) return null;
  return <ResolvedThread key={rid} id={rid} />;
}
