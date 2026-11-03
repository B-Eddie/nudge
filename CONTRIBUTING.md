# Contributing

Bug reports, ideas and small pull requests are welcome.

```bash
git clone https://github.com/B-Eddie/nudge.git
cd nudge
npm ci
npm test          # frontend tests
npm run build     # type-check + build
npm run tauri dev # run the app (macOS)
cargo test --manifest-path src-tauri/Cargo.toml   # native tests (macOS)
```

- Keep changes focused. Add a test when you fix a bug.
- The pet is Mac-only for now; Windows and Linux ports are welcome but need real hardware testing.
- Art: new companions should match the existing pixel style. Say where the art came from in the PR.

By contributing you agree your work is released under the MIT license.
