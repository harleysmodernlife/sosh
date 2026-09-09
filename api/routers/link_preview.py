"""
GET /link-preview?url=...

Fetches Open Graph / meta tags from a URL server-side and returns a preview card
payload. Results are cached in Redis for 1 hour.

No auth required — URLs are public by definition.
"""
import hashlib
import json
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from redis_client import redis

router = APIRouter()

_CACHE_TTL = 3600  # 1 hour
_FETCH_TIMEOUT = 6.0  # seconds


class LinkPreview(BaseModel):
    url: str
    title: str | None = None
    description: str | None = None
    image_url: str | None = None
    site_name: str | None = None


class _OGParser(HTMLParser):
    """Minimal HTML parser that extracts <meta> OG tags and <title>."""

    def __init__(self):
        super().__init__()
        self.og: dict[str, str] = {}
        self._in_title = False
        self._title_text: list[str] = []
        self._done = False  # Stop after </head>

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._done:
            return
        a = dict(attrs)
        if tag == "meta":
            prop = a.get("property") or a.get("name") or ""
            content = a.get("content") or ""
            if prop.startswith("og:") and content:
                self.og[prop[3:]] = content
            elif prop == "description" and content and "description" not in self.og:
                self.og["description"] = content
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "head":
            self._done = True

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_text.append(data)

    @property
    def page_title(self) -> str | None:
        t = "".join(self._title_text).strip()
        return t or None


def _cache_key(url: str) -> str:
    h = hashlib.sha256(url.encode()).hexdigest()[:24]
    return f"lp:{h}"


def _is_safe_url(url: str) -> bool:
    """Reject private/internal URLs."""
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https"):
            return False
        host = p.hostname or ""
        if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
            return False
        # Block RFC-1918 ranges (rough check)
        if host.startswith("192.168.") or host.startswith("10.") or host.startswith("172."):
            return False
        return True
    except Exception:
        return False


@router.get("/link-preview", response_model=LinkPreview)
async def get_link_preview(url: str = Query(..., max_length=2000)):
    if not _is_safe_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL")

    key = _cache_key(url)
    try:
        cached = await redis.get(key)
        if cached:
            return LinkPreview(**json.loads(cached))
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=_FETCH_TIMEOUT,
            headers={"User-Agent": "Sosh-LinkPreview/1.0"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type:
                raise HTTPException(status_code=422, detail="URL does not return HTML")
            html = resp.text[:50_000]  # Only parse first 50KB
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not fetch URL")

    parser = _OGParser()
    parser.feed(html)
    og = parser.og

    # Resolve relative image URL
    image_url = og.get("image")
    if image_url:
        try:
            image_url = urljoin(url, image_url)
        except Exception:
            image_url = None

    preview = LinkPreview(
        url=url,
        title=og.get("title") or parser.page_title,
        description=og.get("description"),
        image_url=image_url,
        site_name=og.get("site_name") or urlparse(url).netloc,
    )

    try:
        await redis.setex(key, _CACHE_TTL, preview.model_dump_json())
    except Exception:
        pass

    return preview
