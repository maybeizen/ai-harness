# AXIOM — COMPLETE AI WORKSTATION

## Master Implementation Directive: Full Product Completion, Advanced Agents, Customization, and Professional UI

You are the principal software architect, senior desktop engineer, AI systems engineer, product designer, QA lead, and release engineer responsible for completing my existing Tauri-based AI workstation.

This is a comprehensive implementation assignment.

The application already has functional multi-provider chat and portions of its persistence and UI architecture. Do not rebuild the application from scratch.

Your job is to finish the application, resolve all outstanding limitations, implement the additional features below, and bring the entire product to a professional release-quality standard.

**Do not stop after planning. Execute the plan.**

Use Codex's native parallel subagent capabilities extensively, with independent workstreams, isolated file ownership, coordinated integration, and dedicated review agents.

Do not misrepresent incomplete features as finished.

---

# 1. Existing State and Outstanding Work

The previous implementation reported:

> Remaining work includes workspace tools, agent orchestration, terminal/Git/diff workflows, MCP, and full native restart qualification. History currently displays 200 conversations; immediate-close preference flushing remains pending. Live providers were not retested.

Treat this as an explicit list of outstanding defects and incomplete features.

Resolve every item.

Specifically:

- Implement workspace tools.
- Implement complete agent orchestration.
- Implement terminal integration.
- Implement Git workflows.
- Implement code diff workflows.
- Implement MCP support.
- Perform real native Tauri restart qualification.
- Remove the arbitrary 200-conversation history limitation using scalable pagination or virtualization.
- Ensure preferences flush reliably during immediate shutdown.
- Retest every available live provider using authorized credentials.
- Report providers that cannot be retested, rather than marking them verified.

Do not assume the previous implementation is correct merely because it builds.

Perform an architectural and functionality audit before modifying code.

---

# 2. Product Identity and Rebranding

Rename the application to **Axiom**, provisionally.

Before finalizing, investigate obvious naming conflicts and repository conventions. If Axiom is unsuitable, select another short, distinctive, professional name and document the decision.

Update all appropriate product references:

- Tauri application metadata.
- Window titles.
- Desktop executable naming.
- Installer metadata.
- Application menus.
- About screen.
- Documentation.
- Icons.
- Splash/loading screens.
- Internal display names.
- Package metadata where appropriate.

Preserve stable application identifiers and data paths where necessary to avoid losing existing user data.

Implement a migration strategy for any renamed configuration or storage directories.

## Custom icon and visual identity

Generate an original, custom-designed application icon using Codex's available image-generation capability.

Do not merely choose a generic Lucide icon as the product logo.

Design direction:

- Premium software-product identity.
- Distinctive geometric symbol.
- Minimal and recognizable.
- Suitable for a developer-focused AI application.
- Attractive at both 16px and 512px.
- Compatible with light and dark backgrounds.
- No text inside the icon.
- No copied logos from other AI companies.

Generate a high-resolution master asset and derive platform-specific icon files.

Create required Tauri icon formats for supported platforms.

Verify actual rendering in the desktop titlebar, dock/taskbar, installer, and application UI where supported.

If image generation is unavailable, document the limitation and use an original vector fallback rather than falsely claiming an image was generated.

Standardize application-wide icon usage with Lucide and consistent sizing, stroke weight, alignment, and semantics.

---

# 3. Mandatory Engineering Process

## Repository audit

Inspect:

- Current architecture.
- Existing components.
- Current provider implementations.
- Authentication flows.
- Data persistence.
- Settings.
- Native integrations.
- Existing tests.
- UI inconsistencies.
- Known bugs.
- Git status.
- Build system.
- Platform compatibility.

Preserve existing functionality.

## Research

Consult current official documentation for:

- Tauri.
- Vue.
- Tailwind CSS.
- shadcn-vue.
- Model provider SDKs.
- Gemini CLI and language-server capabilities.
- MCP.
- Codex integration.
- Terminal libraries.
- Git integration.
- Secure credential storage.

Use stable, supported APIs.

## Planning

Create or update a detailed implementation plan with:

