import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import '../widgets.dart';

class ModelsPage extends StatefulWidget {
  const ModelsPage({super.key, required this.client});
  final IronloomClient client;
  @override
  State<ModelsPage> createState() => _ModelsPageState();
}

class _ModelsPageState extends State<ModelsPage> {
  final query = TextEditingController(),
      project = TextEditingController(),
      downloadId = TextEditingController();
  String? host, publisher, error;
  List<ModelCard> models = [];
  ActorId? after;
  final downloads = <String, DownloadProgress>{};
  Timer? timer;
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 2), (_) => poll());
  }

  @override
  void dispose() {
    timer?.cancel();
    query.dispose();
    project.dispose();
    downloadId.dispose();
    super.dispose();
  }

  ProjectId? get selectedProject =>
      project.text.trim().isEmpty ? null : ProjectId(project.text.trim());
  Future<void> search({bool more = false}) async {
    final result = await widget.client.searchModels(
      SourceQuery(
        query: query.text.trim(),
        host: host == null ? null : ActorId(host!),
        publisher: publisher == null ? null : ActorId(publisher!),
        after: more ? after : null,
        limit: Counter('20'),
      ),
      project: selectedProject,
    );
    if (mounted) {
      setState(() {
        models = more ? [...models, ...result.models] : result.models;
        after = result.nextAfter;
        error = null;
      });
    }
  }

  Future<void> openRepository(ModelSource source) async {
    if (!await launchUrl(
      Uri.parse(source.repositoryUrl),
      mode: LaunchMode.externalApplication,
    )) {
      throw StateError('Could not open repository');
    }
  }

  Future<void> start(ModelCard model) async {
    final value = await widget.client.download(
      DownloadCommand(
        commandId: CommandId(const Uuid().v4()),
        projectId: selectedProject,
        repositoryId: model.repositoryId,
        revision: model.source.revision,
        operation: DownloadOperation.start,
      ),
    );
    if (mounted) setState(() => downloads[value.downloadId.value] = value);
  }

  Future<void> poll() async {
    for (final entry in downloads.entries.toList()) {
      if (entry.value.terminated) continue;
      try {
        final value = await widget.client.downloadProgress(
          entry.value.downloadId,
        );
        if (mounted) setState(() => downloads[entry.key] = value);
      } on Object catch (e) {
        if (mounted) setState(() => error = displayError(e));
      }
    }
  }

  Future<void> control(
    DownloadProgress value,
    DownloadOperation operation,
  ) async {
    final updated = await widget.client.download(
      DownloadCommand(
        commandId: CommandId(const Uuid().v4()),
        projectId: selectedProject,
        repositoryId: value.repositoryId,
        revision: value.source.revision,
        downloadId: value.downloadId,
        operation: operation,
      ),
    );
    if (mounted) setState(() => downloads[value.downloadId.value] = updated);
  }

  @override
  Widget build(BuildContext context) => PageBody(
    title: 'Models & sources',
    children: [
      const Text(
        'Discovery uses source metadata. Access, engine compatibility, estimated fit and hardware qualification are separate.',
      ),
      const SizedBox(height: 16),
      Section(
        'Discover weights',
        children: [
          TextField(
            controller: query,
            decoration: const InputDecoration(labelText: 'Search models'),
            onSubmitted: (_) => search(),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: host,
            decoration: const InputDecoration(labelText: 'Hosting source'),
            items: const [
              DropdownMenuItem(
                value: 'huggingface',
                child: Text('Hugging Face'),
              ),
              DropdownMenuItem(value: 'modelscope', child: Text('ModelScope')),
              DropdownMenuItem(value: 'kaggle', child: Text('Kaggle Models')),
            ],
            onChanged: (v) => setState(() => host = v),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: publisher,
            decoration: const InputDecoration(
              labelText: 'Official publisher (optional)',
            ),
            items: const [
              DropdownMenuItem(value: 'Qwen', child: Text('Alibaba / Qwen')),
              DropdownMenuItem(value: 'mistralai', child: Text('Mistral')),
              DropdownMenuItem(value: 'deepseek-ai', child: Text('DeepSeek')),
            ],
            onChanged: (v) => setState(() => publisher = v),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: project,
            decoration: const InputDecoration(
              labelText: 'Project context (optional)',
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              AsyncAction(label: 'Search source catalogs', action: search),
              TextButton(
                onPressed: () => setState(() {
                  publisher = null;
                  host = null;
                  models = [];
                  after = null;
                }),
                child: const Text('Clear filters'),
              ),
            ],
          ),
        ],
      ),
      if (error != null) Notice(error!, error: true),
      for (final model in models)
        Section(
          model.modelId.value,
          children: [
            Text(
              'Publisher: ${model.source.publisher.value}\nHost: ${model.source.host.value}\nRevision: ${model.source.revision.value}\nArchitecture: ${model.architecture?.value ?? 'Unknown'} · Format: ${model.format?.value ?? 'Unknown'} · Quantization: ${model.quantization?.value ?? 'Unknown'}\nDownload size: ${model.weightBytes?.toJson() ?? 'Unknown'} bytes\nLicense: ${model.source.license?.value ?? 'Review repository terms'}',
            ),
            const SizedBox(height: 12),
            Text('Access: ${model.source.access.value.replaceAll('_', ' ')}'),
            const Notice(
              'Engine compatibility and memory fit: unknown until configured engine capability metadata is available. Backend qualification is separate.',
            ),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                AsyncAction(
                  label: 'Open repository & model card',
                  icon: Icons.open_in_new,
                  action: () => openRepository(model.source),
                ),
                if ({
                  SourceAccess.termsRequired,
                  SourceAccess.awaitingApproval,
                }.contains(model.source.access))
                  AsyncAction(
                    label: 'Request access manually',
                    icon: Icons.open_in_browser,
                    action: () => openRepository(model.source),
                  ),
                AsyncAction(
                  label: 'Check access again',
                  icon: Icons.refresh,
                  action: search,
                ),
                AsyncAction(
                  label: 'Download this revision',
                  icon: Icons.download,
                  action: model.source.access == SourceAccess.accessible
                      ? () => start(model)
                      : null,
                ),
              ],
            ),
          ],
        ),
      if (after != null)
        AsyncAction(
          label: 'Load more models',
          action: () => search(more: true),
        ),
      Section(
        'Recover a download',
        children: [
          TextField(
            controller: downloadId,
            decoration: const InputDecoration(
              labelText: 'Persisted download ID',
            ),
          ),
          const SizedBox(height: 12),
          AsyncAction(
            label: 'Read saved progress',
            action: () async {
              final value = await widget.client.downloadProgress(
                ActorId(downloadId.text.trim()),
              );
              if (mounted) {
                setState(() => downloads[value.downloadId.value] = value);
              }
            },
          ),
        ],
      ),
      for (final download in downloads.values)
        Section(
          'Download ${download.downloadId.value}',
          children: [
            Text(
              '${download.receivedBytes} / ${download.totalBytes?.toJson() ?? 'unknown'} bytes\nPinned revision: ${download.source.revision.value}\n${download.terminated
                  ? 'Transfer termination confirmed'
                  : download.cancelRequested
                  ? 'Cancellation requested; waiting for termination'
                  : 'Transfer in progress'}',
            ),
            if (download.totalBytes != null && !download.totalBytes!.isZero)
              LinearProgressIndicator(
                value:
                    (download.receivedBytes.value.toDouble() /
                            download.totalBytes!.value.toDouble())
                        .clamp(0, 1),
              ),
            Wrap(
              spacing: 12,
              children: [
                AsyncAction(
                  label: 'Cancel download',
                  action: download.terminated
                      ? null
                      : () => control(download, DownloadOperation.cancel),
                ),
                AsyncAction(
                  label: 'Resume same revision',
                  action: () => control(download, DownloadOperation.resume),
                ),
              ],
            ),
          ],
        ),
    ],
  );
}
