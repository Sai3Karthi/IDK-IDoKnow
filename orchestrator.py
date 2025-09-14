import subprocess, json, time, threading
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Pipeline Orchestrator (Module3 Only)", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE = Path(__file__).resolve().parent
MOD3_DIR = BASE / "module3" / "backend"  # Cache path
PYTHON_EXE = BASE / ".venv" / "Scripts" / "python.exe"  # Cache python path

STATE = {
    "stage": "idle",
    "progress": 0,
    "error": None,
    "started_at": None,
    "ended_at": None
}

LOCK = threading.Lock()

def _set(stage=None, progress=None, error=None):
    with LOCK:
        if stage: STATE["stage"] = stage
        if progress is not None: STATE["progress"] = progress
        if error is not None: STATE["error"] = error
        if stage == "done":
            STATE["ended_at"] = time.time()

def run_module3():
    try:
        STATE["started_at"] = time.time()
        _set(stage="module3", progress=10)
        
        # Optimized subprocess with timeout and better error handling
        result = subprocess.run([
            str(PYTHON_EXE), 
            "main.py"
        ], cwd=MOD3_DIR, check=True, timeout=300, capture_output=False)
        
        _set(progress=100, stage="done")
    except subprocess.TimeoutExpired:
        _set(stage="error", error="Module3 execution timed out after 5 minutes")
    except subprocess.CalledProcessError as e:
        _set(stage="error", error=f"Module3 failed with exit code {e.returncode}")
    except FileNotFoundError:
        _set(stage="error", error="Python executable or main.py not found")
    except Exception as e:
        _set(stage="error", error=f"Unexpected error: {str(e)}")

@app.post("/run")
def start_run(data: dict, background: BackgroundTasks):
    if STATE["stage"] in ("module3",):
        return JSONResponse({"error": "pipeline already running"}, status_code=409)
    _set(stage="queued", progress=0, error=None)
    background.add_task(run_module3)
    return {"status": "started"}

@app.get("/status")
def get_status():
    # Add cache headers for better frontend performance
    headers = {"Cache-Control": "no-cache, must-revalidate"}
    return JSONResponse(content=STATE, headers=headers)

@app.get("/results")
def get_results():
    if STATE["stage"] != "done":
        return JSONResponse({"error": "not ready"}, status_code=400)
    
    out_file = MOD3_DIR / "output.json"
    if not out_file.exists():
        return JSONResponse({"error": "final output missing"}, status_code=500)
    
    try:
        # Faster file reading with explicit encoding
        with open(out_file, 'r', encoding='utf-8') as f:
            return json.load(f)  # Direct JSON load instead of read + parse
    except json.JSONDecodeError:
        return JSONResponse({"error": "invalid JSON in output file"}, status_code=500)
    except IOError as e:
        return JSONResponse({"error": f"file read error: {str(e)}"}, status_code=500)