- Feature inventory.
- Dependency graph.
- Parallel work assignments.
- Milestones.
- Acceptance criteria.
- Risks.
- Test plans.
- Completion status.

Keep the plan updated throughout implementation.

## Parallelization

Use specialized Codex subagents for:

- Native desktop and runtime.
- Provider integrations.
- Agent orchestration.
- UI and design system.
- Persistence and settings.
- Workspaces and Git.
- Terminal and MCP.
- Security.
- QA and automated testing.

Use isolated branches/worktrees or clearly separated file ownership.

Integrate work incrementally.

Do not allow agents to overwrite each other's changes.

---

# 4. Complete Visual Design System

The application must feel like a professional commercial desktop product.

Use Cursor, Codex, Claude Desktop, ChatGPT Desktop, and Linear as quality references.

Do not copy proprietary branding or layouts.

## Mandatory stack

- Tauri v2.
- Vue 3.
- TypeScript.
- Tailwind CSS.
- shadcn-vue.
- Lucide icons.

Use semantic design tokens throughout the application.

## Design requirements

- Professional typography.
- Consistent spacing.
- Refined borders.
- Restrained shadows.
- Clear hierarchy.
- Consistent interactive states.
- Smooth, subtle animations.
- Excellent keyboard navigation.
- Accessibility.
- Responsive desktop layouts.
- Proper dark and light themes.

Avoid excessive gradients, visual noise, unnecessary glassmorphism, inconsistent border radii, and decorative controls.

## Fix every broken input

Perform a complete audit of all input controls.

This includes:

- Text inputs.
- Textareas.
- Search fields.
- Comboboxes.
- Select menus.
- Dropdowns.
- Sliders.
- Switches.
- Checkboxes.
- Radio groups.
- Color pickers.
- File pickers.
- Number inputs.
- Keyboard shortcut recorders.
- Dialog inputs.
- Provider credential fields.

Fix:

- Incorrect heights.
- Broken padding.
- Text clipping.
- Placeholder colors.
- Focus rings.
- Disabled states.
- Border inconsistencies.
- Icon positioning.
- Incorrect line heights.
- Dropdown alignment.
- Theme compatibility.
- Hover styling.
- Validation feedback.
- Keyboard behavior.

Create shared input styling primitives.

Do not patch individual inputs with arbitrary CSS unless necessary.

Verify inputs visually in every theme and density setting.

---

# 5. Advanced Appearance and Customization

Build a complete customization system.

## Themes

Support:

- Dark mode.
- Light mode.
- System theme.
- Custom themes.
- Import/export theme presets.

## Color customization

Allow customization of:

- Accent color.
- Background color.
- Surface colors.
- Text colors where appropriate.
- Border intensity.
- Highlight colors.
- Syntax highlighting theme.

Use validated color values and contrast-aware defaults.

## Density

Support:

- Compact.
- Comfortable.
- Spacious.

Density must affect component dimensions, spacing, sidebar rows, toolbars, menus, and relevant typography consistently.

## Background images

Allow users to:

- Select a local background image.
- Remove it.
- Adjust opacity.
- Adjust blur.
- Adjust positioning.
- Adjust overlay darkness.
- Choose whether it appears globally or only behind conversations.

Use safe local asset handling.

Avoid storing large images directly inside settings JSON.

Ensure readability and contrast remain acceptable.

## Layout customization

Support:

- Sidebar visibility.
- Sidebar width.
- Right-panel visibility.
- Right-panel width.
- Panel arrangements.
- Chat width.
- Message density.
- Composer positioning where practical.
- Resizable panels.
- Optional compact titlebar.

Persist all relevant settings.

Provide a reset-to-defaults action.

Include live previews where useful.

---

# 6. Projects, Workspaces, and Directory-Based Sessions

Implement a robust organization model.

Distinguish between:

**General chats**

- Conversations with no project or directory association.

**Directory-associated chats**

- Conversations referencing a local directory without requiring a formal project.

**Projects**

- Named collections of conversations associated with a specific local project or workspace.

## Project functionality

