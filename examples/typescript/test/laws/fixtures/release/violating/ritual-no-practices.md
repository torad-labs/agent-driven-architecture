# The release ritual

The oracles survive verbatim — that is the whole point of this fixture:

```
cd examples/typescript && npm test
```

```
cd examples/kotlin && ./gradlew --console=plain test --rerun-tasks
```

Everything else was rewritten into one sentence: review the change, agree it is fine,
and land it.
