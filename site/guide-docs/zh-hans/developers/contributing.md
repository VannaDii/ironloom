# 贡献

发布变更前请运行 Rust 和文档验证关卡。

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo deny check
cargo audit
npm run docs:build
```

公共契约位于其所属 crate 附近，并由 `crates/*/schemas` 下已提交的模式文件表示。

在公共契约变更后，从 Rust 契约类型生成模式文件：

```sh
cargo run -p ironloom-schemas
```

验证已提交的模式文件没有漂移：

```sh
cargo run -p ironloom-schemas -- --check
```

## 文档开发

使用以下命令运行 VitePress 开发服务器：

```sh
npm run docs:dev
```

使用以下命令构建静态站点：

```sh
npm run docs:build
```

当功能变更影响已记录的表面时，请在同一个变更中更新英文源文档和所有本地化文档。
