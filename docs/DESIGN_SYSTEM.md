# Design system

Use local shadcn-vue/Reka primitives, Vue Composition API, Tailwind utilities and
Lucide icons. Semantic tokens live in apps/desktop/src/styles.css. Retain restrained
surfaces, fine borders, readable text and one user-selectable accent. Use semantic
foreground/background pairs; do not hardcode dark surfaces inside feature views.

Theme choices are dark, light and system. Accent choices are mint, blue and violet.
Density changes the root type scale. Reduced motion disables transitions and
animations independently of the operating-system preference. OS reduced motion is
always respected. Shiki emits light/dark tokens for code blocks.

Use explicit labels, visible focus rings, separate selection/action buttons and
Reka dialogs for focus handling. Destructive conversation deletion requires a
confirmation. Errors use live alerts. Long text must wrap or truncate with an
accessible label. Keep manual conversation scrolling under user control.

Visual qualification is tracked separately from compilation in the implementation
plan; complete desktop state/size/theme review remains required.
