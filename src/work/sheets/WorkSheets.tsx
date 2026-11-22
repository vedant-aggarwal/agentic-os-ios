import { StyleSheet, View } from 'react-native';
import { type SheetRequest, useSheetRequest } from '../bus';
import { useVoiceHost, VoiceContext } from '../voice';
import { IdeaSheet } from './IdeaSheet';
import { JobSheet } from './JobSheet';
import { NewProjectSheet, ProjectSettingsSheet } from './ProjectSheet';
import { RecorderOverlay } from './RecorderOverlay';
import { TaskSheet } from './TaskSheet';

// The one host for the hub's capture sheets and push to talk. Mount it once, over everything (it fills its parent
// and passes touches through when nothing is shown). openSheet() anywhere shows the matching sheet in the same render;
// the fan's mic events (bus.emitMic) record ideas through the recorder this host owns.
//
// A job can carry an idea and tasks: openSheet({ kind: 'job', project, idea, tasks }) once the bus type has them
// (they are read here when present).

export function WorkSheets() {
  const req = useSheetRequest();
  const rec = useVoiceHost();
  return (
    <VoiceContext.Provider value={rec}>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {req ? <SheetFor key={req.seq} req={req} /> : null}
        <RecorderOverlay live={rec.live} offline={rec.offline} />
      </View>
    </VoiceContext.Provider>
  );
}

function SheetFor({ req }: { req: SheetRequest }) {
  switch (req.kind) {
    case 'idea': return <IdeaSheet project={req.project} text={req.text} />;
    case 'task': return <TaskSheet project={req.project} text={req.text} />;
    case 'job': {
      const r = req as typeof req & { idea?: string | null; tasks?: string[] };
      return <JobSheet project={r.project} text={r.text} idea={r.idea ?? null} tasks={r.tasks ?? []} />;
    }
    case 'project': return <NewProjectSheet name={req.name} />;
    case 'projectSettings': return <ProjectSettingsSheet project={req.project} />;
  }
}
