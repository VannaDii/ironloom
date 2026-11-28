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
  @override
  void dispose() {
    project.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    try {
      final value = await widget.client.lessons(
        LessonQuery(
          projectId: ProjectId(project.text.trim()),
          scope: filter,
          after: more ? page?.nextAfter : null,
          limit: Counter('50'),
        ),
      );
      if (mounted) {
        setState(() {
          page = value;
          lessons = more ? [...lessons, ...value.lessons] : value.lessons;
          error = null;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => error = displayError(e));
    }
  }

  Future<void> mutate(
    Lesson lesson,
    LessonOperation operation, {
    RecordScope? scope,
    String? content,
  }) async {
    final revision = lesson.revision;
    final receipt = await widget.client.command(
      Command(
        commandId: CommandId(const Uuid().v4()),
        projectId: ProjectId(project.text.trim()),
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
    if (mounted) await load();
  }

  @override
  Widget build(BuildContext context) => PageBody(
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
        decoration: const InputDecoration(labelText: 'Scope filter (optional)'),
        items: [
          for (final s in RecordScope.values)
            DropdownMenuItem(value: s, child: Text(s.value)),
        ],
        onChanged: (v) => setState(() => filter = v),
      ),
      const SizedBox(height: 12),
      AsyncAction(label: 'Review lessons', action: () => load()),
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
                for (final scope in RecordScope.values)
                  AsyncAction(
                    label: switch (scope) {
                      RecordScope.assignment => 'Restrict to assignment',
                      RecordScope.project => 'Restrict to project',
                      RecordScope.installation => 'Promote across installation',
                    },
                    action: scope == lesson.scope
                        ? null
                        : () => mutate(
                            lesson,
                            LessonOperation.setScope,
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
                      await mutate(lesson, LessonOperation.delete);
                    }
                  },
                ),
              ],
            ),
          ],
        ),
      if (page?.nextAfter != null)
        AsyncAction(label: 'Load more lessons', action: () => load(more: true)),
    ],
  );
}
