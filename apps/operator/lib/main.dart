import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:ironloom_client/ironloom_client.dart';

import 'app.dart';
import 'platform/auth.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final client = IronloomClient(
    ServerConnection(documentBase(), requestHeaders: authenticationHeaders),
    http.Client(),
  );
  runApp(
    OperatorApp(
      client: client,
      returnUri: Uri.base,
      clearReturn: () => clearAuthenticationReturn(Uri.base),
    ),
  );
}
