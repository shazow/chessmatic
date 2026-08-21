# chessmatic

Chess Puzzle Autobattler

Open `index.html` directly or serve the repository as a static site.

## Development

Run the engine regression tests and verify the stored puzzle pars:

```sh
node --test
node solve-puzzles.js --check
```

After changing engine rules or puzzle setups, rebake the external puzzle data with
`node solve-puzzles.js`, then synchronize the embedded fallback data in `index.html`.