Users must be able to:

- Create a project.
- Rename a project.
- Delete a project without necessarily deleting its conversations.
- Associate a local directory.
- Change the directory.
- Add project instructions.
- Set a preferred model.
- Set default agent mode.
- Configure project-specific tools.
- View all related conversations.
- Create new conversations inside the project.
- Move conversations between projects.
- Remove conversations from a project.
- Archive projects.
- Pin favorite projects.

## Directory associations

Allow chats to reference a directory without creating a project.

Display directory-associated conversations together.

Use canonicalized directory paths for identity, while preserving user-friendly display names.

Do not incorrectly merge unrelated directories with identical names.

Handle moved, renamed, deleted, or inaccessible directories.

Allow reassociation.

## Sidebar organization

Create a clean hierarchy:

- New Chat.
- Search.
- Projects.
- Directories.
- General Chats.
- Archived Sessions.

Support collapsible groups.

Persist expansion states.

Support context menus and drag-and-drop where appropriate.

Implement scalable history loading, search, and virtualization.

Remove the 200-conversation display limitation.

---

# 7. Full Agent Mode System

All supported modes must be visible, selectable, understandable, and functional.

Do not hide them behind obscure configuration menus.

Provide a polished mode selector near the chat composer.

Implement these modes:

## Ask Mode

- Conversational interaction.
- Read-only context.
- No file modifications.
- No command execution without explicit permission.

## Plan Mode

- Inspect project.
- Analyze requirements.
- Produce implementation plans.
- Identify dependencies and risks.
- No modifications without approval.

## Agent Mode

- Execute multi-step tasks.
- Read and edit files.
- Run commands.
- Use tools.
- Validate results.
- Report outcomes.

## Multitask Mode

- Decompose complex tasks.
- Spawn multiple independent agents where supported.
- Execute independent subtasks concurrently.
- Coordinate dependencies.
- Aggregate results.
- Detect conflicting file modifications.
- Present task progress.
- Support cancellation.

Implement real concurrency and task isolation, not a visual simulation.

## Debug Mode

Implement a specialized debugging workflow.

Users can:

1. Select Debug Mode.
2. Paste an error, stack trace, failing test, or log.
3. Ask the agent to investigate.
4. Let the agent inspect the associated project.
5. Identify likely failure origins.
6. Add temporary diagnostic logging or instrumentation with appropriate approval.
7. Run tests or commands.
8. Inspect generated logs.
9. Form and test hypotheses.
10. Propose or apply a fix.
11. Ask the user whether the issue was reproduced, resolved, or requires more context.

The debug agent should:

- Identify the language/framework.
- Trace relevant call paths.
- Inspect dependencies.
- Detect likely root causes.
- Avoid excessive logging.
- Redact secrets.
- Clearly distinguish hypotheses from verified findings.
- Track temporary instrumentation.
- Offer to remove temporary debug code afterward.
- Preserve unrelated changes.

Provide a dedicated Debug Mode activity interface showing:

- Error summary.
- Investigation steps.
- Hypotheses.
- Instrumentation changes.
- Logs.
- Reproduction status.
- Fix status.
- Follow-up questions.

Do not falsely claim an issue is fixed without verification.

## Code Review Mode

Provide a dedicated Code Review tab/workflow.

Implement a specialized review agent that examines:

- Git diffs.
- Changed files.
- Relevant surrounding code.
- Logic bugs.
- Regressions.
- Edge cases.
- Missing tests.
- Performance issues.
- Incorrect error handling.
- Concurrency problems.
- API misuse.

Findings must include:

- Severity.
- File.
- Line or range.
- Explanation.
- Evidence.
- Suggested correction.
- Confidence where useful.

Avoid vague generic feedback.

Allow users to review findings and request fixes.

## Security Audit Mode

Provide a separate Security Audit tab/workflow.

Use a specialized security-review agent to inspect:

- Authentication.
- Authorization.
- Secret handling.
- Injection vulnerabilities.
- Path traversal.
- Unsafe command execution.
- Dependency risks.
- IPC boundaries.
- Data exposure.
- Insecure defaults.
- Tool permissions.
- MCP trust boundaries.

