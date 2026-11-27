import 'dart:convert';

import 'package:ironloom_client/ironloom_client.dart';
import 'package:web/web.dart' as web;

String _key(String server, String operator) =>
    'ironloom.commands.${Uri.encodeComponent(server)}.${Uri.encodeComponent(operator)}';
CommandJournal commandJournal(String server, String operator) =>
    _BrowserJournal(_key(server, operator));
void clearJournal(String server, String operator) =>
    web.window.localStorage.removeItem(_key(server, operator));

class _BrowserJournal implements CommandJournal {
  _BrowserJournal(this.key);
  final String key;
  List<Command> _read() {
    final saved = web.window.localStorage.getItem(key);
    if (saved == null) return [];
    final value = jsonDecode(saved);
    if (value is! List<Object?>) {
      throw StateError('Command journal cannot be decoded');
    }
    return value.map(Command.fromJson).toList();
  }

  void _write(List<Command> commands) => web.window.localStorage.setItem(
    key,
    jsonEncode(commands.map((c) => c.toJson()).toList()),
  );
  @override
  Future<void> save(Command command) async {
    final commands = _read()
      ..removeWhere((c) => c.commandId.value == command.commandId.value);
    commands.add(command);
    _write(commands);
  }

  @override
  Future<void> acknowledge(CommandId id) async =>
      _write(_read()..removeWhere((c) => c.commandId.value == id.value));
  @override
  Future<List<Command>> pending() async => _read();
}
