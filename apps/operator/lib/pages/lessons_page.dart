import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:uuid/uuid.dart';

import '../widgets.dart';

class LessonsPage extends StatefulWidget {
  const LessonsPage({super.key, required this.client});
  final IronloomClient client;
  @override
  State<LessonsPage> createState() => _LessonsPageState();
}

class _LessonsPageState extends State<LessonsPage> {
  final project = TextEditingController();
  LessonPage? page;
  List<Lesson> lessons = [];
  String? error;
  RecordScope? filter;
  int epoch = 0;
  String? loadedProject;
  RecordScope? loadedFilter;

  @override
  void initState() {
    super.initState();
    project.addListener(invalidate);
  }

  void invalidate() {
    setState(() {
      epoch++;
      page = null;
      lessons = [];
      loadedProject = null;
      error = null;
    });
  }

  @override
  void dispose() {
    project.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    final requestEpoch = ++epoch;
    final projectId = project.text.trim();
    final scope = filter;
    try {
      final value = await widget.client.lessons(
        LessonQuery(
          projectId: ProjectId(projectId),
          scope: scope,
          after: more ? page?.nextAfter : null,
          limit: Counter('50'),
        ),
      );
      if (mounted && requestEpoch == epoch) {
        setState(() {
          loadedProject = projectId;
          loadedFilter = scope;
          page = value;
          lessons = more ? [...lessons, ...value.lessons] : value.lessons;
          error = null;
        });
      }
    } on Object catch (e) {
      if (mounted && requestEpoch == epoch) {
        setState(() => error = displayError(e));
      }
    }
  }

  Future<void> mutate(
    Lesson lesson,
    LessonOperation operation, {
    required int contextEpoch,
    RecordScope? scope,
    String? content,
  }) async {
    final projectId = loadedProject;
    if (contextEpoch != epoch ||
        projectId == null ||
        projectId != project.text.trim() ||
        loadedFilter != filter ||
        !lessons.contains(lesson)) {
      throw StateError('Lesson context changed. Review lessons again.');
    }
    final revision = lesson.revision;
    final receipt = await widget.client.command(
      Command(
        commandId: CommandId(const Uuid().v4()),
        projectId: ProjectId(projectId),
        expectedRevision: revision,
        action: CommandAction(
          'lesson',
          LessonMutation(
            lessonId: lesson.lessonId,
            expectedRevision: lesson.revision,
            operation: operation,
            scope: scope,
            content: content,
          ),
        ),
      ),
    );
    if (receipt.disposition == CommandDisposition.conflict) {
      throw CommandConflict(receipt);
    }
    if (mounted && contextEpoch == epoch) await load();
  }

  @override
  Widget build(BuildContext context) {
    final contextEpoch = epoch;
    return PageBody(
      title: 'Lessons',
      children: [
        const Text(
          'Lessons apply locally immediately. Sharing their approved content does not grant access to private source conversations or files.',
        ),
        const SizedBox(height: 16),
        TextField(
          controller: project,
          decoration: const InputDecoration(labelText: 'Project ID'),
          onSubmitted: (_) => load(),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<RecordScope>(
          initialValue: filter,
          decoration: const InputDecoration(
            labelText: 'Scope filter (optional)',
          ),
          items: [
            for (final s in RecordScope.values)
              DropdownMenuItem(value: s, child: Text(s.value)),
          ],
          onChanged: (v) {
            filter = v;
            invalidate();
          },
        ),
        const SizedBox(height: 12),
        AsyncAction(
          key: ValueKey((project.text.trim(), filter)),
          label: 'Review lessons',
          action: () => load(),
        ),
        if (error != null) Notice(error!, error: true),
        for (final lesson in lessons)
          Section(
            'Lesson ${lesson.lessonId.value}',
            children: [
              SelectableText(lesson.content),
              const SizedBox(height: 12),
              Text(
                'Scope: ${lesson.scope.value}\nOrigin project: ${lesson.originProject.value}\nOrigin assignment: ${lesson.originAssignment.value}\nSource reference: ${lesson.source.value}',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  AsyncAction(
                    label: 'Edit lesson',
                    action: () async {
                      await showDialog<void>(
                        context: context,
                        builder: (_) => _LessonEditor(
                          lesson: lesson,
                          save: (content) => mutate(
                            lesson,
                            LessonOperation.edit,
                            contextEpoch: contextEpoch,
                            content: content,
                          ),
                        ),
                      );
                    },
                  ),
                  for (final scope in RecordScope.values)
                    AsyncAction(
                      label: switch (scope) {
                        RecordScope.assignment => 'Restrict to assignment',
                        RecordScope.project => 'Restrict to project',
                        RecordScope.installation =>
                          'Promote across installation',
                      },
                      action: scope == lesson.scope
                          ? null
                          : () => mutate(
                              lesson,
                              LessonOperation.setScope,
                              contextEpoch: contextEpoch,
                              scope: scope,
                            ),
                    ),
                  AsyncAction(
                    label: 'Delete lesson',
                    icon: Icons.delete_outline,
                    action: () async {
                      final approved = await showDialog<bool>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: const Text('Delete this lesson?'),
                          content: const Text(
                            'It will be removed from subsequent lesson retrieval. Existing recorded conversations remain.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context, false),
                              child: const Text('Keep lesson'),
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
                          lesson,
                          LessonOperation.delete,
                          contextEpoch: contextEpoch,
                        );
                      }
                    },
                  ),
                ],
              ),
            ],
          ),
        if (page?.nextAfter != null)
          AsyncAction(
            label: 'Load more lessons',
            action: () => load(more: true),
          ),
      ],
    );
  }
}

class _LessonEditor extends StatefulWidget {
  const _LessonEditor({required this.lesson, required this.save});
  final Lesson lesson;
  final Future<void> Function(String) save;
  @override
  State<_LessonEditor> createState() => _LessonEditorState();
}

class _LessonEditorState extends State<_LessonEditor> {
  late final TextEditingController content;
  @override
  void initState() {
    super.initState();
    content = TextEditingController(text: widget.lesson.content);
  }

  @override
  void dispose() {
    content.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Edit lesson'),
    content: SizedBox(
      width: 640,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Current scope: ${widget.lesson.scope.value}. Origin and source provenance are retained.',
            ),
            TextField(
              controller: content,
              minLines: 5,
              maxLines: 15,
              decoration: const InputDecoration(labelText: 'Lesson content'),
            ),
            const SizedBox(height: 12),
            AsyncAction(
              label: 'Save lesson',
              action: () async {
                await widget.save(content.text);
                if (context.mounted) Navigator.pop(context);
              },
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Close'),
      ),
    ],
  );
}
