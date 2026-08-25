# chessmatic

Chessmatic is a chess puzzle autobattler designed to be a mobile-friendly PWA.

Use the in-game **Editor** to place an enemy force, choose a title, description,
and par, then save it. The puzzle is encoded entirely in the URL fragment as
`#?puzzle=...`; opening that link loads the shared puzzle without a server or
persistent storage.


## Development

Use `devenv shell` to enter the development environment and `devenv test` to run all checks.
