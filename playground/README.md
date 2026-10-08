# nanotalk

The Nanoarguments playground and end-to-end test bed. It shows recent statements from the nanopub
network and allows posting or replying with a stance. Posts are signed as Test User
(`0000-0000-0000-0000`) with a throwaway key and published to the test registry only.

## Run

Serve the repository root and open `/playground/`:

```bash
python3 -m http.server 5173
```

## Test

```bash
yarn install
yarn playwright install --with-deps
yarn test:e2e
```

Most tests use a fake registry; one test publishes two nanopubs to the real test registry.
