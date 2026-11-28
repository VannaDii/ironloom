import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';

import '../widgets.dart';

class AssignmentInstructions extends StatefulWidget {
  const AssignmentInstructions({
    super.key,
    required this.client,
    required this.assignment,
  });
  final IronloomClient client;
  final AssignmentId assignment;
  @override
  State<AssignmentInstructions> createState() => _AssignmentInstructionsState();
}

class _AssignmentInstructionsState extends State<AssignmentInstructions> {
  List<InstructionCopy> copies = [];
  String? error;
  bool watching = false;
  int? loadingEpoch;
  int epoch = 0;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (watching) unawaited(load());
    });
  }

  @override
  void didUpdateWidget(covariant AssignmentInstructions old) {
    super.didUpdateWidget(old);
    if (old.assignment.value != widget.assignment.value) {
      ++epoch;
      copies = [];
      error = null;
      watching = false;
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    final generation = epoch;
    if (loadingEpoch == generation) return;
    loadingEpoch = generation;
    try {
      final value = await widget.client.instructionCopies(widget.assignment);
      if (mounted && generation == epoch) {
        setState(() {
          copies = value;
          error = null;
          watching = true;
        });
      }
    } on Object catch (failure) {
      if (mounted && generation == epoch) {
        setState(() {
          error = displayError(failure);
          if (failure is ApiFailure && [401, 403].contains(failure.status)) {
            copies = [];
            watching = false;
          }
        });
      }
    } finally {
      if (loadingEpoch == generation) loadingEpoch = null;
    }
  }

  @override
  Widget build(BuildContext context) => Section(
    'Active instruction copies',
    children: [
      const Text(
        'Acknowledgment confirms the worker reached a controllable boundary. It does not claim an in-flight inference has consumed an edit.',
      ),
      AsyncAction(
        key: ValueKey(widget.assignment.value),
        label: 'Read active instruction copies',
        action: load,
      ),
      if (error != null) Notice(error!, error: true),
      for (final copy in copies)
        ExpansionTile(
          title: Text(copy.instructionId.value),
          subtitle: Text(
            copy.acknowledgedRevision.compareTo(copy.revision) < 0
                ? 'Revision ${copy.revision}: worker update pending (acknowledged ${copy.acknowledgedRevision})'
                : 'Revision ${copy.revision}: acknowledged by worker',
          ),
          children: [SelectableText(copy.content)],
        ),
    ],
  );
}
