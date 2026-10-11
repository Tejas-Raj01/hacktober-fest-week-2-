import React from 'react';
import { QuestScanner } from './QuestScanner';
import { TASK_TARGET_KEYWORDS } from '../services/vision';

export interface QuestTask {
  id: number;
  title: string;
  description: string;
  points?: number;
}

export interface QuestViewProps {
  task: QuestTask;
  targetKeyword?: string;
  onCompleteTask: (proofUrl: string) => void;
  disabled?: boolean;
}

export const QuestView: React.FC<QuestViewProps> = ({
  task,
  targetKeyword,
  onCompleteTask,
}) => {
  const effectiveTarget =
    targetKeyword ||
    TASK_TARGET_KEYWORDS[task.id] ||
    task.title ||
    'bench';

  return (
    <QuestScanner
      targetKeyword={effectiveTarget}
      points={task.points || 10}
      onSuccess={onCompleteTask}
    />
  );
};

export default QuestView;
