from __future__ import annotations

import cgi
import json
import mimetypes
import re
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.resolve()
DATA_DIR = ROOT / "data"
MEDIA_DIR = ROOT / "media"
POSTS_FILE = DATA_DIR / "posts.json"
HOST = "127.0.0.1"
PORT = 8000

DATA_DIR.mkdir(exist_ok=True)
MEDIA_DIR.mkdir(exist_ok=True)
if not POSTS_FILE.exists():
    POSTS_FILE.write_text("[]", encoding="utf-8")


def read_posts() -> list[dict]:
    try:
        return json.loads(POSTS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def write_posts(posts: list[dict]) -> None:
    temporary_file = POSTS_FILE.with_suffix(".tmp")
    temporary_file.write_text(json.dumps(posts, indent=2), encoding="utf-8")
    temporary_file.replace(POSTS_FILE)


def send_json(handler: SimpleHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def safe_filename(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,5}", suffix):
        suffix = ".bin"
    return f"{uuid.uuid4().hex}{suffix}"


class CreateWithAtifHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/posts":
            send_json(self, read_posts())
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/posts":
            send_json(self, {"error": "Not found"}, 404)
            return

        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            send_json(self, {"error": "Expected multipart form data"}, 400)
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": content_type},
        )
        post_type = form.getfirst("type", "photo")
        caption = form.getfirst("caption", "").strip()
        collection = form.getfirst("collection", "Journal").strip() or "Journal"
        youtube_url = form.getfirst("youtubeUrl", "").strip()

        if post_type not in {"photo", "video"} or not caption:
            send_json(self, {"error": "A valid type and caption are required"}, 400)
            return
        if post_type == "video" and not youtube_url:
            send_json(self, {"error": "A YouTube URL is required for video posts"}, 400)
            return

        image_url = ""
        if post_type == "video":
            image_url = youtube_thumbnail(youtube_url)
        elif "photo" in form and getattr(form["photo"], "filename", ""):
            uploaded = form["photo"]
            filename = safe_filename(uploaded.filename)
            (MEDIA_DIR / filename).write_bytes(uploaded.file.read())
            image_url = f"/media/{filename}"

        post = {
            "id": uuid.uuid4().hex,
            "type": post_type,
            "caption": caption,
            "collection": collection,
            "image": image_url or "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=85",
            "youtubeUrl": youtube_url,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        posts = read_posts()
        posts.insert(0, post)
        write_posts(posts)
        send_json(self, post, 201)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        prefix = "/api/posts/"
        if not path.startswith(prefix):
            send_json(self, {"error": "Not found"}, 404)
            return

        post_id = path[len(prefix):]
        posts = read_posts()
        post = next((item for item in posts if item.get("id") == post_id), None)
        if post is None:
            send_json(self, {"error": "Post not found"}, 404)
            return

        remaining_posts = [item for item in posts if item.get("id") != post_id]
        write_posts(remaining_posts)
        image = post.get("image", "")
        if image.startswith("/media/"):
            media_file = MEDIA_DIR / Path(image).name
            if media_file.exists():
                media_file.unlink()
        send_json(self, {"deleted": post_id})

    def log_message(self, format: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def youtube_thumbnail(url: str) -> str:
    match = re.search(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([^?&/]+)", url)
    video_id = match.group(1) if match else ""
    if not video_id:
        return "https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?auto=format&fit=crop&w=1000&q=85"
    return f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), CreateWithAtifHandler)
    print(f"createwithatif is running at http://{HOST}:{PORT}")
    print("Posts are stored in data/posts.json and uploaded images in media/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
