# Test fixtures

Input for the end-to-end suite (`app/test/e2e.js`) — **test data, not published course content.**
The app ships no courses; real ones are built from sources kept outside this repository.

| | |
|---|---|
| `fpga-starter/` | one package with an item of every type: 2 trainings, 2 labs, 4 readings (one a prerequisite, one Markdown), 2 videos, 4 materials, 1 project, a 7-week study plan |
| `demo-partner/` | a second publisher, so the catalog checks see two |
| `build.js` | builds both with a throwaway signing key |

Both are **self-contained**: every `source` points inside its own folder, so the suite needs no second
checkout and no signing key.

## How signing works here

`build.js` generates a **key for that run only**, writes the public half into a temp `trusted-keys/`,
builds both packages with the private half, and the suite starts the app with
`SEMITEC_TRUSTED_KEYS` pointing at that folder. So a fixture is trusted **inside this test and nowhere
else** — a student's app rejects it as `untrusted-key`.

That matters: a package signed with the production key would install in any student's app as verified
SemiTec content. Nothing here is, and no key has to be committed for the tests to run.

```bash
node app/test/fixtures/build.js      # see what it produces, in a temp folder
cd app && npm test                   # builds the fixtures, then runs the 75 checks
```

## Changing a fixture

The 75 checks assert this content **exactly** — item titles and ids, a 7-week study plan, a 30-week
project, 6 lab source files, a 4-question lab quiz, specific page and outline counts. Editing a fixture
breaks the suite, so treat these as part of the test, not as courses to keep current.

Nothing needs rebuilding by hand: `npm test` rebuilds both packages every run. To inspect one, or to
check a spec after editing:

```bash
node packer/stlp.js check  app/test/fixtures/fpga-starter/pack-spec.json
node packer/stlp.js check  app/test/fixtures/demo-partner/pack-spec.json
```

## Testing a different package

`STPACK=/path/to/pack.stlp npm test` points the suite at your own package. Most checks will fail — they
assert the fixture's content — so this is useful for the install, signature and compatibility steps
only, and the package must be signed by a key the app already trusts (`app/trusted-keys/`), because
`STPACK` leaves the real trust store in place.
