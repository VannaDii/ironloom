import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:uuid/uuid.dart';

import '../widgets.dart';

class AccessPage extends StatefulWidget {
  const AccessPage({super.key, required this.client});
  final IronloomClient client;
  @override
  State<AccessPage> createState() => _AccessPageState();
}

class _AccessPageState extends State<AccessPage> {
  List<CredentialSummary> credentials = [];
  String? error, notice;
  final label = TextEditingController(),
      secret = TextEditingController(),
      node = TextEditingController(),
      registration = TextEditingController(),
      grantee = TextEditingController();
  NativeConnectionState? connection;
  final grants = <Permission>{};
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final field in [label, secret, node, registration, grantee]) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    try {
      final result = await widget.client.credentials();
      if (mounted) {
        setState(() {
          credentials = result;
          error = null;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => error = displayError(e));
    }
  }

  Future<void> mutate(
    CredentialSummary record,
    CredentialOperation operation, {
    SecretInput? value,
    OperatorId? recipient,
    List<Permission> permissions = const [],
    bool revoke = false,
  }) async {
    await widget.client.credential(
      CredentialCommand(
        commandId: CommandId(const Uuid().v4()),
        credentialId: record.credentialId,
        expectedRevision: record.revision,
        operation: operation,
        secret: value,
        grantee: recipient,
        permissions: permissions,
        revoke: revoke,
      ),
    );
    await load();
  }

  Future<void> inspectNode() async {
    final value = await widget.client.nativeConnection(
      NodeId(node.text.trim()),
    );
    if (mounted) setState(() => connection = value);
  }

  Future<void> native(
    NativeConnectionOperation operation, {
    bool? enabled,
  }) async {
    final current = connection;
    if (current == null || current.nodeId.value != node.text.trim()) {
      throw StateError('Load the enrolled node first');
    }
    final value = await widget.client.configureNative(
      NativeConnectionCommand(
        commandId: CommandId(const Uuid().v4()),
        nodeId: current.nodeId,
        expectedGeneration: current.generation,
        operation: operation,
        protectedRegistration: operation == NativeConnectionOperation.import
            ? SecretInput(registration.text)
            : null,
        enabled: enabled,
      ),
    );
    registration.clear();
    if (mounted) setState(() => connection = value);
  }

  @override
  Widget build(BuildContext context) => PageBody(
    title: 'Access & connections',
    actions: [
      IconButton(
        onPressed: load,
        tooltip: 'Refresh credentials',
        icon: const Icon(Icons.refresh),
      ),
    ],
    children: [
      if (error != null) Notice(error!, error: true),
      if (notice != null) Notice(notice!),
      Section(
        'Create a private credential',
        children: [
          const Text(
            'Service login, source downloads, native control and inference credentials are separate. A model profile must explicitly select its credential reference and billing mode.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: label,
            decoration: const InputDecoration(labelText: 'Nonsecret label'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: secret,
            obscureText: true,
            enableSuggestions: false,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'Credential material'),
          ),
          const SizedBox(height: 12),
          AsyncAction(
            label: 'Save private credential',
            action: () async {
              final created = await widget.client.credential(
                CredentialCommand(
                  commandId: CommandId(const Uuid().v4()),
                  expectedRevision: Counter('0'),
                  operation: CredentialOperation.create,
                  label: ActorId(label.text.trim()),
                  secret: SecretInput(secret.text),
                  permissions: [],
                  revoke: false,
                ),
              );
              secret.clear();
              if (mounted) {
                setState(
                  () => notice = created == null
                      ? 'Credential saved.'
                      : 'Credential reference: ${created.credentialId.value}',
                );
              }
              await load();
            },
          ),
        ],
      ),
      for (final credential in credentials)
        Section(
          credential.label.value,
          children: [
            SelectableText(
              'Reference: ${credential.credentialId.value}\nOwner: ${credential.owner.value}\nCurrent permissions: ${credential.permissions.map((p) => p.value.replaceAll('_', ' ')).join(', ')}',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                AsyncAction(
                  label: 'Replace credential',
                  action:
                      !credential.permissions.contains(
                        Permission.replaceCredential,
                      )
                      ? null
                      : () async {
                          final controller = TextEditingController();
                          final value = await showDialog<String>(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: const Text('Replace credential material'),
                              content: TextField(
                                controller: controller,
                                obscureText: true,
                                enableSuggestions: false,
                                autocorrect: false,
                                decoration: const InputDecoration(
                                  labelText: 'New material',
                                ),
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(context),
                                  child: const Text('Keep existing'),
                                ),
                                FilledButton(
                                  onPressed: () =>
                                      Navigator.pop(context, controller.text),
                                  child: const Text('Replace'),
                                ),
                              ],
                            ),
                          );
                          controller.clear();
                          controller.dispose();
                          if (value != null) {
                            await mutate(
                              credential,
                              CredentialOperation.replace,
                              value: SecretInput(value),
                            );
                          }
                        },
                ),
                AsyncAction(
                  label: 'Delete credential',
                  icon: Icons.delete_outline,
                  action:
                      !credential.permissions.contains(
                        Permission.deleteCredential,
                      )
                      ? null
                      : () async {
                          final approved = await showDialog<bool>(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: const Text('Delete this credential?'),
                              content: const Text(
                                'Profiles that require it will need a new explicit credential choice.',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () =>
                                      Navigator.pop(context, false),
                                  child: const Text('Keep credential'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.pop(context, true),
                                  child: const Text('Delete'),
                                ),
                              ],
                            ),
                          );
                          if (approved == true) {
                            await mutate(
                              credential,
                              CredentialOperation.delete,
                            );
                          }
                        },
                ),
              ],
            ),
            if (credential.permissions.contains(Permission.share))
              ExpansionTile(
                title: const Text('Grant or revoke separate permissions'),
                children: [
                  TextField(
                    controller: grantee,
                    decoration: const InputDecoration(
                      labelText: 'Recipient operator ID',
                    ),
                  ),
                  for (final permission in [
                    Permission.view,
                    Permission.useCredential,
                    Permission.replaceCredential,
                    Permission.share,
                    Permission.deleteCredential,
                  ])
                    CheckboxListTile(
                      title: Text(permission.value.replaceAll('_', ' ')),
                      value: grants.contains(permission),
                      onChanged: (v) => setState(() {
                        if (v == true) {
                          grants.add(permission);
                        } else {
                          grants.remove(permission);
                        }
                      }),
                    ),
                  Wrap(
                    spacing: 12,
                    children: [
                      AsyncAction(
                        label: 'Grant selected permissions',
                        action: grants.isEmpty
                            ? null
                            : () => mutate(
                                credential,
                                CredentialOperation.share,
                                recipient: OperatorId(grantee.text.trim()),
                                permissions: grants.toList(),
                              ),
                      ),
                      AsyncAction(
                        label: 'Revoke selected permissions',
                        action: grants.isEmpty
                            ? null
                            : () => mutate(
                                credential,
                                CredentialOperation.share,
                                recipient: OperatorId(grantee.text.trim()),
                                permissions: grants.toList(),
                                revoke: true,
                              ),
                      ),
                    ],
                  ),
                ],
              ),
          ],
        ),
      Section(
        'Native remote-host control',
        children: [
          const Text(
            'Use an enrolled service node. Import its protected registration; the server owns subsequent refreshes. Native control does not automatically authorize account-backed inference.',
          ),
          const SizedBox(height: 16),
          const Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              Chip(avatar: Text('1'), label: Text('Sign in locally')),
              Chip(
                avatar: Text('2'),
                label: Text('Transfer protected registration'),
              ),
              Chip(
                avatar: Text('3'),
                label: Text('Server refreshes credentials'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: node,
            decoration: const InputDecoration(labelText: 'Enrolled node ID'),
            onChanged: (_) => setState(() => connection = null),
          ),
          const SizedBox(height: 12),
          AsyncAction(label: 'Load node connection', action: inspectNode),
          if (connection != null) ...[
            Notice(
              'Connection: ${connection!.status.value}\nAuthentication generation: ${connection!.generation}${connection!.enrollment == null ? '' : '\nServer: ${connection!.enrollment!.serverId.value}\nEnvironment: ${connection!.enrollment!.environmentId.value}'}',
            ),
            TextField(
              controller: registration,
              obscureText: true,
              enableSuggestions: false,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Protected control registration',
              ),
            ),
            const SizedBox(height: 12),
            AsyncAction(
              label: 'Import protected registration',
              action: () => native(NativeConnectionOperation.import),
            ),
            if (connection!.enrollment != null)
              SwitchListTile(
                title: const Text('Enable native control'),
                value: connection!.enrollment!.enabled,
                onChanged: (enabled) => native(
                  NativeConnectionOperation.setEnabled,
                  enabled: enabled,
                ),
              ),
            AsyncAction(
              label: 'Disconnect and delete control registration',
              action: () => native(NativeConnectionOperation.delete),
            ),
          ],
        ],
      ),
    ],
  );
}
