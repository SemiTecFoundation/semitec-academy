# Academy package lifecycle

SemiTec Academy is the learner-facing end of the product. It receives a finished `.stlp` course from a
materials release, validates it, copies verified content into its local data folder and stores each
student's progress locally.

![Package lifecycle](diagrams/package-lifecycle.png)

## What happens before the app

1. Authors use Academy Templates skills to create standalone labs, trainings, project briefs, readings and
   other materials. Those results are useful without the app.
2. When a course should be delivered through Academy, the optional package skill selects and copies several
   materials into one `.stlp` archive.
3. The materials repository releases the archive directly or through a catalog. The app repository never
   publishes course content.

## What the app guarantees

Before installation the app verifies the package ID, content paths and hashes, trusted signature and format
compatibility. It stages verified files inside the package store before replacing an installed version. A
package cannot use an ID to escape that store, even in Developer mode.

The app format is the compatibility authority. The package skill may bundle an offline copy of the packer,
but its release tests compare that copy with the current app packer and inspect a generated fictional
package with the app.