Use static analysis and dependency checks where available.

Provide severity-ranked findings with evidence and actionable mitigations.

Never claim a codebase is secure merely because no issues were detected.

---

# 8. Permission and Approval Modes

Implement three distinct permission policies.

## Manual Approvals

Require explicit approval for sensitive operations.

Show:

- Requested operation.
- Target files or commands.
- Risk summary.
- Allow once.
- Deny.
- Allow for session where safe.

## Automatic Approvals

Automatically approve operations that satisfy configured safety policies.

Require manual approval for higher-risk actions.

Make the policy transparent and configurable.

## Full Access

Permit broader autonomous operation within explicitly configured boundaries.

Display a clear warning before enabling.

Full Access must not disable operating-system security or bypass provider restrictions.

Always retain protection against credential exfiltration, workspace escapes, and explicitly prohibited operations.

Persist the selected policy appropriately.

Support per-project overrides.

Provide a permission history.

---

# 9. Complete Tool Calling

Implement reliable tool execution across supported providers.

Requirements:

- Typed tool schemas.
- Input validation.
- Provider-specific tool-call normalization.
- Tool execution lifecycle.
- Streaming tool status.
- Structured results.
- Error handling.
- Timeouts.
- Cancellation.
- Permission checks.
- Audit logs.
- Retry policies.
- Duplicate-call protection where appropriate.

Built-in tools should include:

- Read file.
- Write file.
- Edit file.
- Delete file.
- Search files.
- Search content.
- List directories.
- Execute command.
- Git status.
- Git diff.
- Git commit with explicit approval.
- Run tests.
- Inspect logs.
- Apply patches.

Prevent unsupported models from entering workflows that require tool calling.

---

# 10. Terminal, Git, and Diff Workflows

Implement a full integrated terminal.

Features:

- Interactive shell.
- Terminal tabs.
- Working directory selection.
- Process lifecycle management.
- Streaming output.
- Resize handling.
- Command history where appropriate.
- Safe termination.
- Agent command visibility.

Implement Git integration:

- Repository detection.
- Branch display.
- Working-tree status.
- Changed files.
- Staged/unstaged changes.
- Diff viewing.
- Stage/unstage.
- Commit with confirmation.
- Conflict visibility.
- Safe revert workflows.

Implement a professional code diff interface:

- Unified diff.
- Split diff.
- Syntax highlighting.
- Line numbers.
- File navigation.
- Change summaries.
- Accept/reject actions where safe.
- External modification detection.

Do not silently overwrite existing user changes.

---

# 11. Gemini Account Integration

Investigate and implement Google's officially supported Gemini CLI and relevant language-server integration capabilities.

The goal is to let users connect eligible Google/Gemini accounts without requiring an API key where official tooling permits it.

Requirements:

- Research the current Gemini CLI authentication model.
- Determine whether an official language-server protocol exists and whether it exposes supported chat/agent inference functionality.
- Prefer documented interfaces and supported CLI integration.
- Support account sign-in through official flows.
- Detect authentication state.
- Discover supported models and capabilities.
- Handle expired authentication.
- Handle CLI installation and version compatibility.
- Provide clear setup instructions.

Do not assume a language server is a general-purpose inference API.

Do not scrape browser sessions or extract credentials.

Do not modify official CLI authentication files directly.

If supported, use the official CLI as a managed subprocess with structured communication.

If an intended integration is unsupported, document the limitation and provide an official alternative.

Never advertise account access that has not been verified.

---

# 12. Model Selector Redesign

Redesign the model selection interface.

The primary selector must show:

- Provider/company name.
- Model name.
- Model icon where appropriate.
- Capability indicators.
- Availability status.

Do not organize the main selector around subscription plans.

For example, models should be grouped under their actual providers, not under Plus, Pro, Premium, or other subscription labels.

Subscription and billing details belong in provider/account settings.

Support:

