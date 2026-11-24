import { useLocalSearchParams } from 'expo-router';
import { OrcaThread } from '@/work/orca/OrcaThread';

// One Orca agent (src/work/orca/OrcaThread.tsx). Keyed by id so another agent starts fresh.
export default function OrcaAgentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const agentId = Array.isArray(id) ? id[0] : id;
  if (!agentId) return null;
  return <OrcaThread key={agentId} id={agentId} />;
}
