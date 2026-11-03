---
title: Coaching library and plan formats
reviewed: 2026-11-03
---

These are pack conventions, not clinical recommendations. The formats are domain-neutral tasks with tags and resource requirements; movement names are a fitness example. The machine checker proves these stated constraints only, not clinical suitability or completeness of the owner's tags.

## Owner-controlled inputs

`profile.json` is the owner-controlled runtime profile; the manifest profile is a generation snapshot and a fallback for legacy harnesses without profile.json. `profile.schema.json` specifies goals, session-minute and weekly-session limits, available equipment per location, the tracking tool, and precautions attributed to the user or clinician. Preserve precautions verbatim in `notes`; only the user or clinician supplies `excludedTags`. Every precaution entry requires at least one explicit excluded tag. An empty precautions array is only appropriate when the owner explicitly supplies no exclusions; it must not replace unconverted precaution prose. Never infer a restriction from a diagnosis, infer an absence of restrictions, or remove or relax an exclusion. If prose cannot yet be expressed as owner-approved tags, stop tailoring affected activities and request that mapping.

`library.json` follows `library.schema.json`. Its `owner` is `user` or `clinician`. Each item has a unique `id`, a `title`, `tags` and `requiredEquipment`. Tags must be lowercase slugs (letters/digits separated by single hyphens); mixed case or whitespace is an error, never normalized. Excluded tags must occur in the library vocabulary, catching misspellings. Untagged items produce a warning because exclusions cannot apply to them. The owner controls all four fields. Agents may propose a separate review of gaps but cannot change the library to make a plan pass. Equipment-free items declare `requiredEquipment: []`; locations without equipment explicitly declare an empty equipment list. Travel is a separate location. Do not invent an accessible alternative location.

## One-week plan

The library and profile use `owner` mode, with hashes approved by `meta-harness approve <path>`. Pack owner paths are automatically protected during maintenance. Plans and session logs use `seed` mode: init writes them once, updates preserve them and ordinary edits are not drift-tracked. Instructions use `managed` mode; drift is reported without failing check.

`plan.json` follows `plan.schema.json`: `weekOf` is an ISO calendar date starting a seven-day inclusive window; `sessions` have a date within that window, location and items. Every item has only `itemId` and positive `durationMinutes`. Tags and equipment declarations inside a plan are rejected; look them up in the library. Sum all item minutes for the session, including warm-up, transitions and rests represented by owner-approved library items. Count every session against the weekly maximum, even on the same day. An empty plan is valid when no session is appropriate.

Fitness worked example: an owner may register a neutral `practice` movement with explicit tags and no equipment, then allocate ten minutes at a location declaring no equipment. This illustrates representation; it is not an exercise prescription. Do not assume this example is suitable for a real client.

Session logs belong in `logs/sessions.json`: an array of records with `date`, `plannedSessionDate`, `completedItemIds`, `minutes`, and optional user feedback. The progress-review role compares records with the plan and proposes bounded adjustments. It never writes profile precautions or library entries. This log convention is a heuristic for review, not a measured training recommendation.

`checkers/plan-check.ts [target]` reads only the profile/manifest, library and plan; it reports rule counts and relative paths, never the profile's contents. Missing or invalid inputs fail closed. The rules are `unknown-item`, `equipment`, `excluded-tag`, `session-duration` and `weekly-count`; malformed inputs, duplicate library ids or dates outside the declared week produce `input` findings.

`formats.ts` is the TypeBox source for the three committed schemas. Regenerate with `bun run packs/coaching/formats.ts`; tests require the committed schemas to match it.
