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

`POST /api/v1/models/assessments` 返回包含引擎、版本、后端及规范设备分组的类型化评估，分别展示需求假设、内存适配和实际验证状态。缺失信息保持未知；评估不会加载或运行模型。

`GET /api/v1/models/inventory` 展示经过授权的来源、传输完成状态、独立的校验和与清单验证状态，以及当前文件可用性。字节传输完成不代表安装已验证；文件不可用时保留元数据并阻止使用。

安装配置命令可在创建任何项目前持久保存。空会话会原子保存快照和重试回执，游标为零且不产生调度事件。`DownloadProgress.repository_id` 将授权的恢复和取消操作绑定到原始仓库。

基础设施必须配置下载上限：`IRONLOOM_DOWNLOAD_MAX_FILE_BYTES` 和 `IRONLOOM_DOWNLOAD_MAX_TRANSFER_BYTES`。两者均为正整数十进制字节数；发布者提供的可选大小不能覆盖这些限制。Helm 提供可编辑的明确值。

可编辑的角色指令模板使用 `GET/POST /api/v1/instructions`；修改时必须明确保留活动副本，或选择有权限的任务更新副本并等待确认。预算命令包含 `{conversation_id, budget}`，明确指定持久事件流。

`ServiceEvent` 必须且只能包含工作器事件或会话快照更新之一。快照的游标和项目必须与外层事件一致，非工作器状态更新无需虚构执行身份。

默认团队初始禁用，指令可编辑，且不会隐式选择模型。纯就绪规则保留项目配置继承，远程配置无需 GPU。持久化指令和配置处理器仍在实现中。

工作器委托绑定实际任务及资源，CAS 更新保持项目和任务归属不变。服务就绪检查 PostgreSQL 和实际 OpenFGA 绑定，与团队和模型配置分离。内存估算必须包含全部五项需求并检查求和溢出；缺失或溢出仍为未知。


历史分页必须明确指定前向或后向，可按轮次筛选；每页按时间正序返回，并绑定请求的事件水位。原生会话列表使用 `order=created_at`，仪表盘使用 `order=human_interaction`。本地设备绑定为空、被禁用或与角色限制无交集时，执行就绪状态为否。配置、指令和会话列表、快照及历史 HTTP 路由使用共享认证后端；完整运行时组合仍在开发中。


无事件的资源变更没有 `CommandReceipt.cursor`。管理共享经验不要求访问其私有来源会话，也不会暴露来源游标。会话命令保留实际流游标。配置拒绝重复角色 ID；不增加入口角色设置要求。

Linux 文件权限区分精确文件 `write_files` 与目录子树 `write_directories`。精确文件的创建、编辑、删除和移动通过原生文件工具完成；命令仅获得明确授权的目录挂载。可写目录拒绝硬链接，seccomp 禁止创建新硬链接。持久化路径所有权会保留至确认终止或完成协调，即使租约已经过期。完整运行时网关集成仍在进行。

`ConversationSnapshot.pause_requested`：`null` 表示没有活动任务；`false` 表示没有待处理的暂停请求；`true` 表示等待在安全边界确认暂停。

配置新增 `endpoints`（提供商、API 基址、明确的协议和计费方式、流式输出、工具和用量支持及推理强度标签）与 `source_accounts`（主机及明确的匿名访问或凭据引用选择）。两者沿用 `/api/v1/configuration`，按作用域继承；仅替换显式提交的列表，空列表表示清空。端点 URL 拒绝内嵌凭据、查询参数、片段及远程明文 HTTP。端点缺失、计费不匹配或所选强度不受支持时，远程配置不具备执行条件；不会进行推理探测。下载私下保留所选源账户绑定；运行时回调集成仍在进行。

更改凭据的有效目标需要 `ReplaceCredential` 权限，包括受安装级配置更改影响的项目继承配置。正常执行检查 `UseCredential`；仅有使用权限不能将共享密钥转发到其他提供商 URL 或源主机。
