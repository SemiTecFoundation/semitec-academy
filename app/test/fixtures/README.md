# Test fixtures

Input for the end-to-end suite (`app/test/e2e.js`) — **test data, not published course content.**
The app ships no courses; real ones are built from sources kept outside this repository.

| | |
|---|---|
| `fpga-starter/`, `demo-partner/` | pack sources: one package of each item type, and a second publisher so the catalog checks have two |
| `packs/*.stlp` | the same two packages, built and signed, as the suite installs them |

The 75 checks assert this content exactly — item titles and ids, a 7-week study plan, a 30-week
project, 6 lab source files, a 4-question lab quiz. **Changing a fixture breaks the suite**, so treat
these as part of the test, not as courses to edit.

Rebuilding after an edit (the `fpga-starter` spec takes two items from a `semitec-academy-skills`
checkout beside this repository):

```bash
node packer/stlp.js create app/test/fixtures/fpga-starter/pack-spec.json \
  --key <production key> --out app/test/fixtures/packs
```

The packages must stay **signed with a key the app trusts** (`app/trusted-keys/`) — the suite installs
them with Developer mode off, exactly as a student would. Point the suite at another package with
`STPACK=/path/to/pack.stlp npm test`.
