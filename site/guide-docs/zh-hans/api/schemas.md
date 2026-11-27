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

新的工厂契约位于各 crate 的 `src/factory.rs` 模块。`Validated<T>` 在构造和解码时执行相同的嵌套字段及跨字段检查；结构化错误不会泄露机密。计数器和修订号使用规范十进制字符串，避免浏览器精度丢失。Rust 和 Dart 共用 `fixtures/contracts/decode.json`。新的 `FactoryArtifact` 记录无需 Discord 线程，不提供旧格式支持。这些契约和适配器接口尚未实现工厂、登录、原生中继或推理功能。[共享契约规范](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) 说明文件归属、API 路径、新建模式初始化边界和验证范围。

修订版新增绑定快照的历史记录及有界重放到实时订阅接口、多选与自由文本回答、包含角色及工具模式和结果的推理消息，以及独立的原生服务器和环境标识与中继持久化键。这些是经过验证的接口，相关后端与适配器实现尚未完成。

同一修订版还定义了经过授权的设置、团队、模型和设备查询与修改接口，经验记录的查看、编辑、范围调整、删除和提升操作，分页模型源搜索，以及显式的引擎草稿模型、缓存、资源和恢复数据。未知能力或内存数据保持未知；失败和取消请求并不确认终止或释放预留资源。后端与适配器实现尚未完成。

Ironloom 尚未发布：仅初始化全新模式，不支持旧版本兼容、数据转换或回填、升级文件或迁移历史。过时的基础实现会在首次构建期间移除。

`FactoryService::create_conversation` 在启动原生轮次前持久化经过授权的空会话，包含持久命令标识和零游标快照。它不提交输入或启动推理；用户输入仍须为非空文本。

共享服务与原生注册契约现位于 `ironloom-service::factory`；运行时和原生适配器依赖此公共 crate，不保留旧导入别名。快照包含用于重连控制的活动任务标识。项目、凭据、原生连接及来源和下载 API 使用显式记录；模型配置通过配置接口保存生成限制。
