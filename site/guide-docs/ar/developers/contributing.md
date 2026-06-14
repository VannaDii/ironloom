# المساهمة

شغل بوابات تحقق Rust والوثائق قبل نشر التغييرات.

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo deny check
cargo audit
npm run docs:build
```

تعيش العقود العامة قرب الحزم المالكة لها، وتمثلها ملفات مخطط ملتزم بها تحت `crates/*/schemas`.

ولد ملفات المخطط من أنواع عقود Rust بعد تغييرات العقود العامة:

```sh
cargo run -p ironloom-schemas
```

تحقق من عدم وجود انجراف في ملفات المخطط الملتزم بها:

```sh
cargo run -p ironloom-schemas -- --check
```

## تطوير الوثائق

شغل خادم تطوير VitePress باستخدام:

```sh
npm run docs:dev
```

ابن الموقع الثابت باستخدام:

```sh
npm run docs:build
```

عندما يؤثر تغيير وظيفي في سطح موثق، حدث وثائق المصدر الإنجليزية وكل الوثائق المحلية ضمن التغيير نفسه.