- Search.
- Provider grouping.
- Favorites.
- Recent models.
- Capability filtering.
- Model-specific settings.
- Clear disabled states.
- Helpful unavailable-model explanations.

Keep the primary interaction fast and uncluttered.

---

# 13. Complete Settings System

Build a full settings interface with the following sections.

## General

- Startup behavior.
- Default workspace.
- Default model.
- Default mode.
- Language where supported.
- Update preferences.
- Data location.
- Crash recovery.
- Telemetry preferences.

## Appearance

- Theme.
- Colors.
- Density.
- Typography.
- Background image.
- Layout.
- Animations.
- Chat appearance.

## Notifications

- Task completion.
- Agent approval requests.
- Errors.
- Background tasks.
- Sound preferences.
- Native notifications.
- Do Not Disturb.

## Voice-to-Text

- Microphone selection.
- Recording shortcut.
- Speech transcription provider.
- Language.
- Push-to-talk behavior.
- Permission handling.
- Transcription preview.
- Privacy controls.

Use officially supported speech services or local transcription engines.

Do not assume free speech-to-text access through existing subscriptions.

## Keyboard Shortcuts

Implement a fully customizable shortcut system.

Allow:

- Viewing all shortcuts.
- Recording new shortcuts.
- Conflict detection.
- Resetting defaults.
- Import/export.
- Context-aware shortcuts.
- Disabling shortcuts.

Persist mappings.

Respect OS-reserved shortcuts.

## Providers

- Add provider.
- Remove provider.
- Authentication.
- Connection tests.
- Model discovery.
- Custom endpoints.
- API keys.
- Capability settings.
- Provider diagnostics.

## Accounts

- Connected accounts.
- Authentication status.
- Reauthentication.
- Disconnect.
- Account-specific preferences.
- Secure credential handling.

## Files

- Workspace permissions.
- File access rules.
- Attachment limits.
- Default directories.
- File exclusions.
- Temporary file cleanup.

## Archived Sessions

- View archived conversations.
- Search.
- Restore.
- Delete.
- Bulk operations.
- Retention preferences.

## Engine

- Agent concurrency.
- Context management.
- Execution limits.
- Tool timeouts.
- Retry behavior.
- Approval policy.
- Logging.
- Debugging.
- Background execution.
- Model fallback policies.

## Customization

- Custom themes.
- Custom instructions.
- Rules.
- Skills.
- MCP servers.
- Prompt presets.
- Import/export configuration.
- Workspace-specific overrides.

Additionally, create dedicated configuration views for:

### Rules

Support global, workspace, and project-specific instructions.

Allow editing, enabling/disabling, prioritizing, and importing rules.

### MCP Servers

Support adding, editing, removing, enabling, disabling, and testing MCP servers.

Display available tools and connection status.

### Skills

Support discovering and configuring locally installed agent skills.

Use a documented skill format.

Validate skill metadata.

Clearly communicate permissions and trust requirements.

Do not execute untrusted skill instructions without appropriate controls.

All settings must be functional, validated, and persisted.

No placeholder toggles.

---

# 14. Quality-of-Life Features

Implement thoughtful features that improve daily usability.

Prioritize:

- Command palette.
- Global search.
- Recent projects.
- Favorite conversations.
- Pinned sessions.
- Conversation archive.
- Session duplication.
- Conversation export.
- Message editing.
- Regenerate response.
- Copy code.
- Copy entire response.
- Search within conversation.
- Jump to latest message.
- Scroll position restoration.
- Draft persistence.
- Undo for reversible actions.
- Confirmation for destructive actions.
- Toast notifications.
- Keyboard navigation.
- Context menus.
- Drag-and-drop files.
- Quick workspace switching.
- Recently used models.
- Favorite models.
- Task completion notifications.
- Background task status.
- Session checkpoints.
- Crash recovery.
- Diagnostics panel.
- Error report export.
- Data backup/export.
- Settings import/export.

Where feasible, implement:

- Background agent queue.
- Task scheduling.
- Per-session execution summaries.
- Resource usage indicators.
- Model usage statistics where available.
- Project-specific memory.
- Reusable prompt templates.
- Agent task templates.
- Diff checkpoints.
- Recovery from interrupted agent sessions.

