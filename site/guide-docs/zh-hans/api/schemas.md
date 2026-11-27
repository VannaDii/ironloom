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

## 工厂契约候选版本

新的工厂契约位于各 crate 的 `src/factory.rs` 模块。`Validated<T>` 在构造和解码时执行相同的嵌套字段及跨字段检查；结构化错误不会泄露机密。计数器和修订号使用规范十进制字符串，避免浏览器精度丢失。Rust 和 Dart 共用 `fixtures/contracts/decode.json`。新的 `FactoryArtifact` 记录无需 Discord 线程，历史第一版记录仍可读取。这些契约和适配器接口尚未实现工厂、登录、原生中继或推理功能。[共享契约规范](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) 说明文件归属、API 路径、迁移边界和验证范围。
