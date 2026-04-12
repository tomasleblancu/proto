import { defineWorkflow } from '@tleblancureta/proto/shared'

export default defineWorkflow({
  name: 'task',
  displayName: 'task',
  entityTable: 'tasks',
  transitionsTable: 'task_transitions',
  phases: [
    {
      name: 'todo',
      label: 'To Do',
      steps: ['created', 'assigned'],
    },
    {
      name: 'in_progress',
      label: 'In Progress',
      steps: ['working', 'review'],
    },
    {
      name: 'done',
      label: 'Done',
      steps: ['completed'],
    },
  ],
})
