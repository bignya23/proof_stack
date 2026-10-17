# server.py (Root entrypoint for uvicorn server:app)
import sys
from pathlib import Path

# Add backend directory to sys.path so modules like agent, mcp_tools, etc. are importable
_ROOT_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _ROOT_DIR / "backend"

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

# Re-export FastAPI app from backend.server
from backend.server import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
