#!/usr/bin/python3
"""Deterministic owned-helper HTTP fixture. Never imports or loads an inference engine."""
import argparse
import http.server
import json
import pathlib
import time
import os
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int)
parser.add_argument('--api-key-file')
args, flags = parser.parse_known_args()
key = pathlib.Path(args.api_key_file).read_text()
pathlib.Path('helper.pid').write_text(str(os.getpid()))
while pathlib.Path('hold-startup').exists():
    time.sleep(0.01)
assert all(flag in flags for flag in ['--offline', '--no-warmup', '--jinja'])
assert flags[flags.index('--device')+1] == 'none'
assert flags[flags.index('--fit')+1] == 'off'
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def authorized(self):
        return self.headers.get('Authorization') == 'Bearer ' + key
    def do_GET(self):
        self.send_response(200 if self.authorized() else 403)
        self.end_headers()
        self.wfile.write(b'{"data":[]}')
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.authorized() and body['cache_prompt'] is False
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        first = {'choices': [{'delta': {'content': 'scripted'}, 'finish_reason': None}]}
        self.wfile.write(('data: ' + json.dumps(first) + '\n\n').encode())
        self.wfile.flush()
        if body['messages'][-1]['content'] == 'wait':
            time.sleep(120)
        final = {'choices': [{'delta': {}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 2, 'completion_tokens': 1}}
        self.wfile.write(('data: ' + json.dumps(final) + '\n\ndata: [DONE]\n\n').encode())
http.server.HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
