import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';

import '../widgets.dart';

class ModelAssessment extends StatefulWidget {
  const ModelAssessment({
    super.key,
    required this.client,
    required this.model,
    this.project,
    this.configurationRevision,
  });
  final IronloomClient client;
  final ModelCard model;
  final ProjectId? project;
  final Counter? configurationRevision;
  @override
  State<ModelAssessment> createState() => _ModelAssessmentState();
}

class _ModelAssessmentState extends State<ModelAssessment> {
  final profile = TextEditingController(),
      contextTokens = TextEditingController(),
      concurrency = TextEditingController();
  List<EngineAssessment> results = [];
  int epoch = 0;
  @override
  void didUpdateWidget(covariant ModelAssessment old) {
    super.didUpdateWidget(old);
    if (old.configurationRevision != widget.configurationRevision ||
        old.project?.value != widget.project?.value ||
        old.model.repositoryId.value != widget.model.repositoryId.value ||
        old.model.source.revision.value != widget.model.source.revision.value) {
      ++epoch;
      results = [];
    }
  }

  @override
  void dispose() {
    profile.dispose();
    contextTokens.dispose();
    concurrency.dispose();
    super.dispose();
  }

  void invalidate(String _) => setState(() {
    ++epoch;
    results = [];
  });
  Future<void> assess() async {
    final generation = ++epoch;
    setState(() => results = []);
    final value = await widget.client.assessModel(
      ModelAssessmentQuery(
        projectId: widget.project,
        repositoryId: widget.model.repositoryId,
        revision: widget.model.source.revision,
        profileId: profile.text.trim().isEmpty
            ? null
            : ModelProfileId(profile.text.trim()),
        contextTokens: Counter(contextTokens.text.trim()),
        concurrency: Counter(concurrency.text.trim()),
      ),
    );
    if (mounted && epoch == generation) setState(() => results = value);
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        'Compatibility and memory fit remain unknown until assessed against current configured engines. Estimates do not qualify a backend.',
      ),
      TextField(
        controller: profile,
        onChanged: invalidate,
        decoration: const InputDecoration(
          labelText: 'Assessment model profile (optional)',
        ),
      ),
      TextField(
        controller: contextTokens,
        onChanged: invalidate,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(
          labelText: 'Assessment context tokens',
        ),
      ),
      TextField(
        controller: concurrency,
        onChanged: invalidate,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'Assessment concurrency'),
      ),
      AsyncAction(label: 'Assess configured engines', action: assess),
      for (final result in results)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: SelectableText(
            '${result.engine.name.value} · ${result.engine.version.value} · ${result.engine.backend.value}\nCompatibility: ${result.requirements.compatibility.value} — ${result.requirements.reason}\nEstimated memory: ${result.fit.estimatedBytes?.toJson() ?? 'Unknown'} bytes\nFit after eligible idle eviction: ${result.fit.fitsAfterIdleEviction == null
                ? 'Unknown'
                : result.fit.fitsAfterIdleEviction!
                ? 'Fits'
                : 'Does not fit'}\nBackend qualification: ${result.fit.qualification.value}\n${result.fit.reason}\nCanonical devices: ${result.devices.map((device) => device.deviceId.value).join(', ')}',
          ),
        ),
    ],
  );
}

class ModelInventory extends StatefulWidget {
  const ModelInventory({
    super.key,
    required this.client,
    this.project,
    this.onRecover,
  });
  final IronloomClient client;
  final ProjectId? project;
  final Future<void> Function(ActorId)? onRecover;
  @override
  State<ModelInventory> createState() => _ModelInventoryState();
}

class _ModelInventoryState extends State<ModelInventory> {
  List<ModelInventoryItem> entries = [];
  ActorId? after;
  ModelVerification? verification;
  int epoch = 0;
  @override
  void didUpdateWidget(covariant ModelInventory old) {
    super.didUpdateWidget(old);
    if (old.project?.value != widget.project?.value) {
      ++epoch;
      entries = [];
      after = null;
    }
  }

  Future<void> load({bool more = false}) async {
    final generation = ++epoch;
    final page = await widget.client.inventory(
      ModelInventoryQuery(
        projectId: widget.project,
        after: more ? after : null,
        limit: Counter('50'),
        verification: verification,
      ),
    );
    if (mounted && generation == epoch) {
      setState(() {
        entries = more ? [...entries, ...page.models] : page.models;
        after = page.nextAfter;
      });
    }
  }

  @override
  Widget build(BuildContext context) => Section(
    'Installed-model inventory',
    children: [
      const Text(
        'Transferred bytes and checksum-verified installation are independent. Unavailable storage retains its provenance but blocks use.',
      ),
      DropdownButtonFormField<ModelVerification>(
        initialValue: verification,
        decoration: const InputDecoration(
          labelText: 'Verification filter (optional)',
        ),
        items: [
          for (final value in ModelVerification.values)
            DropdownMenuItem(value: value, child: Text(value.value)),
        ],
        onChanged: (value) => setState(() {
          verification = value;
          ++epoch;
          entries = [];
          after = null;
        }),
      ),
      AsyncAction(label: 'Refresh installed models', action: () => load()),
      for (final entry in entries)
        ListTile(
          title: SelectableText(entry.model.modelId.value),
          trailing: entry.downloadId != null && widget.onRecover != null
              ? AsyncAction(
                  label: 'Open download controls',
                  action: () => widget.onRecover!(entry.downloadId!),
                )
              : null,
          subtitle: SelectableText(
            'Inventory ID: ${entry.inventoryId.value}\nPublisher: ${entry.model.source.publisher.value} · Host: ${entry.model.source.host.value}\nRevision: ${entry.model.source.revision.value}\nDownload: ${entry.downloadId?.value ?? 'None'}\nTransfer complete: ${entry.transferComplete}\nVerification: ${entry.verification.value}\nVerified manifest: ${entry.verifiedManifestHash?.value ?? 'None'}\nVerified at: ${entry.verifiedAtMs?.toJson() ?? 'Unknown'}\nStorage: ${entry.storageAvailable ? 'Available' : 'Unavailable'}',
          ),
        ),
      if (after != null)
        AsyncAction(
          label: 'More installed models',
          action: () => load(more: true),
        ),
    ],
  );
}
