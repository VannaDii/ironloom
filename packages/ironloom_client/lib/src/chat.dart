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
  int _generation = 0;
  Object? interruption;
  Stream<ServiceEvent> get events => _events.stream;
  Stream<void> get changes => _changes.stream;
  Future<void> connect(ConversationId id) async {
    final generation = ++_generation;
    await _subscription?.cancel();
    final state = await client.snapshot(id);
    final page = await client.history(
      id,
      HistoryQuery(
        asOf: state.cursor,
        direction: HistoryDirection.backward,
        limit: Counter('50'),
      ),
    );
    if (page.asOf.conversationId.value != id.value ||
        page.asOf.sequence.compareTo(state.cursor.sequence) != 0) {
      throw ApiFailure(502, null);
    }
    if (_closed.isCompleted || generation != _generation) return;
    snapshot = state;
    history = page;
    cursor = state.cursor;
    interruption = null;
    _changes.add(null);
    _listen();
  }

  void _listen() {
    if (_closed.isCompleted || cursor == null) return;
    final generation = _generation;
    _subscription = client
        .events(cursor!)
        .listen(
          (event) {
            if (_closed.isCompleted || generation != _generation) return;
            cursor = event.cursor;
            if (event.snapshot case final state?) {
              if (_accept(state, generation)) _changes.add(null);
            }
            _events.add(event);
          },
          onError: (Object error) {
            if (_closed.isCompleted || generation != _generation) return;
            interruption = error;
            _changes.add(null);
          },
          onDone: () {
            if (!_closed.isCompleted && generation == _generation) {
              interruption ??= ApiFailure(0, null);
              _changes.add(null);
            }
          },
        );
  }

  /// Explicit reconnect; resync-required responses hydrate a consistent new snapshot.
  Future<void> reconnect() async {
    ++_generation;
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
    final generation = _generation;
    state = await client.snapshot(state.session.conversationId);
    if (!_accept(state, generation)) {
      throw StateError('Conversation changed while preparing command');
    }
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
    final expected = snapshot?.session.conversationId ?? cursor?.conversationId;
    if (expected == null) {
      throw StateError('Connect a conversation before retrying');
    }
    final receipt = await client.command(command);
    if (receipt.cursor == null ||
        receipt.cursor!.conversationId.value != expected.value) {
      throw ApiFailure(502, null);
    }
    if (receipt.disposition == CommandDisposition.conflict) {
      throw CommandConflict(receipt);
    }
    await journal.acknowledge(command.commandId);
    return receipt;
  }

  Future<void> refresh() async {
    if (cursor == null) return;
    final generation = _generation;
    final state = await client.snapshot(cursor!.conversationId);
    if (_accept(state, generation)) _changes.add(null);
  }

  bool _accept(ConversationSnapshot state, int generation) {
    final previous = snapshot;
    if (_closed.isCompleted ||
        generation != _generation ||
        previous == null ||
        state.session.conversationId.value !=
            previous.session.conversationId.value ||
        state.revision.compareTo(previous.revision) < 0 ||
        state.cursor.sequence.compareTo(previous.cursor.sequence) < 0 ||
        (cursor != null &&
            state.cursor.sequence.compareTo(cursor!.sequence) < 0)) {
      return false;
    }
    snapshot = state;
    return true;
  }

  Future<void> close() async {
    ++_generation;
    if (!_closed.isCompleted) _closed.complete();
    await _subscription?.cancel();
    await _events.close();
    await _changes.close();
  }
}