Do not add features merely to increase the feature count.

Every feature must have a clear user benefit, consistent UI, and working implementation.

---

# 15. Persistence and Native Restart Qualification

Implement robust persistence for:

- Chats.
- Projects.
- Directory associations.
- Model selections.
- Modes.
- Permission policies.
- Settings.
- Themes.
- Background images.
- Sidebar state.
- Panel dimensions.
- Window state.
- Draft messages.
- Keyboard shortcuts.
- Rules.
- MCP configuration.
- Skills configuration.
- Archived sessions.

Use versioned schemas and migrations.

Implement reliable shutdown flushing.

Test rapid changes followed immediately by application termination.

Test normal close, restart, and crash recovery separately.

Do not rely exclusively on browser-based tests.

Perform actual native Tauri restart tests where the environment supports them.

Verify that user data and preferences survive.

Handle missing or invalid persisted values gracefully.

---

# 16. Security and Privacy

Treat the application as a privileged local tool.

Protect:

- API credentials.
- Account tokens.
- Local files.
- Terminal access.
- Git repositories.
- User conversations.
- MCP credentials.
- Diagnostic logs.

Implement:

- Secure credential storage.
- Scoped filesystem permissions.
- Path validation.
- Command execution controls.
- Explicit destructive-action approval.
- Sensitive-data redaction.
- IPC validation.
- Safe process lifecycle management.
- Dependency vulnerability review.
- Untrusted-content boundaries.

Do not let model-generated instructions override application security policy.

Do not allow external content to silently authorize privileged actions.

Full Access mode must remain bounded by explicit user-granted permissions.

---

# 17. Comprehensive Testing

Implement and run:

- Type checks.
- Linting.
- Formatting.
- Unit tests.
- Component tests.
- Integration tests.
- End-to-end tests.
- Rust/native tests.
- Provider adapter tests.
- Database migration tests.
- Persistence tests.
- Security tests.
- Agent execution tests.
- Tool-calling tests.
- Permission-policy tests.
- UI regression tests.
- Accessibility tests.
- Native restart tests.
- Production build verification.

Test both normal and abnormal workflows.

Explicitly test:

- Switching modes mid-session.
- Switching models during generation.
- Cancelling agents.
- Multiple concurrent tasks.
- Closing the app during streaming.
- Immediate-close settings persistence.
- Directory reassociation.
- Missing projects.
- Broken MCP connections.
- Failed terminal processes.
- Git conflicts.
- Debug Mode with real test failures.
- Code Review findings.
- Security Audit findings.
- Background image changes.
- Theme switching.
- Keyboard shortcut conflicts.
- Long chat histories.
- Thousands of sessions.
- Narrow windows.
- Reduced-motion mode.
- Provider authentication failures.

Use deterministic test fixtures where possible.

Never remove tests to hide failures.

Never claim a live provider was tested without actually testing it.

---

# 18. Dedicated Visual QA

Perform multiple UI inspection passes.

Inspect all screens in:

- Light mode.
- Dark mode.
- Compact mode.
- Comfortable mode.
- Custom accent themes.
- Background image mode.
- Narrow windows.
- Large windows.
- Empty states.
- Loading states.
- Error states.

Pay special attention to:

- Input styling.
- Select menus.
- Dialog alignment.
- Dropdown clipping.
- Text overflow.
- Sidebar spacing.
- Model selector usability.
- Settings organization.
- Agent activity readability.
- Terminal layout.
- Diff rendering.
- Mode visibility.
- Keyboard focus.
- Animation smoothness.

Fix all discovered critical and major issues.

Avoid arbitrary CSS overrides and duplicated component styles.

Use screenshots and visual regression tooling where supported.

---

# 19. Performance

Optimize:

- Startup time.
- Chat rendering.
- Large histories.
- Search.
- Streaming.
- Agent event processing.
- Terminal output.
- File browsing.
- Database queries.
- Settings persistence.
- Memory usage.
- Background process cleanup.

