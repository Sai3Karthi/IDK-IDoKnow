import sys, os
import subprocess
import json
import threading
import time
from pydantic import BaseModel
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from Modules.run_cli_chat import run_cli_chat
from Modules.start_llama_server import start_llama_server


BASE_DIR = Path(__file__).parent
CONFIG_FILE = str(BASE_DIR / "config.json")
DEFAULT_CONFIG = {"llama_path": None, "models_path": None}


_setup_gui = None
_llama_server = None
_chat_thread = None

# Basic file I/O for config
def load_config():
    
    try:
        if not os.path.exists(CONFIG_FILE) or os.path.getsize(CONFIG_FILE) == 0:
            return DEFAULT_CONFIG.copy()
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_CONFIG.copy()

def save_config(cfg):
    tmp = f"{CONFIG_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, CONFIG_FILE)

# Initial load of config
config = load_config()


# FastAPI app definition
app = FastAPI()

# Startup and shutdown handling
@asynccontextmanager
async def lifespan(app: FastAPI):

    global _llama_server
    
    # Start setup GUI after a brief delay (FastAPI will be ready)
    threading.Timer(2.0, lambda: subprocess.Popen(
        [sys.executable, str(BASE_DIR / "Modules" / "setpath.py")]
    )).start()
    
    # Start llama server if config exists
    if config.get("llama_path") and config.get("models_path"):
        def server_thread():
            global _llama_server
            _llama_server = start_llama_server(config, BASE_DIR)
        
        threading.Thread(target=server_thread, daemon=True).start()
    
    try:
        yield
    finally:
        # Cleanup on shutdown
        if _llama_server and _llama_server.poll() is None:
            print("[INFO] Stopping llama server...")
            _llama_server.terminate()

app = FastAPI(lifespan=lifespan)

# Pydantic model for config validation
class Config(BaseModel):
    llama_path: str
    models_path: str

# API endpoints
@app.get("/config")
def get_config():
    return config

@app.post("/config")
def set_config(new_config: Config):
    global config, _llama_server
    
    # Convert model to dict - works with both Pydantic v1 and v2
    if hasattr(new_config, "dict"):
        # Pydantic v1
        config_dict = new_config.dict()
    else:
        # Pydantic v2
        config_dict = new_config.model_dump()
    
    config.update(config_dict)
    save_config(config)
    
    # Start the server in a background thread
    def server_thread():
        global _llama_server
        _llama_server = start_llama_server(config, BASE_DIR)
    
    threading.Thread(target=server_thread, daemon=True).start()
    
    return {"status": "saved", "config": config}

@app.post("/activate")
def activate():

    global _chat_thread
  
    if _chat_thread and _chat_thread.is_alive():
        return {"status": "already_running"}
    _chat_thread = threading.Thread(target=run_cli_chat, daemon=True)
    _chat_thread.start()
    
    return {"status": "started"}

# Direct run entry point
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
