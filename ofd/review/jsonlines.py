"""
JSON pointers <-> source lines, for anchoring inline review comments.

``json`` throws positions away, so this is a small recursive-descent scanner that
records the line each member or array item starts on. It only has to cope with
files ``json.loads`` already accepted.
"""

import json
from typing import Any

_WS = " \t\r\n"


def pointer_lines(text: str) -> dict[str, int]:
    """Map every JSON pointer in ``text`` to its 1-based line (``""`` is the root)."""
    lines: dict[str, int] = {}
    decoder = json.JSONDecoder()
    pos = 0

    def line_at(i: int) -> int:
        return text.count("\n", 0, i) + 1

    def skip(i: int) -> int:
        while i < len(text) and text[i] in _WS:
            i += 1
        return i

    def value(i: int, pointer: str) -> int:
        i = skip(i)
        lines.setdefault(pointer, line_at(i))
        ch = text[i]
        if ch == "{":
            i = skip(i + 1)
            if text[i] == "}":
                return i + 1
            while True:
                key_start = skip(i)
                key, i = decoder.raw_decode(text, key_start)
                member = f"{pointer}/{escape(key)}"
                lines[member] = line_at(key_start)
                i = skip(i)
                assert text[i] == ":"
                i = value(i + 1, member)
                i = skip(i)
                if text[i] == "}":
                    return i + 1
                i += 1  # ","
        if ch == "[":
            i = skip(i + 1)
            if text[i] == "]":
                return i + 1
            index = 0
            while True:
                i = value(i, f"{pointer}/{index}")
                index += 1
                i = skip(i)
                if text[i] == "]":
                    return i + 1
                i += 1  # ","
        _, end = decoder.raw_decode(text, i)
        return end

    value(pos, "")
    return lines


def escape(token: str) -> str:
    return str(token).replace("~", "~0").replace("/", "~1")


def split(pointer: str) -> list[str]:
    if not pointer:
        return []
    if not pointer.startswith("/"):
        raise ValueError(f"JSON pointer must start with '/': {pointer!r}")
    return [t.replace("~1", "/").replace("~0", "~") for t in pointer[1:].split("/")]


def line_of(text: str, pointer: str) -> int:
    """Line of ``pointer``, or of its nearest existing ancestor."""
    lines = pointer_lines(text)
    tokens = split(pointer)
    while tokens:
        candidate = "/" + "/".join(escape(t) for t in tokens)
        if candidate in lines:
            return lines[candidate]
        tokens.pop()
    return 1


def resolve(doc: Any, pointer: str) -> Any:
    for token in split(pointer):
        doc = doc[int(token)] if isinstance(doc, list) else doc[token]
    return doc


def set_value(doc: Any, pointer: str, value: Any) -> None:
    """Set ``pointer`` in place. The parent must exist; ``-`` appends to an array."""
    tokens = split(pointer)
    if not tokens:
        raise ValueError("cannot replace the document root")
    parent = resolve(doc, "/" + "/".join(escape(t) for t in tokens[:-1])) if tokens[:-1] else doc
    last = tokens[-1]
    if isinstance(parent, list):
        if last == "-":
            parent.append(value)
        else:
            parent[int(last)] = value
    elif isinstance(parent, dict):
        parent[last] = value
    else:
        raise ValueError(f"parent of {pointer!r} is not a container")
