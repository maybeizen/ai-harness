# Repository instructions

Read docs/IMPLEMENTATION_PLAN.md and docs/conventions.md before changes. Preserve
existing real provider and credential integrations. Never substitute fixture
backends in production. Respect desktop → contracts and runtime → contracts/providers
boundaries. Runtime owns SQLite and generation persistence; renderer must not
synthesize durable assistant messages. Add strict schemas and native facade validation
for new IPC operations. Do not expose arbitrary commands or filesystem access.

The user requested parallel agents for this implementation: use bounded independent
file ownership and review all contributions. Keep production source files under
300 nonblank/noncomment lines. Tests should exercise failure behavior using real
temporary native resources where relevant. Run targeted checks, then existing quality
gates. Record exact verification limits and leave unverified plan items unchecked.

Secrets, private conversations, SQLite/WAL files and generated build outputs must
never be committed. Do not overwrite unrelated work or force push. Continue the
implementation plan in order; never call the full workstation complete with open
required milestones.
