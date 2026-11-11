# Contributing

Bug reports, ideas and small pull requests are welcome.

```bash
git clone https://github.com/B-Eddie/nudge.git
cd nudge
npm ci
npm run tauri dev # run the app (macOS)
npm run check     # everything CI runs: typecheck, tests, rustfmt, clippy, native tests
npm test          # just the frontend tests
```

To review UI without the desktop app, run `npm run dev` and open
`http://localhost:1420/preview.html?view=settings&theme=night_garden`. Views: `settings`,
`summary`, `summary-empty`, `onboarding`, `notes`, `breaks`, `menu`, `reminder`, `bubble`,
`overlay`. Add `&still=1` to skip entrance animations for screenshots.

- Keep changes focused. Add a test when you fix a bug.
- Run `cargo fmt --manifest-path src-tauri/Cargo.toml` before pushing; CI rejects unformatted Rust and clippy warnings.
- The pet is Mac-only for now; Windows and Linux ports are welcome but need real hardware testing.
- Art: new companions should match the existing pixel style. Say where the art came from in the PR.

By contributing you agree your work is released under the MIT license.
