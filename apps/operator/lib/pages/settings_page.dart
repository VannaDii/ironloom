import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:uuid/uuid.dart';

import '../widgets.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.client,
    required this.settings,
    required this.onChanged,
    required this.reload,
  });
  final IronloomClient client;
  final ConfigurationSnapshot? settings;
  final ValueChanged<ConfigurationSnapshot> onChanged;
  final Future<void> Function() reload;
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  LessonHandling? handling;
  bool confirmed = false, publish = false, merge = false, deploy = false;
  String? saved;
  final token = TextEditingController();
  @override
  void initState() {
    super.initState();
    _read();
  }

  @override
  void didUpdateWidget(covariant SettingsPage old) {
    super.didUpdateWidget(old);
    if (old.settings != widget.settings) _read();
  }

  void _read() {
    final setup = widget.settings?.setup;
    handling = setup?.lessonHandling;
    confirmed = setup?.deliveryConfirmed ?? false;
    publish = setup?.publishBranch ?? false;
    merge = setup?.merge ?? false;
    deploy = setup?.deploy ?? false;
  }

  @override
  void dispose() {
    token.dispose();
    super.dispose();
  }

  Future<void> save(ConfigurationChange change) async {
    final current = widget.settings;
    if (current == null) throw StateError('Configuration unavailable');
    final value = await widget.client.configure(
      ConfigurationCommand(
        commandId: CommandId(const Uuid().v4()),
        expectedRevision: current.revision,
        changes: change,
      ),
    );
    widget.onChanged(value);
    if (mounted) setState(() => saved = 'Settings saved.');
  }

  @override
  Widget build(BuildContext context) {
    final settings = widget.settings;
    return PageBody(
      title: 'Setup & team',
      actions: [
        IconButton(
          onPressed: widget.reload,
          tooltip: 'Refresh configuration',
          icon: const Icon(Icons.refresh),
        ),
      ],
      children: [
        if (saved != null) Notice(saved!),
        if (settings == null)
          const Notice(
            'Configuration is unavailable. Check service access; existing installation identity is retained.',
          ),
        Section(
          'Installation access',
          children: [
            const Text(
              'The initial setup token can be redeemed once by an authenticated account. Project access is granted separately.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: token,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Initial setup token',
              ),
            ),
            const SizedBox(height: 12),
            AsyncAction(
              label: 'Redeem initial setup token',
              action: () async {
                final result = await widget.client.bootstrap(
                  BootstrapRedeem(token: SecretInput(token.text)),
                );
                token.clear();
                if (mounted) {
                  setState(
                    () => saved = result.grantsInitialized
                        ? 'Administrator established.'
                        : 'Administrator established; permission initialization is pending.',
                  );
                }
                await widget.reload();
              },
            ),
          ],
        ),
        Section(
          'Lessons & delivery',
          children: [
            const Text(
              'Choose how new lessons are shared. Every choice applies lessons immediately in their originating project and assignment.',
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<LessonHandling>(
              isExpanded: true,
              initialValue: handling,
              decoration: const InputDecoration(
                labelText: 'Required lesson handling',
              ),
              items: [
                for (final mode in LessonHandling.values)
                  DropdownMenuItem(
                    value: mode,
                    child: Text(switch (mode) {
                      LessonHandling.shareAcrossProjects =>
                        'Share across projects',
                      LessonHandling.projectOnly => 'Keep within the project',
                      LessonHandling.trackForReview =>
                        'Track for later promotion or pruning',
                    }),
                  ),
              ],
              onChanged: (v) => setState(() => handling = v),
            ),
            CheckboxListTile(
              title: const Text('Publish branches and pull requests'),
              value: publish,
              onChanged: (v) => setState(() => publish = v!),
            ),
            CheckboxListTile(
              title: const Text('Allow protected-branch merges'),
              value: merge,
              onChanged: (v) => setState(() => merge = v!),
            ),
            CheckboxListTile(
              title: const Text('Allow deployments'),
              value: deploy,
              onChanged: (v) => setState(() => deploy = v!),
            ),
            CheckboxListTile(
              title: const Text(
                'I explicitly confirm these delivery permissions',
              ),
              value: confirmed,
              onChanged: (v) => setState(() => confirmed = v!),
            ),
            AsyncAction(
              label: 'Save lesson & delivery choices',
              action: settings == null || handling == null || !confirmed
                  ? null
                  : () => save(
                      ConfigurationChange(
                        setup: FactorySetup(
                          lessonHandling: handling!,
                          deliveryConfirmed: confirmed,
                          publishBranch: publish,
                          merge: merge,
                          deploy: deploy,
                        ),
                      ),
                    ),
            ),
          ],
        ),
        Section(
          'Roles',
          children: [
            const Text(
              'Each enabled role needs an explicitly selected model and any applicable reasoning effort.',
            ),
            const SizedBox(height: 12),
            if (settings != null)
              for (final role in settings.roles)
                RoleEditor(
                  key: ValueKey('${role.roleId.value}:${settings.revision}'),
                  role: role,
                  models: settings.models,
                  onSave: (updated) => save(
                    ConfigurationChange(
                      roles: [
                        for (final r in settings.roles)
                          r.roleId.value == updated.roleId.value ? updated : r,
                      ],
                    ),
                  ),
                ),
            if (settings?.roles.isEmpty ?? false)
              const Notice(
                'No roles are configured. Create the standard team through installation management.',
              ),
          ],
        ),
        Section(
          'Model profiles',
          children: [
            if (settings != null)
              for (final model in settings.models)
                ModelEditor(
                  key: ValueKey(
                    '${model.profileId.value}:${settings.revision}',
                  ),
                  model: model,
                  onSave: (updated) => save(
                    ConfigurationChange(
                      models: [
                        for (final m in settings.models)
                          m.profileId.value == updated.profileId.value
                              ? updated
                              : m,
                      ],
                    ),
                  ),
                ),
            if (settings != null)
              ModelEditor(
                key: ValueKey('new-profile:${settings.revision}'),
                onSave: (model) => save(
                  ConfigurationChange(models: [...settings.models, model]),
                ),
              ),
          ],
        ),
        Section(
          'Devices',
          children: [
            const Text(
              'Device visibility and enabled choices are separate from backend qualification and capacity admission.',
            ),
            if (settings != null)
              for (final device in settings.discoveredDevices)
                SwitchListTile(
                  title: Text(device.deviceId.value),
                  subtitle: Text(
                    'Host ${device.hostId.value} · ${device.reconciled ? 'Identity reconciled' : 'Identity unresolved; execution blocked'}',
                  ),
                  value: settings.devicePreferences.any(
                    (p) =>
                        p.deviceId.value == device.deviceId.value && p.enabled,
                  ),
                  onChanged: (enabled) => save(
                    ConfigurationChange(
                      devicePreferences: [
                        ...settings.devicePreferences.where(
                          (p) => p.deviceId.value != device.deviceId.value,
                        ),
                        DevicePreference(
                          deviceId: device.deviceId,
                          enabled: enabled,
                        ),
                      ],
                    ),
                  ),
                ),
            if (settings?.discoveredDevices.isEmpty ?? false)
              const Notice(
                'No configured devices are visible. Explicit remote inference does not require a GPU.',
              ),
          ],
        ),
      ],
    );
  }
}

