import 'dart:convert';

import 'package:ironloom_client/ironloom_client.dart';
import 'package:web/web.dart' as web;

String _key(String server, String operator) =>
    'ironloom.commands.${Uri.encodeComponent(server)}.${Uri.encodeComponent(operator)}';
CommandJournal commandJournal(String server, String operator) =>
    _BrowserJournal(_key(server, operator));
void clearJournal(String server, String operator) {
  final journal = _BrowserJournal(_key(server, operator));
  for (final key in journal.keys()) {
    web.window.localStorage.removeItem(key);
  }
}

class _BrowserJournal implements CommandJournal {
  _BrowserJournal(String scope) : prefix = '$scope.command.';
  final String prefix;
  String key(CommandId id) => '$prefix${Uri.encodeComponent(id.value)}';
  List<String> keys() {
    final storage = web.window.localStorage;
    return [
      for (var i = 0; i < storage.length; i++)
        if (storage.key(i) case final String key when key.startsWith(prefix))
          key,
    ];
  }

  @override
  Future<void> save(Command command) async => web.window.localStorage.setItem(
    key(command.commandId),
    jsonEncode(command.toJson()),
  );
  @override
  Future<void> acknowledge(CommandId id) async =>
      web.window.localStorage.removeItem(key(id));
  @override
  Future<List<Command>> pending() async {
    final commands = <Command>[];
    for (final entry in keys()) {
      final saved = web.window.localStorage.getItem(entry);
      if (saved == null) {
        continue;
      } // Another tab acknowledged it during enumeration.
      final command = Command.fromJson(jsonDecode(saved));
      if (key(command.commandId) != entry) {
        throw StateError('Command journal identity does not match its key');
      }
      commands.add(command);
    }
    return commands;
  }
}
