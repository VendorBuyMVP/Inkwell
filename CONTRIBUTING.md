# Contributing to Inkwell

Thanks for helping improve Inkwell. This project is a local-first Markdown editor for Linux and macOS, so changes should preserve a quiet, offline-friendly writing experience.

## Workflow

1. Fork the repository.
2. Create a focused branch from the latest `main`.
3. Make the smallest clear change that solves the issue.
4. Run the relevant checks.
5. Open a pull request against `main`.

Please include these details in your pull request:

- What changed
- Why it changed
- User-facing impact
- Screenshots or short notes for UI changes
- The commands you ran to validate the change

## Project Posture

Inkwell is local-first. Contributions should preserve these requirements:

- No telemetry
- No remote code loading
- No silent persistence of document contents
- No unsafe Markdown rendering through HTML injection
- No runtime npm dependencies unless the pull request makes the case for them

## Checks

Run the standard project check before submitting:

```bash
npm run check
```

For macOS changes, also run:

```bash
npm run macos:build
npm run macos:smoke
```

For packaging, release, or security-sensitive changes, run:

```bash
npm run security:artifacts
```

Some Linux packaging checks require `desktop-file-validate` and `appstreamcli`.

## Pull Request Guidance

Keep pull requests focused. Avoid mixing unrelated refactors with feature work or bug fixes.

If your change affects file handling, Markdown rendering, preferences, desktop integration, or app packaging, describe the risk and how you tested it.

If you are unsure whether a change fits the project, open an issue first and describe the problem you want to solve.
