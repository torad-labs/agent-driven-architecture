A minimal but COMPLIANT TypeScript step list. It is deliberately terse: the checker judges
whether the claims are present and resolvable, never whether the prose is good, so a
fixture that read like the shipped list would be testing the wrong thing.

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

Mandatory install: `npm i ai @valibot/to-json-schema valibot`

Walked facts it keeps:
* ../../tsconfig.base.json
* re-derived from the bus
