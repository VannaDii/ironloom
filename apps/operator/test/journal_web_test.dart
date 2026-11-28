@TestOn('browser')
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/platform/journal_web.dart';

void main() {
  test(
    'independent journals retain other commands across save and acknowledge',
    () async {
      const server = 'https://journal.fixture/';
      const operator = 'concurrent';
      clearJournal(server, operator);
      final first = commandJournal(server, operator);
      final second = commandJournal(server, operator);
      Command envelope(String id) => Command.fromJson({
        'command_id': id,
        'project_id': 'p',
        'expected_revision': '1',
        'action': {
          'type': 'input',
          'data': {'conversation_id': 'c', 'text': id},
        },
      });
      final a = envelope('a'), b = envelope('b'), c = envelope('c');
      await Future.wait([first.save(a), second.save(b)]);
      expect((await first.pending()).map((e) => e.commandId.value).toSet(), {
        'a',
        'b',
      });
      await Future.wait([first.acknowledge(a.commandId), second.save(c)]);
      expect((await second.pending()).map((e) => e.commandId.value).toSet(), {
        'b',
        'c',
      });
      expect(
        (await first.pending())
            .singleWhere((c) => c.commandId.value == 'b')
            .toJson(),
        b.toJson(),
      );
      clearJournal(server, operator);
      expect(await second.pending(), isEmpty);
    },
  );
}
