# Version and compatibility policy

The application version is in `app/package.json`; supported content versions are in
`app/src/shared/versions.js`. Package authors declare their own package version. The skills product has
its own release version and bundles a tested copy of the app's packer.

Current release candidate: **Academy 2.1.2**, **Academy Templates 2.0.1**. Academy 2.1.2 retains the
compatible author-preview routing fix from 2.1.1 and repairs release-test isolation; package format
compatibility remains 2.1.0.

Training formats are **1 (JSON)** and **2 (custom HTML/CSS/JavaScript)**. The unpublished third training
format was merged into format 2 before release. Both can declare an optional certificate. Container formats
remain separate: **package 1** base, **package 2** branding, **package 3** password metadata.

The current builder sets `minAppVersion: "2.1.0"`, including builds with older item format numbers, because
it relies on the current certificate, progress, preview and validation contract. A lower `--target-app`
is rejected. Older app versions reject that minimum-version requirement instead of silently ignoring
features. Do not infer compatibility from a format number alone.

The app still reads legacy JSON certificates and older supported material formats. Existing installed
learning records remain accessible. New imports, including re-imports of old archives, must pass the
current checker: mandatory order/plan, content references and training previews/progress metadata. Ask
the publisher to update and repackage an old archive that fails; do not bypass the checker.

Use patch versions for fixes, minor versions for compatible features, and major versions for deliberate
breaking changes. Feature additions to an existing format need an appropriate minimum app version;
changes to its fundamental representation need a new format. Keep stable item/topic/step IDs to preserve
learner progress. Never repurpose a released format's meaning.

Before a release: run app unit/integration tests, training/lab/project tools and skills packaging/parity
tests; test the extracted skill ZIP and a locally built app. Check all download folders, optional certificate
choices, passwords, custom progress, offline HTML, and PDF text/links. Publishing source, a skills ZIP,
an app installer and educational packages are separate explicit decisions; never publish a private course
merely because app or skills releases are authorized.
