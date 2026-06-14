# 模式 API

已提交的 JSON 模式位于各 crate 本地的 `schemas/` 目录下。

## 模式漂移

使用以下命令验证模式：

```sh
cargo run -p ironloom-schemas -- --check
```

在公共契约变更后重新生成模式文件：

```sh
cargo run -p ironloom-schemas
```

## 运行时配置模式

- `crates/ironloom-config/schemas/runtime-config.schema.json`
- `crates/ironloom-config/schemas/stored-setup-config.schema.json`

这些文件描述解析后的运行时配置和加密设置载荷形状。
