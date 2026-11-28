import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';

import '../widgets.dart';

class EndpointEditor extends StatefulWidget {
  const EndpointEditor({
    super.key,
    this.endpoint,
    required this.onSave,
    this.onRemove,
  });
  final ProviderEndpoint? endpoint;
  final Future<void> Function(ProviderEndpoint) onSave;
  final Future<void> Function()? onRemove;
  @override
  State<EndpointEditor> createState() => _EndpointEditorState();
}

class _EndpointEditorState extends State<EndpointEditor> {
  late final TextEditingController provider, base, efforts;
  ProviderDialect? dialect;
  BillingMode? billing;
  bool streaming = false, tools = false, usage = false;
  @override
  void initState() {
    super.initState();
    final endpoint = widget.endpoint;
    provider = TextEditingController(text: endpoint?.provider.value);
    base = TextEditingController(text: endpoint?.base);
    efforts = TextEditingController(
      text: endpoint?.reasoningEfforts.map((v) => v.value).join(', '),
    );
    dialect = endpoint?.dialect;
    billing = endpoint?.billing;
    streaming = endpoint?.streaming ?? false;
    tools = endpoint?.tools ?? false;
    usage = endpoint?.streamUsage ?? false;
  }

  @override
  void dispose() {
    provider.dispose();
    base.dispose();
    efforts.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExpansionTile(
    title: Text(widget.endpoint?.provider.value ?? 'Add provider endpoint'),
    children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: provider,
              readOnly: widget.endpoint != null,
              decoration: const InputDecoration(labelText: 'Provider ID'),
            ),
            TextField(
              controller: base,
              decoration: const InputDecoration(
                labelText: 'Provider API base',
                helperText: 'Use the intended destination without a key, query or fragment.',
              ),
            ),
            DropdownButtonFormField<ProviderDialect>(
              initialValue: dialect,
              decoration: const InputDecoration(labelText: 'Provider protocol'),
              items: [
                for (final value in ProviderDialect.values)
                  DropdownMenuItem(value: value, child: Text(value.value)),
              ],
              onChanged: (value) => setState(() => dialect = value),
            ),
            DropdownButtonFormField<BillingMode>(
              initialValue: billing,
              decoration: const InputDecoration(labelText: 'Endpoint billing'),
              items: [
                for (final value in [BillingMode.apiKey, BillingMode.account])
                  DropdownMenuItem(value: value, child: Text(value.value)),
              ],
              onChanged: (value) => setState(() => billing = value),
            ),
            const Text(
              'Account inference requires a separately eligible account credential. Native control enrollment does not authorize inference billing.',
            ),
            SwitchListTile(
              title: const Text('Streaming supported'),
              value: streaming,
              onChanged: (value) => setState(() => streaming = value),
            ),
            SwitchListTile(
              title: const Text('Tool calls supported'),
              value: tools,
              onChanged: (value) => setState(() => tools = value),
            ),
            SwitchListTile(
              title: const Text('Usage reported in stream'),
              value: usage,
              onChanged: (value) => setState(() => usage = value),
            ),
            TextField(
              controller: efforts,
              decoration: const InputDecoration(
                labelText: 'Supported effort labels',
                helperText: 'Comma-separated declared labels; blank means no effort support.',
              ),
            ),
            if (widget.onRemove != null)
              AsyncAction(
                label: 'Remove provider endpoint',
                icon: Icons.remove_circle_outline,
                action: widget.onRemove,
              ),
            AsyncAction(
              label: 'Save provider endpoint',
              action: () async {
                if (dialect == null || billing == null) {
                  throw ValidationErrors([
                    const FieldError(
                      'endpoint',
                      'explicit_protocol_and_billing_required',
                    ),
                  ]);
                }
                await widget.onSave(
                  ProviderEndpoint(
                    provider: ActorId(provider.text.trim()),
                    base: base.text.trim(),
                    dialect: dialect!,
                    billing: billing!,
                    streaming: streaming,
                    tools: tools,
                    streamUsage: usage,
                    reasoningEfforts: [
                      for (final value
                          in efforts.text
                              .split(',')
                              .map((value) => value.trim())
                              .where((value) => value.isNotEmpty))
                        ActorId(value),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    ],
  );
}

class SourceAccountEditor extends StatefulWidget {
  const SourceAccountEditor({
    super.key,
    this.binding,
    required this.onSave,
    this.onRemove,
  });
  final SourceAccountBinding? binding;
  final Future<void> Function(SourceAccountBinding) onSave;
  final Future<void> Function()? onRemove;
  @override
  State<SourceAccountEditor> createState() => _SourceAccountEditorState();
}

class _SourceAccountEditorState extends State<SourceAccountEditor> {
  String? host, access;
  late final TextEditingController credential;
  @override
  void initState() {
    super.initState();
    host = widget.binding?.host.value;
    access = widget.binding?.access.type;
    credential = TextEditingController(
      text: widget.binding?.access.credentialId?.value,
    );
  }

  @override
  void dispose() {
    credential.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExpansionTile(
    title: Text(widget.binding?.host.value ?? 'Add source account binding'),
    children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              initialValue: host,
              decoration: const InputDecoration(labelText: 'Source host'),
              items: [
                for (final value in {
                  'huggingface',
                  'modelscope',
                  'kaggle',
                  if (widget.binding != null) widget.binding!.host.value,
                })
                  DropdownMenuItem(value: value, child: Text(value)),
              ],
              onChanged: widget.binding != null
                  ? null
                  : (value) => setState(() => host = value),
            ),
            DropdownButtonFormField<String>(
              initialValue: access,
              decoration: const InputDecoration(
                labelText: 'Source account access',
              ),
              items: const [
                DropdownMenuItem(
                  value: 'anonymous',
                  child: Text('Anonymous access'),
                ),
                DropdownMenuItem(
                  value: 'credential',
                  child: Text('Use selected credential'),
                ),
              ],
              onChanged: (value) => setState(() => access = value),
            ),
            if (access == 'credential')
              TextField(
                controller: credential,
                decoration: const InputDecoration(
                  labelText: 'Source credential reference',
                  helperText: 'Select an authorized source credential; never paste a token here.',
                ),
              ),
            const Text(
              'Access terms remain a manual source-site action. Downloads retain the chosen source account and recheck current grants.',
            ),
            if (widget.onRemove != null)
              AsyncAction(
                label: 'Remove source account binding',
                icon: Icons.remove_circle_outline,
                action: widget.onRemove,
              ),
            AsyncAction(
              label: 'Save source account binding',
              action: () async {
                if (host == null || access == null) {
                  throw ValidationErrors([
                    const FieldError(
                      'source_accounts',
                      'explicit_host_and_access_required',
                    ),
                  ]);
                }
                await widget.onSave(
                  SourceAccountBinding(
                    host: ActorId(host!),
                    access: access == 'anonymous'
                        ? SourceAccountAccess.anonymous()
                        : SourceAccountAccess.credential(
                            CredentialId(credential.text.trim()),
                          ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    ],
  );
}
