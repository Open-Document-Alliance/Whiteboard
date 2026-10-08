export const examples = [
  { name: 'An idea, made real', kind: 'Flowchart', description: 'From a first thought to something worth sharing.', tool: 'create_diagram', args: {
    title: 'Good ideas become better together', direction: 'LR',
    nodes: [{ id: 'idea', label: 'Start with an idea', tone: 'amber' }, { id: 'draw', label: 'Make it visible', tone: 'blue' }, { id: 'discuss', label: 'Think together', tone: 'blue' }, { id: 'build', label: 'Make it real', tone: 'green' }],
    edges: [{ from: 'idea', to: 'draw' }, { from: 'draw', to: 'discuss' }, { from: 'discuss', to: 'build' }],
  } },
  { name: 'How a garden grows', kind: 'Visual story', description: 'One small seed. A whole new way to tell the story.', tool: 'create_story', args: {
    title: 'Small beginnings. Room to grow.',
    steps: [
      { title: 'Plant a possibility', body: 'A seed holds the start of something bigger. Give it good soil and a little space.', tone: 'amber' },
      { title: 'Let the roots take hold', body: 'Water and warmth help the first roots grow. Progress begins below the surface.', tone: 'blue' },
      { title: 'Make room for growth', body: 'The first leaves reach toward the light. Small, steady changes start to add up.', tone: 'green' },
      { title: 'Share what grows', body: 'A thriving garden gives back: food, shelter, and seeds for the next beginning.', tone: 'rose' },
    ],
  } },
  { name: 'A simple system', kind: 'Architecture', description: 'See how the moving parts fit together.', tool: 'create_diagram', args: {
    title: 'A small system, clearly explained', direction: 'TB',
    nodes: [{ id: 'person', label: 'Someone with a question', tone: 'amber', shape: 'ellipse' }, { id: 'app', label: 'Web app', tone: 'blue' }, { id: 'api', label: 'API', tone: 'blue' }, { id: 'data', label: 'Saved information', tone: 'green' }, { id: 'tasks', label: 'Background work', tone: 'neutral' }],
    edges: [{ from: 'person', to: 'app' }, { from: 'app', to: 'api' }, { from: 'api', to: 'data', label: 'Read & write' }, { from: 'api', to: 'tasks', label: 'Queue' }],
  } },
] as const;
