import 'package:ironloom_client/ironloom_client.dart';

CommandJournal commandJournal(String server, String operator) =>
    MemoryCommandJournal();
void clearJournal(String server, String operator) {}
