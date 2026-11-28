import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:uuid/uuid.dart';

import '../platform/journal.dart';
import '../widgets.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.client, required this.session});
  final IronloomClient client;
  final AuthenticatedSession session;
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  List<ProjectSummary> projects = [];
  List<SessionSummary> sessions = [];
  ActorId? after;
  ConversationId? sessionAfter;
  String? error;
  bool busy = true;
  final name = TextEditingController(),
      repository = TextEditingController(),
      credential = TextEditingController(),
      privateProject = TextEditingController();
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final field in [name, repository, credential, privateProject]) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> load({bool next = false}) async {
    try {
      final projectFuture = next && after == null
          ? Future.value(ProjectPage(projects: [], nextAfter: null))
          : widget.client.projects(
              ProjectQuery(after: next ? after : null, limit: Counter('50')),
            );
      final sessionsFuture = next && sessionAfter == null
          ? Future.value(<SessionSummary>[])
          : widget.client.sessions(
              SessionQuery(
                after: next ? sessionAfter : null,
                limit: Counter('100'),
                archived: false,
              ),
            );
      final results = await Future.wait<Object>([
        projectFuture,
        sessionsFuture,
      ]);
      final page = results[0] as ProjectPage;
      final conversations = results[1] as List<SessionSummary>;
      if (mounted) {
        setState(() {
          projects = next ? [...projects, ...page.projects] : page.projects;
          sessions = next ? [...sessions, ...conversations] : conversations;
          sessionAfter = conversations.length == 100
              ? conversations.last.conversationId
              : null;
          after = page.nextAfter;
          busy = false;
          error = null;
        });
      }
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          error = displayError(e);
          busy = false;
        });
      }
    }
  }

  Future<void> open(ConversationId id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            ChatPage(client: widget.client, session: widget.session, id: id),
      ),
    );
    await load();
  }

  @override
  Widget build(BuildContext context) => PageBody(
    title: 'Projects',
    actions: [
      IconButton(
        onPressed: load,
        tooltip: 'Refresh projects',
        icon: const Icon(Icons.refresh),
      ),
    ],
    children: [
      const Text('Most recent human interaction first'),
      const SizedBox(height: 16),
      if (busy) const LinearProgressIndicator(),
      if (error != null) Notice(error!, error: true),
      if (!busy && projects.isEmpty && error == null)
        const Notice(
          'No projects are visible to this account. Create a project or request membership.',
        ),
      for (final project in projects)
        Section(
          project.name,
          children: [
            Text(
              'Project ${project.projectId.value} · Node ${project.ownerNode.value}',
            ),
            if (project.storage == ProjectStorageState.unavailable)
              const Notice(
                'Workspace storage is unavailable. Project metadata and conversation history are retained.',
              ),
            for (final session in sessions.where(
              (s) => s.projectId.value == project.projectId.value,
            ))
              ListTile(
                leading: const Icon(Icons.chat_bubble_outline),
                title: Text(session.conversationId.value),
                subtitle: Text(
                  session.activeTurnId == null
                      ? 'Ready for conversation'
                      : 'Active turn ${session.activeTurnId!.value}',
                ),
                onTap: () => open(session.conversationId),
              ),
            AsyncAction(
              label: 'New conversation',
              icon: Icons.add_comment_outlined,
              action: !project.permissions.contains(Permission.operate)
                  ? null
                  : () async {
                      final state = await widget.client.createConversation(
                        CreateConversation(
                          commandId: CommandId(const Uuid().v4()),
                          projectId: project.projectId,
                        ),
                      );
                      await open(state.session.conversationId);
                    },
            ),
          ],
        ),
      if (after != null || sessionAfter != null)
        AsyncAction(
          label: 'Load more projects and conversations',
          action: () => load(next: true),
        ),
      Section(
        'Create a project',
        children: [
          TextField(
            controller: name,
            decoration: const InputDecoration(labelText: 'Project name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: repository,
            decoration: const InputDecoration(
              labelText: 'GitHub owner/repository (optional)',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: credential,
            decoration: const InputDecoration(
              labelText: 'Source credential reference (optional)',
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'The service assigns a stable project identity and uses configured project storage.',
          ),
          const SizedBox(height: 12),
          AsyncAction(
            label: 'Create project',
            icon: Icons.add,
            action: () async {
              await widget.client.createProject(
                CreateProject(
                  commandId: CommandId(const Uuid().v4()),
                  name: name.text.trim(),
                  repository: repository.text.trim().isEmpty
                      ? null
                      : RepositorySlug(repository.text.trim()),
                  sourceCredentialId: credential.text.trim().isEmpty
                      ? null
                      : CredentialId(credential.text.trim()),
                ),
              );
              name.clear();
              repository.clear();
              credential.clear();
              await load();
            },
          ),
        ],
      ),
      Section(
        'Administrator private-project access',
        children: [
          const Text(
            'An administrator must explicitly grant themselves access before viewing a private project. The service records this grant.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: privateProject,
            decoration: const InputDecoration(labelText: 'Private project ID'),
          ),
          const SizedBox(height: 12),
          AsyncAction(
            label: 'Record access grant',
            action: () async {
              await widget.client.selfGrant(
                ProjectId(privateProject.text.trim()),
                CommandId(const Uuid().v4()),
              );
              await load();
            },
          ),
        ],
      ),
    ],
  );
}

class ChatPage extends StatefulWidget {
  const ChatPage({
    super.key,
    required this.client,
    required this.session,
    required this.id,
  });
  final IronloomClient client;
  final AuthenticatedSession session;
  final ConversationId id;
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  late ChatConnection chat;
  StreamSubscription<ServiceEvent>? eventSubscription;
  StreamSubscription<void>? changeSubscription;
  final input = TextEditingController(),
      limit = TextEditingController(),
      currency = TextEditingController();
  final focus = FocusNode();
  HistoryPage? renderedHistory;
  final output = <String, String>{};
  final kinds = <String, StreamKind>{};
  List<HistoryItem> items = [];
  ItemId? before;
  String? error;
  bool loading = true,
      steering = false,
      sendBusy = false,
      budgetEnabled = false;
  ExecutionState? execution;
  AssignmentId? assignment;
  @override
  void initState() {
    super.initState();
    chat = ChatConnection(
      widget.client,
      commandJournal(
        widget.client.connection.base.toString(),
        widget.session.operatorId.value,
      ),
    );
    eventSubscription = chat.events.listen(onEvent);
    changeSubscription = chat.changes.listen((_) {
      if (mounted) {
        setState(() {
          if (!identical(renderedHistory, chat.history)) {
            renderedHistory = chat.history;
            items = chat.history?.items ?? [];
            before = chat.history?.nextBefore;
            output.clear();
            kinds.clear();
          }
          execution = chat.snapshot?.executionState;
          assignment = chat.snapshot?.activeAssignmentId;
          if (chat.snapshot?.session.activeTurnId == null) steering = false;
        });
      }
    });
    load();
  }

  Future<void> load() async {
    try {
      await chat.connect(widget.id);
      if (mounted) {
        setState(() {
          items = chat.history!.items;
          before = chat.history!.nextBefore;
          execution = chat.snapshot!.executionState;
          assignment = chat.snapshot!.activeAssignmentId;
          loading = false;
          error = null;
          final budget = chat.snapshot!.budget;
          budgetEnabled = budget?.limitMicros != null;
          limit.text = budget?.limitMicros?.toJson() ?? '';
          currency.text = budget?.currency.value ?? '';
        });
      }
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          error = displayError(e);
          loading = false;
        });
      }
    }
  }

  void onEvent(ServiceEvent event) {
    if (!mounted) return;
    final value = event.event;
    setState(() {
      assignment = value.assignmentId;
      kinds[value.itemId.value] = value.kind;
      if ({
        StreamKind.textDelta,
        StreamKind.stdout,
        StreamKind.stderr,
        StreamKind.toolArgumentsDelta,
      }.contains(value.kind)) {
        output.update(
          value.itemId.value,
          (text) => text + value.text,
          ifAbsent: () => value.text,
        );
      } else if (value.text.isNotEmpty) {
        output[value.itemId.value] = value.text;
      }
      // Keep live rendering bounded; full output remains in durable service history.
      for (final key in output.keys.toList()) {
        final text = output[key]!;
        if (text.length > 65536) {
          output[key] =
              '… earlier output in history …\n${text.substring(text.length - 65536)}';
        }
      }
      while (output.length > 100) {
        final key = output.keys.first;
        output.remove(key);
        kinds.remove(key);
      }
      if (value.state != null) execution = value.state;
    });
    if ({
      StreamKind.waitingForHuman,
      StreamKind.completed,
      StreamKind.stateChanged,
      StreamKind.terminationConfirmed,
    }.contains(value.kind)) {
      unawaited(refreshState());
    }
  }

  Future<void> refreshState() async {
    try {
      await chat.refresh();
      if (mounted) {
        setState(() {
          execution = chat.snapshot?.executionState;
          assignment = chat.snapshot?.activeAssignmentId;
          if (chat.snapshot?.session.activeTurnId == null) steering = false;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => error = displayError(e));
    }
  }

  @override
  void dispose() {
    eventSubscription?.cancel();
    changeSubscription?.cancel();
    chat.close();
    input.dispose();
    limit.dispose();
    currency.dispose();
    focus.dispose();
    super.dispose();
  }

  Future<void> send() async {
    if (sendBusy || input.text.trim().isEmpty) return;
    setState(() => sendBusy = true);
    try {
      final text = input.text;
      final turn = chat.snapshot?.session.activeTurnId;
      if (steering && turn == null) throw StateError('No active turn');
      await chat.send(
        steering
            ? CommandAction(
                'steer',
                SteeringInput(
                  conversationId: widget.id,
                  expectedTurnId: turn!,
                  text: text,
                ),
              )
            : CommandAction(
                'input',
                InputCommand(conversationId: widget.id, text: text),
              ),
      );
      if (!mounted) return;
      if (input.text == text) input.clear();
      await refreshState();
    } on Object catch (e) {
      if (mounted) setState(() => error = displayError(e));
    } finally {
      if (mounted) setState(() => sendBusy = false);
    }
  }

  Future<void> control(ControlAction action) async {
    if (assignment == null) {
      throw StateError('Active assignment binding unavailable');
    }
    await chat.send(
      CommandAction(
        'control',
        ControlCommand(assignmentId: assignment!, action: action),
      ),
    );
    if (mounted) {
      setState(
        () => execution = action == ControlAction.cancel
            ? ExecutionState.cancellationRequested
            : execution,
      );
    }
    await refreshState();
  }

  @override
  Widget build(BuildContext context) {
    final state = chat.snapshot;
    return Scaffold(
      appBar: AppBar(
        title: Text('Conversation ${widget.id.value}'),
        actions: [
          IconButton(
            onPressed: refreshState,
            tooltip: 'Refresh state',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SelectionArea(
        child: Column(
          children: [
            if (loading) const LinearProgressIndicator(),
            if (error != null) Notice(error!, error: true),
            if (chat.interruption != null)
              MaterialBanner(
                content: const Text(
                  'Stream disconnected. Work may still be running.',
                ),
                actions: [
                  TextButton(
                    onPressed: () async {
                      try {
                        await chat.reconnect();
                      } on Object catch (e) {
                        if (mounted) setState(() => error = displayError(e));
                      }
                    },
                    child: const Text('Reconnect'),
                  ),
                ],
              ),
            if (execution != null)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(switch (execution!) {
                        ExecutionState.cancellationRequested => 'Cancellation requested — waiting for termination confirmation',
                        ExecutionState.terminated =>
                          'Execution termination confirmed',
                        _ => execution!.value.replaceAll('_', ' '),
                      }),
                    ),
                    if (assignment != null)
                      PopupMenuButton<ControlAction>(
                        tooltip: 'Assignment controls',
                        onSelected: (action) => control(action).catchError((
                          Object e,
                        ) {
                          if (mounted) setState(() => error = displayError(e));
                        }),
                        itemBuilder: (_) => [
                          for (final a in ControlAction.values)
                            PopupMenuItem(value: a, child: Text(a.value)),
                        ],
                      ),
                  ],
                ),
              ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  if (before != null)
                    AsyncAction(
                      label: 'Load earlier history',
                      action: () async {
                        final page = await widget.client.history(
                          widget.id,
                          HistoryQuery(
                            asOf: chat.history!.asOf,
                            before: before,
                            limit: Counter('50'),
                          ),
                        );
                        if (mounted) {
                          setState(() {
                            items = [...page.items, ...items];
                            before = page.nextBefore;
                          });
                        }
                      },
                    ),
                  for (final item in items)
                    Section(
                      item.message.role.value,
                      children: [
                        if (item.message.text != null) Text(item.message.text!),
                        for (final call in item.message.toolCalls)
                          Text(
                            'Tool request: ${call.name.value}\n${call.arguments}',
                          ),
                        if (item.message.toolResult != null)
                          Text(
                            'Tool result (${item.message.toolResult!.status.value})\n${item.message.toolResult!.content}',
                          ),
                      ],
                    ),
                  for (final entry in output.entries)
                    Section(
                      kinds[entry.key]?.value.replaceAll('_', ' ') ??
                          'Progress',
                      children: [Text(entry.value)],
                    ),
                  if (state?.plan != null)
                    Section(
                      'Plan revision ${state!.plan!.revision}',
                      children: [
                        Text(state.plan!.scope),
                        if (state.plan!.assumptions.isNotEmpty)
                          Text(
                            'Assumptions\n${state.plan!.assumptions.join('\n')}',
                          ),
                        Text(
                          'Acceptance criteria\n${state.plan!.acceptanceCriteria.join('\n')}',
                        ),
                        const SizedBox(height: 12),
                        if (state.approval != null)
                          const Text('This plan revision is approved.')
                        else
                          AsyncAction(
                            label: 'Approve this exact revision',
                            action: () async {
                              final plan = state.plan!;
                              await chat.send(
                                CommandAction(
                                  'approve',
                                  ApprovalCommand(
                                    plan: PlanApproval(
                                      planId: plan.planId,
                                      revision: plan.revision,
                                      contentHash: plan.contentHash,
                                      approvedBy: widget.session.operatorId,
                                    ),
                                  ),
                                ),
                              );
                              await refreshState();
                            },
                          ),
                      ],
                    ),
                  if (state != null)
                    for (final question in state.pendingQuestions)
                      QuestionCard(
                        key: ValueKey(
                          '${question.questionId.value}:${question.revision}',
                        ),
                        question: question,
                        onAnswer: (answer) async {
                          await chat.send(CommandAction('answer', answer));
                          await refreshState();
                        },
                      ),
                  if (state != null)
                    Section(
                      'Optional budget',
                      children: [
                        SwitchListTile(
                          title: const Text('Limit monetary usage'),
                          value: budgetEnabled,
                          onChanged: (v) => setState(() => budgetEnabled = v),
                        ),
                        if (budgetEnabled)
                          TextField(
                            controller: limit,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Limit in currency millionths',
                            ),
                          ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: currency,
                          decoration: const InputDecoration(
                            labelText: 'Currency',
                          ),
                        ),
                        if (state.budget != null)
                          Text(
                            'Incurred: ${state.budget!.incurredMicros} · Reserved: ${state.budget!.reservedMicros}${state.budget!.uncertainUsage ? ' · Some usage is uncertain' : ''}',
                          ),
                        AsyncAction(
                          label: 'Save budget',
                          action: () async {
                            final old = chat.snapshot?.budget;
                            await chat.send(
                              CommandAction(
                                'budget',
                                Budget(
                                  revision: old?.revision ?? Counter('1'),
                                  limitMicros: budgetEnabled
                                      ? Counter(limit.text.trim())
                                      : null,
                                  currency: ActorId(currency.text.trim()),
                                  incurredMicros:
                                      old?.incurredMicros ?? Counter('0'),
                                  reservedMicros:
                                      old?.reservedMicros ?? Counter('0'),
                                  uncertainUsage: old?.uncertainUsage ?? false,
                                ),
                              ),
                            );
                            await refreshState();
                          },
                        ),
                      ],
                    ),
                  FutureBuilder<List<Command>>(
                    future: chat.journal.pending(),
                    builder: (context, snapshot) => Column(
                      children: [
                        for (final command in snapshot.data ?? <Command>[])
                          Notice(
                            'Command ${command.commandId.value} has no confirmed receipt.',
                          ),
                        for (final command in snapshot.data ?? <Command>[])
                          AsyncAction(
                            label: 'Retry same command ID',
                            action: () async {
                              await chat.retry(command);
                              if (mounted) setState(() {});
                            },
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Material(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    if (state?.session.activeTurnId != null)
                      SwitchListTile(
                        title: const Text('Steer the active turn'),
                        value: steering,
                        onChanged: (v) => setState(() => steering = v),
                      ),
                    Shortcuts(
                      shortcuts: const {
                        SingleActivator(
                          LogicalKeyboardKey.enter,
                          control: true,
                        ): ActivateIntent(),
                      },
                      child: Actions(
                        actions: {
                          ActivateIntent: CallbackAction<ActivateIntent>(
                            onInvoke: (_) {
                              send();
                              return null;
                            },
                          ),
                        },
                        child: TextField(
                          controller: input,
                          focusNode: focus,
                          minLines: 2,
                          maxLines: 6,
                          decoration: InputDecoration(
                            labelText: steering
                                ? 'Steering input'
                                : 'Message or idea',
                            helperText: 'Ctrl+Enter to send',
                            suffixIcon: IconButton(
                              onPressed: sendBusy ? null : send,
                              tooltip: 'Send message',
                              icon: sendBusy
                                  ? const CircularProgressIndicator()
                                  : const Icon(Icons.send),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class QuestionCard extends StatefulWidget {
  const QuestionCard({
    super.key,
    required this.question,
    required this.onAnswer,
  });
  final PendingQuestion question;
  final Future<void> Function(QuestionAnswer) onAnswer;
  @override
  State<QuestionCard> createState() => _QuestionCardState();
}

class _QuestionCardState extends State<QuestionCard> {
  final selected = <String>{};
  final text = TextEditingController();
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Section(
    'Waiting for your answer',
    children: [
      Text(widget.question.text),
      for (final choice in widget.question.choices)
        CheckboxListTile(
          title: Text(choice.value),
          value: selected.contains(choice.value),
          onChanged: (v) => setState(() {
            if (!widget.question.allowMultiple) selected.clear();
            if (v == true) {
              selected.add(choice.value);
            } else {
              selected.remove(choice.value);
            }
          }),
        ),
      if (widget.question.allowText)
        TextField(
          controller: text,
          minLines: 2,
          maxLines: 5,
          decoration: const InputDecoration(labelText: 'Your answer'),
        ),
      const SizedBox(height: 12),
      AsyncAction(
        label: 'Submit answer',
        action: () async {
          final choices = selected.map(ActorId.new).toList();
          final response = text.text.trim().isEmpty ? null : text.text;
          widget.question.validateResponse(choices, response);
          await widget.onAnswer(
            QuestionAnswer(
              questionId: widget.question.questionId,
              turnId: widget.question.turnId,
              itemId: widget.question.itemId,
              choices: choices,
              text: response,
              expectedRevision: widget.question.revision,
            ),
          );
        },
      ),
    ],
  );
}
