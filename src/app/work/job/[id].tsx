import { useLocalSearchParams } from 'expo-router';
import { JobThread } from '@/work/thread/JobThread';

// A job's thread (agenticos://job/j7 from a push lands here). Keyed by id so another job starts a fresh stream.
export default function JobRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Array.isArray(id) ? id[0] : id;
  if (!jobId) return null;
  return <JobThread key={jobId} id={jobId} />;
}
