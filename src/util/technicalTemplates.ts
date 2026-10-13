import { NoteType, type Note } from "../model/note";
export type NoteTemplate = Pick<Note, "title" | "type" | "content">;
export const technicalTemplates: NoteTemplate[] = [
  {
    "title": "Engineering design log",
    "content": "# Engineering design log\n\n## Context and constraints\n\n_Write your notes here._\n\n## Requirements\n\n_Write your notes here._\n\n## Options considered\n\n_Write your notes here._\n\n## Decision and tradeoffs\n\n_Write your notes here._\n\n## Evidence and checks\n\n_Write your notes here._\n\n## Open questions\n\n_Write your notes here._\n\n## Next review\n\n_Write your notes here._\n"
  },
  {
    "title": "Lab notebook entry",
    "content": "# Lab notebook entry\n\n## Date and objective\n\n_Write your notes here._\n\n## Safety notes\n\n_Write your notes here._\n\n## Materials and setup\n\n_Write your notes here._\n\n## Method\n\n_Write your notes here._\n\n## Observations\n\n_Write your notes here._\n\n## Results and uncertainty\n\n_Write your notes here._\n\n## Conclusion\n\n_Write your notes here._\n\n## Follow-up\n\n_Write your notes here._\n"
  },
  {
    "title": "Worked problem",
    "content": "# Worked problem\n\n## Problem statement\n\n_Write your notes here._\n\n## Assumptions and units\n\n_Write your notes here._\n\n## Known information\n\n_Write your notes here._\n\n## Formula and method\n\n_Write your notes here._\n\n## Solution reasoning\n\n_Write your notes here._\n\n## Independent check\n\n_Write your notes here._\n\n## Sources\n\n_Write your notes here._\n"
  },
  {
    "title": "Architecture decision record",
    "content": "# Architecture decision record\n\n## Status and date\n\n_Write your notes here._\n\n## Context\n\n_Write your notes here._\n\n## Decision drivers\n\n_Write your notes here._\n\n## Options considered\n\n_Write your notes here._\n\n## Decision\n\n_Write your notes here._\n\n## Consequences and tradeoffs\n\n_Write your notes here._\n\n## Validation\n\n_Write your notes here._\n\n## Review trigger\n\n_Write your notes here._\n"
  },
  {
    "title": "Debugging investigation",
    "content": "# Debugging investigation\n\n## Observed behavior\n\n_Write your notes here._\n\n## Expected behavior\n\n_Write your notes here._\n\n## Minimal reproduction\n\n_Write your notes here._\n\n## Environment\n\n_Write your notes here._\n\n## Hypotheses\n\n_Write your notes here._\n\n## Experiments and evidence\n\n_Write your notes here._\n\n## Root cause\n\n_Write your notes here._\n\n## Fix and regression checks\n\n_Write your notes here._\n"
  },
  {
    "title": "Lecture and review",
    "content": "# Lecture and review\n\n## Topic and date\n\n_Write your notes here._\n\n## Learning goals\n\n_Write your notes here._\n\n## Main ideas\n\n_Write your notes here._\n\n## Examples\n\n_Write your notes here._\n\n## Questions\n\n_Write your notes here._\n\n## Review prompts\n\n_Write your notes here._\n\n## Sources and next session\n\n_Write your notes here._\n"
  },
  {
    "title": "Experiment record",
    "content": "# Experiment record\n\n## Hypothesis\n\n_Write your notes here._\n\n## Variables and controls\n\n_Write your notes here._\n\n## Method\n\n_Write your notes here._\n\n## Results\n\n_Write your notes here._\n\n## Uncertainty and limitations\n\n_Write your notes here._\n\n## Conclusion\n\n_Write your notes here._\n\n## Next experiment\n\n_Write your notes here._\n"
  },
  {
    "title": "Project calculation sheet",
    "content": "# Project calculation sheet\n\nUse your private calculator separately. This document does not import calculator inputs, variables, history or results.\n\n## Objective and constraints\n\n_Write your notes here._\n\n## Assumptions and units\n\n_Write your notes here._\n\n## Method and equations\n\n_Write your notes here._\n\n## Reasoning\n\n_Write your notes here._\n\n## Verification approach\n\n_Write your notes here._\n\n## Sources and review\n\n_Write your notes here._\n"
  }
].map(template => ({ ...template, type: NoteType.Document }));
