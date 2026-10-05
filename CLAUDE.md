# Noor — project rules

Full spec: docs/SPEC.md. Decisions: docs/DECISIONS.md. Sources: docs/SOURCES.md.

## Working rules
- Implement ONLY the phase I ask for. When done, stop and report. Never start the next phase on your own.
- Report in Arabic: what was built / what was tested and how (commands + results) / what is not done or known issues / decisions needed from me.
- Never claim something is tested or verified unless you actually did it. Viewport emulation ≠ real device.
- Propose better solutions before implementing them; record accepted ones in docs/DECISIONS.md.
- My machine is Windows 11: all commands must work in PowerShell. No Docker requirement.
- Talk to me in Arabic. Code, comments, commits, docs in English.

## Religious content integrity (overrides everything)
- NEVER type Quran, Hadith, Adhkar, translation or Tafsir text from memory or generate it. Import it only via scripts from files in data/sources/ that are recorded in data/sources/SOURCES.lock.json (URL, date, options, license, SHA-256).
- If no approved source exists, leave the content empty and tell me.
- NEVER transform Quran text: no String.normalize(), no regex cleanup, no character replacement, no trimming inside ayahs. Only the separate search index may contain normalized text, and it is never displayed as Quran.
- Content integrity tests must stay green: 114 surahs, 6,236 ayahs, exact code-point equality with the source, and DOM rendering equality.
- Always show the source, translator or author for translations and tafsir. Never present AI-written explanations as tafsir.
- Label moon-sighting-dependent dates as "expected".