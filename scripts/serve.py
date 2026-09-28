"""Local dev server with caching disabled (ES modules otherwise go stale).

Also answers HTTP Range requests, which the fleet map needs: it reads
vector tiles out of one static file (assets/map/boston.pmtiles) byte range
by byte range. Python's built-in handler ignores Range and sends the whole file.
"""
import http.server, sys, os, re

class DevHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start, end = m.groups()
        if start == "":  # suffix range: last N bytes
            start, end = max(0, size - int(end or 0)), size - 1
        else:
            start, end = int(start), min(int(end) if end else size - 1, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        n = getattr(self, "_remaining", None)
        if n is None:
            return super().copyfile(source, outputfile)
        self._remaining = None
        while n > 0:
            chunk = source.read(min(64 * 1024, n))
            if not chunk:
                break
            outputfile.write(chunk)
            n -= len(chunk)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    DevHandler.extensions_map.update({".mjs": "text/javascript", ".pmtiles": "application/octet-stream", ".woff2": "font/woff2"})
    print(f"CoCo dev server → http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), DevHandler).serve_forever()
