# Torad TypeScript Rules

Canonical TypeScript rules enforcing Torad engineering tenets. **31 ast-grep rules** + ESLint config.

## Quick Install

```bash
# Via torad CLI (recommended)
torad add typescript-rules

# Manual: copy to project
cp -r .rules/typescript/* your-project/.rules/typescript/
```

## Components

### 1. ast-grep Rules (`.rules/typescript/ast-grep/`)

Structural pattern rules. Run with:

```bash
# Scan project
ast-grep scan --config .rules/typescript/ast-grep/sgconfig.yml

# In CI (JSON output for parsing)
ast-grep scan --config .rules/typescript/ast-grep/sgconfig.yml --json
```

**31 Rules:**

| Rule | Category |
|------|----------|
| **Discriminated Unions & Exhaustiveness** | |
| `discriminated-union-kind` | Unions use 'kind' discriminator |
| `exhaustive-switch` | Switch has never check in default |
| `state-must-be-discriminated` | State types use discriminated unions |
| **Type Safety** | |
| `no-any` | No any type |
| `no-non-null-assertion` | No ! non-null assertion |
| `no-object-as-type` | No object/Object type |
| `no-implicit-any-return` | Exported functions have return types |
| `explicit-public-return-types` | Public APIs have explicit types |
| `prefer-readonly` | Prefer readonly properties |
| `prefer-readonly-array` | Use readonly T[] for params |
| `no-enum` | Use as const over enum |
| `prefer-type-over-interface` | Type aliases for data shapes |
| `no-empty-interface` | No empty interfaces |
| **Component & Hook Patterns** | |
| `no-logic-in-component` | Components render, don't compute |
| `no-logic-in-hook` | Hooks compose, don't compute |
| `no-loose-function` | Functions belong to modules |
| **Async & Promises** | |
| `no-floating-promises` | Promises must be handled |
| `async-stream-pattern` | Prefer async iterables |
| `no-async-void` | Async returns Promise, not void |
| `no-callback-hell` | Avoid nested callbacks |
| `prefer-nullish-coalescing` | Use ?? over \|\| for defaults |
| **Module & State** | |
| `no-mutable-export` | Exports are const |
| `no-module-state` | No module-level let |
| `no-default-export` | Named exports over default |
| `prefer-const-assertion` | Use as const for literals |
| **Code Quality** | |
| `no-magic-strings` | Extract string constants |
| `no-nested-ternary` | No nested ternaries |
| `no-throw-string` | Throw Error objects |
| `no-console-in-production` | Use logging library |
| `observable-naming` | Observables end with $ |
| **Testing** | |
| `tests-no-settimeout` | Use fake timers |

### 2. ESLint Configuration (`eslint.config.js`)

Type-checked ESLint rules. Copy to project root:

```bash
cp .rules/typescript/eslint.config.js eslint.config.js
```

Install dependencies:

```bash
npm install -D eslint @eslint/js typescript-eslint
```

Add to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

**ESLint rules include:**
- Strict type checking (no-unsafe-*, no-explicit-any)
- Exhaustive switch checks
- Floating promise detection
- Naming conventions (PascalCase classes, camelCase variables)
- Complexity limits (max-depth: 4, max-lines-per-function: 50)

## CI Integration

### GitHub Actions

```yaml
- name: Run ast-grep rules
  run: |
    npm install -g @ast-grep/cli
    ast-grep scan --config .rules/typescript/ast-grep/sgconfig.yml

- name: Run ESLint
  run: npm run lint
```

### Pre-commit Hook

```bash
# .husky/pre-commit
npx ast-grep scan --config .rules/typescript/ast-grep/sgconfig.yml
npm run lint
```

## Tenets Reference

These rules encode Torad engineering tenets for TypeScript:

1. **Discriminated unions** — use 'kind' field, exhaustive switch
2. **Type safety** — no any, no non-null assertion
3. **Immutability** — prefer readonly, const exports
4. **Structured exports** — functions via objects, not loose exports
5. **Async patterns** — AsyncIterable for streaming, await for sequential
6. **Explicit contracts** — explicit return types on public APIs

## TypeScript Equivalents of Kotlin Tenets

| Kotlin | TypeScript |
|--------|------------|
| Sealed class | Discriminated union with 'kind' |
| Flow<T> | AsyncIterable<T> or Observable<T> |
| suspend fun | async function (prefer streams) |
| data class | type with readonly fields |
| Exhaustive when | switch + never check |
| UseCase class | Factory function or class |
| no-extension-functions | Export via object, not loose |

## Customization

### Disable an ast-grep rule

Remove the rule file from `rules/`.

### Adjust ESLint rules

Edit `eslint.config.js`:

```javascript
rules: {
  '@typescript-eslint/no-explicit-any': 'off', // Disabled
  'max-lines-per-function': ['warn', { max: 100 }], // Increase limit
}
```

### Ignore specific files

Add to `eslint.config.js`:

```javascript
{
  ignores: ['**/generated/**', '**/dist/**'],
}
```