class RoleEditor extends StatefulWidget {
  const RoleEditor({
    super.key,
    required this.role,
    required this.models,
    required this.onSave,
  });
  final RoleConfiguration role;
  final List<ModelProfileConfiguration> models;
  final Future<void> Function(RoleConfiguration) onSave;
  @override
  State<RoleEditor> createState() => _RoleEditorState();
}

class _RoleEditorState extends State<RoleEditor> {
  late bool enabled;
  ModelProfileId? model;
  late TextEditingController effort, devices;
  @override
  void initState() {
    super.initState();
    enabled = widget.role.enabled;
    model = widget.role.modelProfileId;
    effort = TextEditingController(text: widget.role.reasoningEffort?.value);
    devices = TextEditingController(
      text: widget.role.deviceBindings.map((d) => d.value).join(', '),
    );
  }

  @override
  void dispose() {
    effort.dispose();
    devices.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExpansionTile(
    title: Text(widget.role.roleId.value),
    subtitle: Text(
      enabled ? (model?.value ?? 'Model selection required') : 'Disabled',
    ),
    children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SwitchListTile(
              title: const Text('Enable role'),
              value: enabled,
              onChanged: (v) => setState(() => enabled = v),
            ),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue:
                  widget.models.any((m) => m.profileId.value == model?.value)
                  ? model?.value
                  : null,
              decoration: const InputDecoration(labelText: 'Model profile'),
              items: [
                for (final m in widget.models)
                  DropdownMenuItem(
                    value: m.profileId.value,
                    child: Text('${m.profileId.value} · ${m.modelId.value}'),
                  ),
              ],
              onChanged: (v) =>
                  setState(() => model = v == null ? null : ModelProfileId(v)),
            ),
            if (widget.role.reasoningApplicable)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: TextField(
                  controller: effort,
                  decoration: const InputDecoration(
                    labelText: 'Explicit reasoning effort',
                    helperText:
                        'Choose an effort supported by the selected model.',
                  ),
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: devices,
              decoration: const InputDecoration(
                labelText: 'Optional device bindings',
                helperText: 'Comma-separated configured device IDs',
              ),
            ),
            const SizedBox(height: 12),
            AsyncAction(
              label: 'Save role',
              action: () => widget.onSave(
                RoleConfiguration(
                  roleId: widget.role.roleId,
                  enabled: enabled,
                  modelProfileId: model,
                  reasoningApplicable: widget.role.reasoningApplicable,
                  reasoningEffort:
                      widget.role.reasoningApplicable &&
                          effort.text.trim().isNotEmpty
                      ? ActorId(effort.text.trim())
                      : null,
                  deviceBindings: [
                    for (final d
                        in devices.text
                            .split(',')
                            .map((v) => v.trim())
                            .where((v) => v.isNotEmpty))
                      DeviceId(d),
                  ],
                  instructionsId: widget.role.instructionsId,
                ),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class ModelEditor extends StatefulWidget {
  const ModelEditor({super.key, this.model, required this.onSave});
  final ModelProfileConfiguration? model;
  final Future<void> Function(ModelProfileConfiguration) onSave;
  @override
  State<ModelEditor> createState() => _ModelEditorState();
}

class _ModelEditorState extends State<ModelEditor> {
  final fields = <String, TextEditingController>{};
  BillingMode? billing;
  bool local = false;
  @override
  void initState() {
    super.initState();
    final m = widget.model;
    final values = {
      'profile': m?.profileId.value,
      'provider': m?.provider.value,
      'model': m?.modelId.value,
      'credential': m?.credentialId?.value,
      'devices': m?.deviceBindings.map((d) => d.value).join(', '),
      'engine': m?.engine?.name.value,
      'version': m?.engine?.version.value,
      'backend': m?.engine?.backend.value,
      'configuration': m?.engine?.configurationHash.value,
    };
    for (final e in values.entries) {
      fields[e.key] = TextEditingController(text: e.value);
    }
    billing = m?.billing;
    local = m?.engine != null;
  }

  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  String value(String key) => fields[key]!.text.trim();
  @override
  Widget build(BuildContext context) => ExpansionTile(
    title: Text(widget.model?.profileId.value ?? 'Add model profile'),
    subtitle: Text(
      widget.model?.modelId.value ??
          'No model or billing mode is selected automatically',
    ),
    children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final key in ['profile', 'provider', 'model', 'credential'])
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: fields[key],
                  readOnly: key == 'profile' && widget.model != null,
                  decoration: InputDecoration(
                    labelText: switch (key) {
                      'profile' => 'Profile ID',
                      'provider' => 'Provider',
                      'model' => 'Model ID',
                      _ => 'Credential reference (optional)',
                    },
                  ),
                ),
              ),
            DropdownButtonFormField<BillingMode>(
              isExpanded: true,
              initialValue: billing,
              decoration: const InputDecoration(
                labelText: 'Explicit billing mode',
              ),
              items: [
                for (final b in BillingMode.values)
                  DropdownMenuItem(
                    value: b,
                    child: Text(b.value.replaceAll('_', ' ')),
                  ),
              ],
              onChanged: (v) => setState(() => billing = v),
            ),
            SwitchListTile(
              title: const Text('Local engine profile'),
              value: local,
              onChanged: (v) => setState(() => local = v),
            ),
            if (local)
              for (final key in [
                'engine',
                'version',
                'backend',
                'configuration',
                'devices',
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextField(
                    controller: fields[key],
                    decoration: InputDecoration(
                      labelText: switch (key) {
                        'configuration' => 'Engine configuration identity',
                        'devices' => 'Configured device IDs',
                        _ => key,
                      },
                    ),
                  ),
                ),
            AsyncAction(
              label: 'Save model profile',
              action: billing == null
                  ? null
                  : () => widget.onSave(
                      ModelProfileConfiguration(
                        profileId: ModelProfileId(value('profile')),
                        provider: ActorId(value('provider')),
                        modelId: ActorId(value('model')),
                        credentialId: value('credential').isEmpty
                            ? null
                            : CredentialId(value('credential')),
                        billing: billing!,
                        engine: local
                            ? EngineIdentity(
                                name: ActorId(value('engine')),
                                version: ActorId(value('version')),
                                backend: ActorId(value('backend')),
                                configurationHash: ActorId(
                                  value('configuration'),
                                ),
                              )
                            : null,
                        deviceBindings: local
                            ? [
                                for (final d
                                    in value('devices')
                                        .split(',')
                                        .map((v) => v.trim())
                                        .where((v) => v.isNotEmpty))
                                  DeviceId(d),
                              ]
                            : [],
                      ),
                    ),
            ),
          ],
        ),
      ),
    ],
  );
}
