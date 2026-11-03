---
id: bad-role
title: Bad role
job: Invalid role fixture.
defaultCadence: "0 5 * * *"
perRun:
  maxPullRequests: 2
  maxChangedLines: 100
requiredEvidence: [repro]
neverDo: [auto-merge]
requires: [repo]
review: pull-request
sources: [https://example.com]
---

This fixture must fail because it permits more than one PR.
