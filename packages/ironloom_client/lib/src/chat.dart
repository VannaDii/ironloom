import 'dart:async';

import 'package:uuid/uuid.dart';

import 'connection.dart';
import 'contracts.dart';

/// Persist command envelopes scoped to a server/account. Authentication secrets
/// must never be stored here. The browser implementation clears its scope on logout.
abstract interface class CommandJournal {
  Future<void> save(Command command);
  Future<void> acknowledge(CommandId id);
  Future<List<Command>> pending();
}

final class MemoryCommandJournal implements CommandJournal {
  final _commands = <String, Command>{};
  @override
  Future<void> save(Command command) async {
    _commands[command.commandId.value] = command;
  }

  @override
  Future<void> acknowledge(CommandId id) async {
    _commands.remove(id.value);
  }

  @override
  Future<List<Command>> pending() async => List.unmodifiable(_commands.values);
}

/// A rejected optimistic command. Its exact envelope remains journaled for review/retry.
final class CommandConflict implements Exception {
  CommandConflict(this.receipt);
  final CommandReceipt receipt;
  @override
  String toString() =>
      'State changed; no command was dispatched. Refresh before retrying.';
}

/// Durable conversation hydration and subscription. An interrupted connection only
/// reads snapshots/history/events; retrying a command is a separate explicit action.
final class ChatConnection {
  ChatConnection(this.client, this.journal);
  final IronloomClient client;
  final CommandJournal journal;
  ConversationSnapshot? snapshot;
  HistoryPage? history;
  ReplayCursor? cursor;
  final _events = StreamController<ServiceEvent>.broadcast();
  final _changes = StreamController<void>.broadcast();
  StreamSubscription<ServiceEvent>? _subscription;
  final _closed = Completer<void>();
  Object? interruption;
  Stream<ServiceEvent> get events => _events.stream;
  Stream<void> get changes => _changes.stream;
  Future<void> connect(ConversationId id) async {
    await _subscription?.cancel();
    final state = await client.snapshot(id);
    final page = await client.history(
      id,
      HistoryQuery(asOf: state.cursor, limit: Counter('50')),
    );
    if (page.asOf.conversationId.value != id.value ||
        page.asOf.sequence.compareTo(state.cursor.sequence) != 0) {
      throw ApiFailure(502, null);
    }
    snapshot = state;
    history = page;
    cursor = state.cursor;
    interruption = null;
    _changes.add(null);
    _listen();
  }

  void _listen() {
    if (_closed.isCompleted || cursor == null) return;
    _subscription = client
        .events(cursor!)
        .listen(
          (event) {
            cursor = event.cursor;
            _events.add(event);
          },
          onError: (Object error) {
            interruption = error;
            _changes.add(null);
          },
          onDone: () {
            if (!_closed.isCompleted) {
              interruption ??= ApiFailure(0, null);
              _changes.add(null);
            }
          },
        );
  }

  /// Explicit reconnect; resync-required responses hydrate a consistent new snapshot.
  Future<void> reconnect() async {
    await _subscription?.cancel();
    if (interruption case ApiFailure(requiresResync: true)) {
      await connect(cursor!.conversationId);
    } else {
      interruption = null;
      _listen();
      _changes.add(null);
    }
  }

  /// Persists the exact command before sending. Failure retains the same key for explicit retry.
  Future<CommandReceipt> send(CommandAction action) async {
    var state = snapshot;
    if (state == null) throw StateError('Connect a conversation first');
    state = await client.snapshot(state.session.conversationId);
    snapshot = state;
    final request = Command(
      commandId: CommandId(const Uuid().v4()),
      projectId: state.session.projectId,
      expectedRevision: state.revision,
      action: action,
    );
    await journal.save(request);
    return retry(request);
  }

  Future<CommandReceipt> retry(Command command) async {
    final receipt = await client.command(command);
    if (receipt.disposition == CommandDisposition.conflict) {
      throw CommandConflict(receipt);
    }
    await journal.acknowledge(command.commandId);
    return receipt;
  }

  Future<void> refresh() async {
    if (cursor == null) return;
    snapshot = await client.snapshot(cursor!.conversationId);
    _changes.add(null);
  }

  Future<void> close() async {
    if (!_closed.isCompleted) _closed.complete();
    await _subscription?.cancel();
    await _events.close();
    await _changes.close();
  }
}
