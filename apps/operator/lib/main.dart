import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:ironloom_client/ironloom_client.dart';

import 'app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final client = IronloomClient(
    ServerConnection.web(Uri.base.resolve('./')),
    http.Client(),
  );
  runApp(OperatorApp(client: client));
}