Use pagination and virtualization where appropriate.

Do not load the entire conversation database into the sidebar.

Avoid blocking the UI thread.

Prevent event-listener leaks and orphaned subprocesses.

---

# 20. GitHub, CI, and Release

Work from the existing repository.

Preserve uncommitted user work.

Create a dedicated implementation branch where appropriate.

Use meaningful commits.

Update documentation.

Configure or improve GitHub Actions for:

- Type checking.
- Linting.
- Unit tests.
- Integration tests.
- Native tests.
- Production builds.
- Dependency checks.

Do not commit secrets or personal conversation databases.

Push verified changes to the configured remote when authorized.

Create or update a pull request where appropriate.

Do not force-push or overwrite unrelated work.

Report any environment or permission limitations.

---

# 21. Final Independent Reviews

After implementation, run independent subagent reviews for:

- Architecture.
- Security.
- Reliability.
- UI/UX.
- Accessibility.
- Performance.
- Test coverage.
- Persistence.
- Native integrations.

Collect findings.

Fix critical and high-priority issues.

Rerun affected tests.

Do not mark an issue resolved without verification.

---

# 22. Definition of Done

The application must provide:

- Professional rebranded identity.
- Custom app icon.
- Cohesive design system.
- Fixed input styling.
- Full theme customization.
- Background image support.
- Density controls.
- Projects.
- Directory-associated chats.
- General chats.
- Persistent conversations.
- Scalable history.
- Full settings.
- Custom keyboard shortcuts.
- Rules.
- Skills.
- MCP servers.
- Multiple agent modes.
- Functional Multitask Mode.
- Functional Debug Mode.
- Code Review.
- Security Audit.
- Tool calling.
- Permission modes.
- Terminal.
- Git integration.
- Diff viewer.
- Provider management.
- Gemini integration where officially supported.
- Model selector redesign.
- Crash recovery.
- Reliable settings persistence.
- Native restart qualification.
- Strong automated test coverage.
- Successful production builds on verified targets.
- Updated documentation.
- Verified GitHub commits.

No fake functionality.

No decorative buttons without actions.

No unsupported provider claims.

No silent failures.

No known critical regressions.

---

# 23. Execution Order

Proceed through these stages:

1. Audit repository and outstanding work.
2. Research current official documentation.
3. Create implementation plan and task ownership.
4. Spawn parallel specialized subagents.
5. Stabilize persistence and existing functionality.
6. Build shared design system and repair inputs.
7. Implement projects and directory organization.
8. Implement complete agent runtime.
9. Implement permissions and tools.
10. Implement terminal, Git, and diffs.
11. Implement MCP, rules, and skills.
12. Implement all agent modes and specialized review workflows.
13. Implement Gemini integration where supported.
14. Build complete settings and customization.
15. Add QoL features.
16. Rebrand and integrate custom application icon.
17. Perform integration and native testing.
18. Perform visual QA and refinement.
19. Conduct independent security and architecture reviews.
20. Fix outstanding issues.
21. Verify builds, documentation, and GitHub state.

Stages may run concurrently when dependencies permit.

Maintain a working application throughout development.

---

# 24. Final Directive

I want this application to feel complete.

Not a prototype.

Not a mockup.

Not a collection of partially connected features.

A genuinely useful, professionally engineered desktop AI workstation.

Use parallel Codex agents to accelerate implementation safely.

Use the latest supported engineering practices.

Make the interface cohesive, understandable, responsive, and visually excellent.

Make every major interaction reliable.

Persist user preferences.

Implement the advanced agent workflows.

Test real functionality.

Fix edge cases.

Keep the repository clean.

Document limitations honestly.

Do not stop after writing a plan. Continue implementing until the feasible scope is complete or a genuine external blocker requires intervention.

When blocked, complete independent tasks rather than abandoning the entire assignment.

At the end, provide an accurate implementation report with tested functionality, remaining limitations, and GitHub status.

**Begin now by auditing the repository, identifying all incomplete work, and launching parallel architecture, UI/UX, provider, runtime, and QA research agents.**
