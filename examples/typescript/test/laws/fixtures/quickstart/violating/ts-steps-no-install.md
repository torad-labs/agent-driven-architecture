A VIOLATING TypeScript step list: it tells the reader what to copy and what to run, and never
tells them what to install. Every path and command below resolves; the dependency closure of
the copied tier is simply unstated, which is the shape the first draft of this section had.

This step list is for YOUR new repository.

Paths it names:
* `src/spine/`
* `src/spine/package.json`
* `src/spine/tsconfig.json`
* `src/spine/pure/version.ts`
* `src/spine/agent/loop.ts`
* `tsconfig.base.json`
* `src/blocks/console/`
* `src/app/wire.ts`
* `src/app/main.ts`

Commands it runs:
* `npm install`
* `npm test`
* `npm run typecheck`
* `npm run demo`

Walked facts it keeps:
* ../../tsconfig.base.json
* re-derived from the bus
