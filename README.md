# chessmatic

Chessmatic is a chess puzzle autobattler designed to be a mobile-friendly PWA.


## Development

Run the engine regression tests and verify the stored puzzle pars:

```sh
node --test
node solve-puzzles.js --check
```

After changing engine rules or puzzle setups, rebake the external puzzle data with
`node solve-puzzles.js`, then synchronize the embedded fallback data in `index.html`.
