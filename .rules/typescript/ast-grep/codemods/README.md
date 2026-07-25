# TypeScript Codemods

Codemods in this directory are explicit transforms. They never run during the
default LAW scan, and they only apply when invoked with `torad codemod run`.

`deprecated-ctor-to-factory/` is a reference template for project-specific API
migrations. Copy it and replace the `Foo` constructor/factory names with the
real API being retired before using it as a production migration.
