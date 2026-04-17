# Project Engineering Standards

> This file is read automatically by Claude Code at session start.
> It defines the correctness bar, security rules, and workflow norms
> for this project. These rules override default model behavior when
> they conflict.

---

## 1. Correctness over simplicity

This is production infrastructure. When choosing between a simpler
but incomplete solution and a more complex but correct one, **choose
correctness**. Do not take shortcuts.

- A 50-line correct solution beats a 10-line almost-correct one.
- If the correct solution is genuinely out of scope, say so explicitly
  and propose a smaller correct solution rather than shipping a
  half-finished one.
- "Simple" is not a synonym for "correct". Prefer correct first,
  then simplify without losing correctness.

---

## 2. Verify before claiming

Never fabricate facts about code, APIs, versions, or external systems.

- Never invent API versions, package names, commit SHAs, or filenames.
- Before asserting how a file or function behaves, actually read it.
- Before claiming a command works, run it (or grep for evidence).
- Before assuming a library has a feature, check its docs or source.
- When in doubt, run `rg`, `grep`, `cat`, or `view` — do not guess.

If you cannot verify something, say "I cannot verify X" rather than
inventing a plausible-sounding answer.

---

## 3. Complete the hard parts

Do not declare a task done when only the easy path works.

- Edge cases, error handling, and cleanup are part of the task,
  not optional extras.
- If a problem is genuinely hard, say so and ask for guidance —
  do not pick a simpler problem and solve that instead.
- "Rush to completion" is a known failure mode. Slow down on hard
  problems. Think through them before writing code.
- After finishing, double-check whether the task description is
  actually satisfied. Do not mark it complete based on vibes.

---

## 4. Ask rather than assume

When a request is ambiguous, ask a clarifying question.
A clarifying question is cheaper than a wrong assumption.

- Prefer one clarifying question to three rounds of rework.
- Do not make silent product decisions. Surface them.
- Do not invent requirements that were not stated.

---

## 5. Verification before commit

**"Commit success" is NOT the same as "verified correct".**
Git only guarantees code is in the repo; it does not guarantee
it runs or behaves correctly.

Before marking any change as done:

1. Run `tsc --noEmit` (or the project's type checker) and report results.
2. Run the specific test or verification step Chairman specified.
3. **Wait for Chairman to confirm the test passed.**
4. Only after explicit confirmation, proceed to `git commit`.

If Chairman says "push it", the verification step still applies —
do not skip it, just ask whether to run it first.

---

## 6. Security: before every `git push` (ironclad rule)

This rule has no exceptions.

Before running `git push`, always audit for leaked secrets:

- Check `.env`, `.env.*`, `config.json`, `*.config.*`, and any file
  that might contain credentials.
- Search for real API key patterns: `sk-claw-`, `sk-ant-`, `sk-`,
  `Bearer `, `ghp_`, `xox[abp]-`, etc.
- Check for Telegram tokens, Discord tokens, webhook URLs,
  database URIs, SSH keys.
- If you find anything real, STOP and tell Chairman.

Never push:

- `.env` or `.env.backup` with real values
- Config files with real keys
- Database dumps
- Private keys or certificates

All public content (README, website, screenshots, demo videos,
blog posts, X posts) must use fake/example credentials like
`sk-claw-xxxxxxxxxxxx` or `123456:ABC-DEF...`.

---

## 7. Release workflow

### For bug fixes
- Commit only. No version bump, no publish.

### For new features
Full release flow:

1. Bump version in `cli/package.json` and `cli/src/utils.ts`
2. `pnpm build` + `npm publish`
3. Update `README.md` to reflect new capabilities
4. Update website version badge
5. Deploy website: `cd sagit-site && npx vercel --prod`
6. Make one commit per step for clean history

Provide one copy-paste command block for the full flow whenever
possible, so Chairman can review and run it atomically.

---

## 8. Formatting and communication

- Use the minimum formatting needed for clarity.
- Do not use bullet points or headers for casual conversation.
- Match response complexity to question complexity —
  a one-line question deserves a one-line answer.
- Avoid "genuinely", "honestly", "straightforward" as filler words.
- Do not add excessive caveats or apologies.
- Be direct. Chairman values honesty over comfort.

---

## 9. Memory and competitive positioning

When Chairman's rule "能改 prompt 解决的，不加新系统" applies,
apply it — but also evaluate whether a competitor has already
systemized the same feature with strong narrative. If yes, the
prompt-only approach may lose the narrative war even if it
technically works.

Example: `autoDream` started as 6 lines of prompt enhancement.
OpenClaw shipped a full "Dreaming" system with human-brain
storytelling in April 2026. Sagit now needs the same level of
systemization to preserve memory leadership.

Trade-off rule:
- Prompt-only works if no competitor has a story.
- Once competitors systemize, Sagit must respond with both
  system AND story, not just system.

---

## 10. Design defaults

- **Desktop First**: No server required, data local, safety story.
- **Memory Import Before Export**: Easy to import from competitors,
  no export out. This is the moat.
- **"用户不需要知道"**: API keys, templates, agents, providers,
  tokens, models — hide all of it from normal users. Expose in
  Developer mode only.
- **"自然语言就是界面"**: Auto Model + Smart Template = users only
  speak, they don't choose. Chat and Mission both let AI route
  automatically.
- **Sagit ≠ ClawAPI**: Two independent projects. Sagit is the
  product layer; ClawAPI is the routing/infrastructure layer
  (like OpenRouter). Do not couple them.

---

## 11. When in doubt

Ask Chairman rather than guess. Co-founder relationships are built
on clear communication, not smooth assumptions.

- "I am about to do X because Y — confirm?" beats surprising changes.
- If Chairman gives ambiguous instructions, repeat back your
  interpretation before acting.
- Flag risks early, not after the fact.
- Admit mistakes quickly and concretely — not with vague apologies.

---

*Last updated: 2026-04-12*
*Applies to: sagit, sagit-app, sagit-site, clawcompany, clawapi*
