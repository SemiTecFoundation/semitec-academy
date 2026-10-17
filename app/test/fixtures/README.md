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
cd app && npm test                   # package regressions, then the desktop checks
```

## Changing a fixture

The desktop checks assert this content **exactly** — item titles and ids, a 7-week study plan, a 30-week
project, 6 lab source files, a 4-question lab quiz, specific page and outline counts. Editing a fixture
breaks the suite, so treat these as part of the test, not as courses to keep current.

Nothing needs rebuilding by hand: `npm test` rebuilds both packages every run. To inspect one, or to
check a spec after editing:

```bash
node packer/stlp.js check  app/test/fixtures/fpga-starter/pack-spec.json
node packer/stlp.js check  app/test/fixtures/demo-partner/pack-spec.json
```

The suite always uses these fixtures; it does not accept `STPACK` overrides. To check a real course,
run `packer/stlp.js check` against its spec in the materials repository, then test it manually.
Built `.stlp` files must stay outside this repository. The desktop suite removes its generated
packages, throwaway key, profile and data directory after each run; screenshots remain in the ignored
`app/test/screenshots/` folder for inspection.

## Content contract review fixture

`contract.js` builds one unsigned fictional package for `test/content-e2e.js`: JSON training, custom web
training with manual steps and an individual HTML certificate, automatic JavaScript bridge training,
a complete lab, a complete project with source/SRS/attachments, a linked two-page PDF, and an MP4 video.
Course order and a two-week study plan cover every counted item. A package HTML certificate is offered;
the JSON and automatic bridge trainings deliberately offer no individual certificate.

The preview-only password is `test-preview-password` (test data). Normal study/downloads remain open.
Every suite run generates a fresh archive. Use the exported `build()` function to prepare a private manual
review copy outside this repository; do not publish test packages in the materials catalog or releases.

`test/content-e2e.js` checks action-button geometry at 1320, 1000, 760 and 600px, both package views and
nested attachments; account-password errors and successful changes; manual/bridge progress; certificate
identity and the text of its exported PDF; native PDF clipboard copy and links; project briefs; wrong and
correct preview passwords; complete-folder exports, collision refusal and opening downloaded HTML.
The test snapshots and restores clipboard contents. It uses a disposable app profile/data directory.

`test/packages.test.js` covers publisher-password changes across versions and twenty-four malformed metadata
cases in both unsigned/developer and trusted-signature modes. A rejected update must preserve installed
content and learning progress and leave no staging directory. See the local review guide for remaining
human checks such as appearance, teaching quality and operating-system printer dialogs.

The no-password export regression checks both training formats and whole-course downloads: open normal
learning does not authorize author previews. Preview HTML stays in the installed author source but is
absent from exports and direct requests until a configured password has been successfully entered.
