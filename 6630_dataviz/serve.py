# serve.py — Correct MIME types for modules, JSON, CSV on Windows
from http.server import HTTPServer, SimpleHTTPRequestHandler
import mimetypes, os

# Force correct MIME types
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('text/csv', '.csv')

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        root = os.getcwd()  # Serve current directory
        return super().translate_path(path)

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print("✅ Server running at: http://localhost:8000")
    HTTPServer(("localhost", 8000), Handler).serve_forever()
