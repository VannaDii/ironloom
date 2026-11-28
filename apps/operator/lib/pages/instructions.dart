import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:uuid/uuid.dart';

import '../widgets.dart';

class Instructions extends StatefulWidget {
  const Instructions({super.key, required this.client, this.project});
  final IronloomClient client;
  final ProjectId? project;
  @override
  State<Instructions> createState() => _InstructionsState();
}

class _InstructionsState extends State<Instructions> {
  late final TextEditingController project;
  int epoch = 0;
  @override
  void initState() {
    super.initState();
    project = TextEditingController(text: widget.project?.value);
    project.addListener(
      () => setState(() {
        ++epoch;
        templates = [];
        after = null;
        loadedScope = null;
      }),
    );
  }

  List<InstructionTemplate> templates = [];
  InstructionId? after;
  String? loadedScope;
  @override
  void dispose() {
    project.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    final generation = ++epoch;
    final scope = project.text.trim();
    if (more && loadedScope != scope) {
      throw StateError('Reload instructions for the selected project first');
    }
    final page = await widget.client.instructions(
      InstructionQuery(
        projectId: scope.isEmpty ? null : ProjectId(scope),
        after: more ? after : null,
        limit: Counter('50'),
      ),
    );
    if (!mounted || generation != epoch || project.text.trim() != scope) return;
    setState(() {
      templates = more
          ? [...templates, ...page.instructions]
          : page.instructions;
      after = page.nextAfter;
      loadedScope = scope;
    });
  }

  Future<void> edit(InstructionTemplate? template) async {
    final scope = project.text.trim();
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => InstructionEditor(
        client: widget.client,
        template: template,
        project:
            template?.projectId ??
            (template == null && scope.isNotEmpty ? ProjectId(scope) : null),
      ),
    );
    if (changed == true && mounted) await load();
  }

  @override
  Widget build(BuildContext context) => Section(
    'Role instructions',
    children: [
      const Text(
        'Project customization uses a distinct template ID, selected in role settings. Editing a template requires an explicit decision about active assignment copies.',
      ),
      TextField(
        controller: project,
        readOnly: widget.project != null,
        decoration: const InputDecoration(
          labelText: 'Instruction project scope (blank for installation)',
        ),
      ),
      Wrap(
        spacing: 8,
        children: [
          AsyncAction(label: 'Load instructions', action: () => load()),
          AsyncAction(
            label: 'Create instruction template',
            action: () => edit(null),
          ),
        ],
      ),
      for (final template in templates)
        ExpansionTile(
          title: Text(template.instructionId.value),
          subtitle: Text(
            '${template.projectId?.value ?? 'Installation'} · revision ${template.revision}',
          ),
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SelectableText(template.content),
                  AsyncAction(
                    label: 'Edit ${template.instructionId.value}',
                    action: () => edit(template),
                  ),
                ],
              ),
            ),
          ],
        ),
      if (after != null)
        AsyncAction(label: 'More instructions', action: () => load(more: true)),
    ],
  );
}

class InstructionEditor extends StatefulWidget {
  const InstructionEditor({
    super.key,
    required this.client,
    required this.template,
    required this.project,
  });
  final IronloomClient client;
  final InstructionTemplate? template;
  final ProjectId? project;
  @override
  State<InstructionEditor> createState() => _InstructionEditorState();
}

class _InstructionEditorState extends State<InstructionEditor> {
  late final TextEditingController id, content;
  final assignments = TextEditingController();
  ActiveInstructionUpdate? update;
  @override
  void initState() {
    super.initState();
    id = TextEditingController(text: widget.template?.instructionId.value);
    content = TextEditingController(text: widget.template?.content);
  }

  @override
  void dispose() {
    id.dispose();
    content.dispose();
    assignments.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Instruction template'),
    content: SizedBox(
      width: 640,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Scope: ${widget.project?.value ?? 'Installation'}'),
            TextField(
              controller: id,
              enabled: widget.template == null,
              decoration: const InputDecoration(
                labelText: 'Unique instruction ID',
              ),
            ),
            TextField(
              controller: content,
              minLines: 6,
              maxLines: 16,
              decoration: const InputDecoration(labelText: 'Role instructions'),
            ),
            DropdownButtonFormField<ActiveInstructionUpdate>(
              initialValue: update,
              decoration: const InputDecoration(
                labelText: 'Apply to active assignments?',
              ),
              items: const [
                DropdownMenuItem(
                  value: ActiveInstructionUpdate.preserveCopies,
                  child: Text('No — preserve existing copies'),
                ),
                DropdownMenuItem(
                  value: ActiveInstructionUpdate.updateSelectedCopies,
                  child: Text('Yes — update selected copies'),
                ),
              ],
              onChanged: (value) => setState(() => update = value),
            ),
            if (update == ActiveInstructionUpdate.updateSelectedCopies)
              TextField(
                controller: assignments,
                decoration: const InputDecoration(
                  labelText: 'Selected active assignment IDs',
                  helperText: 'Comma-separated; service checks access and notifies affected workers.',
                ),
              ),
            const SizedBox(height: 12),
            AsyncAction(
              label: 'Save instruction template',
              action: update == null
                  ? null
                  : () async {
                      await widget.client.instruction(
                        InstructionCommand(
                          commandId: CommandId(const Uuid().v4()),
                          projectId: widget.project,
                          instructionId: InstructionId(id.text.trim()),
                          expectedRevision:
                              widget.template?.revision ?? Counter('0'),
                          content: content.text,
                          activeUpdate: update!,
                          assignments:
                              update == ActiveInstructionUpdate.preserveCopies
                              ? []
                              : assignments.text
                                    .split(',')
                                    .map((value) => value.trim())
                                    .where((value) => value.isNotEmpty)
                                    .map(AssignmentId.new)
                                    .toList(),
                        ),
                      );
                      if (context.mounted) Navigator.pop(context, true);
                    },
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context, false),
        child: const Text('Close'),
      ),
    ],
  );
}
