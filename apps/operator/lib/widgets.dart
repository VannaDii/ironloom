import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';

String displayError(Object error) => switch (error) {
  ValidationErrors e =>
    e.fields
        .map(
          (f) =>
              '${f.field.replaceAll('_', ' ')}: ${f.code.replaceAll('_', ' ')}',
        )
        .join('\n'),
  ApiFailure(status: 401) => 'Your session has expired. Sign in again.',
  ApiFailure(status: 403) => 'You do not have permission for this action.',
  ApiFailure(status: 409) =>
    'This changed elsewhere. Refresh before trying again.',
  ApiFailure() =>
    'The service could not complete this request. Your saved work is retained.',
  _ => 'Connection interrupted. Check the service and try again.',
};

class Notice extends StatelessWidget {
  const Notice(this.text, {super.key, this.error = false});
  final String text;
  final bool error;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Card(
      color: error
          ? Theme.of(context).colorScheme.errorContainer
          : Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SelectableText(text),
      ),
    ),
  );
}

class PageBody extends StatelessWidget {
  const PageBody({
    super.key,
    required this.title,
    required this.children,
    this.actions = const [],
  });
  final String title;
  final List<Widget> children;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(title, style: Theme.of(context).textTheme.headlineMedium),
          ...actions,
        ],
      ),
      const SizedBox(height: 20),
      ...children,
    ],
  );
}

class Section extends StatelessWidget {
  const Section(this.title, {super.key, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    ),
  );
}

class AsyncAction extends StatefulWidget {
  const AsyncAction({
    super.key,
    required this.label,
    required this.action,
    this.icon = Icons.check,
  });
  final String label;
  final Future<void> Function()? action;
  final IconData icon;
  @override
  State<AsyncAction> createState() => _AsyncActionState();
}

class _AsyncActionState extends State<AsyncAction> {
  bool busy = false;
  String? error;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      FilledButton.icon(
        onPressed: busy || widget.action == null
            ? null
            : () async {
                setState(() {
                  busy = true;
                  error = null;
                });
                try {
                  await widget.action!();
                } on Object catch (e) {
                  if (mounted) setState(() => error = displayError(e));
                } finally {
                  if (mounted) setState(() => busy = false);
                }
              },
        icon: busy
            ? const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(widget.icon),
        label: Text(widget.label),
      ),
      if (error != null) Notice(error!, error: true),
    ],
  );
}
