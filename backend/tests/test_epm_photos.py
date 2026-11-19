import io
from contextlib import closing
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from PIL import Image

from services import epm_photos as photos


def picture(fmt="JPEG", orientation=None):
    buffer = io.BytesIO()
    image = Image.new("RGB", (2100, 1000), "tomato")
    exif = Image.Exif()
    if orientation:
        exif[274] = orientation
    image.save(buffer, fmt, exif=exif)
    return buffer.getvalue()


@pytest.mark.parametrize(("fmt", "mime"), [("JPEG", "image/jpeg"), ("WEBP", "image/webp"), ("PNG", "image/png")])
def test_decoded_variants_are_oriented_bounded_and_keep_aspect(fmt, mime):
    raw = picture(fmt, orientation=6)
    actual, width, height, variants = photos.decode_photo(raw)
    assert (actual, width, height) == (mime, 1000, 2100)
    for key, side in [("preview", 1600), ("thumbnail", 340)]:
        with Image.open(io.BytesIO(variants[key])) as result:
            assert result.format == "JPEG" and result.height == side
            assert abs(result.width / result.height - width / height) < 0.005
            assert not result.getexif()


@pytest.mark.parametrize("raw", [b"<svg />", b"", picture()[:2048], picture("BMP")], ids=["svg", "empty", "truncated-jpeg", "bmp"])
def test_rejects_corrupt_or_unsupported(raw):
    with pytest.raises(HTTPException) as exc:
        photos.decode_photo(raw)
    assert exc.value.status_code == 422


def test_size_and_decoded_pixel_limits(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        photos.decode_photo(bytes(photos.MAX_BYTES + 1))
    assert exc.value.status_code == 413
    monkeypatch.setattr(photos, "MAX_PIXELS", 100)
    with pytest.raises(HTTPException, match="50 megapiksel"):
        photos.decode_photo(picture())


@pytest.mark.asyncio
async def test_private_object_io_preserves_original_and_stream_cleanup(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(photos, "storage_client", lambda: client)
    raw = picture()
    mime, _, _, variants = photos.decode_photo(raw)
    prefix = f"photos/{uuid4()}/{uuid4()}"
    photos._write_variants(prefix, raw, mime, variants)
    puts = [call.kwargs for call in client.put_object.call_args_list]
    assert [(item["Key"].split("/")[-1], item["ContentType"]) for item in puts] == [
        ("original", "image/jpeg"), ("preview", "image/jpeg"), ("thumbnail", "image/jpeg")]
    assert puts[0]["Body"] == raw
    assert all("ACL" not in args for args in puts)
    with closing(io.BytesIO(raw)) as body:
        client.get_object.return_value = {"Body": body}
        assert await photos.get_original({"object_prefix": prefix}) == raw
        assert body.closed
    await photos.cleanup_prefixes([prefix])
    assert [call.kwargs["Key"] for call in client.delete_object.call_args_list] == [item["Key"] for item in puts]


def test_client_requires_private_branch_config(monkeypatch):
    photos.storage_client.cache_clear()
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    with pytest.raises(HTTPException) as exc:
        photos.storage_client()
    assert exc.value.status_code == 503
