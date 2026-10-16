"""
db.py — FalkorDB connection singleton.
"""
import os
from falkordb import FalkorDB
from dotenv import load_dotenv

load_dotenv()

_client: FalkorDB | None = None
_graph = None

GRAPH_NAME = os.getenv("FALKORDB_GRAPH", "graphtrace")


def get_graph():
    global _client, _graph
    if _graph is None:
        _client = FalkorDB(
            host=os.getenv("FALKORDB_HOST", "localhost"),
            port=int(os.getenv("FALKORDB_PORT", 6379)),
        )
        _graph = _client.select_graph(GRAPH_NAME)
    return _graph
