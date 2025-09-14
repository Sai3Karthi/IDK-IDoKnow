import subprocess, json, time, threading, asyncio, importlib.util
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect
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

# Store active WebSocket connections
active_websockets = set()

# Perspective data storage for reconnecting clients
perspective_cache = {}

def _set(stage=None, progress=None, error=None):
    with LOCK:
        if stage: STATE["stage"] = stage
        if progress is not None: STATE["progress"] = progress
        if error is not None: STATE["error"] = error
        if stage == "done":
            STATE["ended_at"] = time.time()

def run_module3():
    """Run module3 and handle perspective streaming."""
    try:
        STATE["started_at"] = time.time()
        _set(stage="module3", progress=10)
        
        # Import necessary modules
        import sys, importlib
        sys.path.append(str(MOD3_DIR))
        sys.path.append(str(MOD3_DIR / "main_modules"))
        
        # Import the api_request module
        try:
            # Use importlib to dynamically import the module
            api_request_spec = importlib.util.find_spec("api_request", [str(MOD3_DIR / "main_modules")])
            if api_request_spec:
                api_request = importlib.util.module_from_spec(api_request_spec)
                api_request_spec.loader.exec_module(api_request)
                print("Successfully imported api_request module")
            else:
                raise ImportError("Could not find api_request module")
        except ImportError as e:
            print(f"Error importing api_request: {e}")
            _set(stage="error", error=f"Import error: {str(e)}")
            return
        
        # Define callback function for streaming perspectives
        def stream_callback(color, perspectives):
            print(f"Received {len(perspectives)} perspectives for color {color}")
            
            # Update progress based on color (rough estimation)
            color_progress = {
                "red": 15, "orange": 30, "yellow": 45, 
                "green": 60, "blue": 75, "indigo": 85, "violet": 95
            }
            _set(progress=color_progress.get(color, 50))
            
            # Create a global variable to store current perspectives
            global perspective_cache
            perspective_cache[color] = perspectives
            
            # We can't directly call async functions from a sync callback
            # Instead, store the perspectives in the cache, and clients will get them
            # when they reconnect or through polling
            print(f"Stored {len(perspectives)} {color} perspectives in cache")
        
        # Create arguments for the api_request module
        class Args:
            pass
        args = Args()
        args.input = str(MOD3_DIR / "input.json")
        args.output = str(MOD3_DIR / "output.json")
        args.endpoint = None
        args.model = None
        args.temperature = 0.6
        args.stream_callback = stream_callback
        
        # Run the pipeline with streaming callback
        code = api_request.run_pipeline(args)
        
        # After pipeline completes, ensure we have all colors in our cache
        # by loading the final output file
        try:
            output_file = MOD3_DIR / "output.json"
            if output_file.exists():
                with open(output_file, 'r', encoding='utf-8') as f:
                    full_data = json.load(f)
                    if "perspectives" in full_data:
                        # Group perspectives by color
                        by_color = {}
                        for p in full_data["perspectives"]:
                            color = p.get("color")
                            if color:
                                if color not in by_color:
                                    by_color[color] = []
                                by_color[color].append(p)
                        
                        # Update our cache with the complete data
                        for color, perspectives in by_color.items():
                            if color not in perspective_cache or len(perspective_cache[color]) < len(perspectives):
                                print(f"Updating cache with {len(perspectives)} {color} perspectives from output file")
                                perspective_cache[color] = perspectives
        except Exception as e:
            print(f"Error loading perspectives from output file: {e}")
        
        # Check if we need to run the clustering step
        clustering_file = MOD3_DIR / "modules" / "TOP-N_K_MEANS-CLUSTERING.py"
        if clustering_file.exists():
            _set(progress=96, stage="clustering")
            subprocess.run([
                str(PYTHON_EXE),
                str(clustering_file)
            ], cwd=str(MOD3_DIR), check=True, timeout=60)
        
        _set(progress=100, stage="done")
    except subprocess.TimeoutExpired:
        _set(stage="error", error="Module3 execution timed out")
    except subprocess.CalledProcessError as e:
        _set(stage="error", error=f"Module3 failed with exit code {e.returncode}")
    except FileNotFoundError as e:
        _set(stage="error", error=f"File not found: {str(e)}")
    except Exception as e:
        _set(stage="error", error=f"Unexpected error: {str(e)}")

@app.post("/run")
def start_run(data: dict, background: BackgroundTasks):
    if STATE["stage"] in ("module3",):
        return JSONResponse({"error": "pipeline already running"}, status_code=409)
    # Clear any previously cached perspectives when initiating a new run
    global perspective_cache
    if perspective_cache:
        print("Clearing existing perspective cache for new run")
    perspective_cache = {}
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

@app.get("/ws/cache")
def get_perspective_cache():
    """Get the current perspective cache for polling clients."""
    # Log the current cache state for debugging
    colors = list(perspective_cache.keys())
    color_counts = {color: len(perspectives) for color, perspectives in perspective_cache.items()}
    print(f"Serving perspective cache: {colors} with counts: {color_counts}")
    
    # Check if we're done processing but missing violet
    if "red" in perspective_cache and "orange" in perspective_cache and \
       "yellow" in perspective_cache and "green" in perspective_cache and \
       "blue" in perspective_cache and "indigo" in perspective_cache and \
       "violet" not in perspective_cache and STATE["progress"] >= 90:
        
        # Try to load violet from output file if it exists
        try:
            output_file = MOD3_DIR / "output.json"
            if output_file.exists():
                with open(output_file, 'r', encoding='utf-8') as f:
                    full_data = json.load(f)
                    if "perspectives" in full_data:
                        # Find violet perspectives
                        violet_perspectives = [p for p in full_data["perspectives"] if p.get("color") == "violet"]
                        if violet_perspectives:
                            print(f"Loading {len(violet_perspectives)} violet perspectives from output file")
                            perspective_cache["violet"] = violet_perspectives
        except Exception as e:
            print(f"Error loading violet perspectives from file: {e}")
    
    return perspective_cache

@app.websocket("/ws/perspectives")
async def perspectives_ws(websocket: WebSocket):
    await websocket.accept()
    print(f"WebSocket client connected from {websocket.client.host}:{websocket.client.port}")
    
    # Add to active connections
    active_websockets.add(websocket)
    
    try:
        # Send any cached perspectives to the new client
        if perspective_cache:
            print(f"Sending cached perspectives to new client: {len(perspective_cache)} color groups")
            for color, perspectives in perspective_cache.items():
                try:
                    await websocket.send_json({
                        "color": color,
                        "perspectives": perspectives
                    })
                    print(f"Sent {len(perspectives)} {color} perspectives to client")
                except Exception as e:
                    print(f"Error sending {color} perspectives to client: {e}")
        
        # Keep the connection alive
        while True:
            try:
                # Wait for any message with a timeout
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Normal case - no message received, client still connected
                # Optionally send a ping to verify connection
                try:
                    await websocket.send_json({"type": "ping", "timestamp": time.time()})
                except Exception:
                    # If ping fails, connection is probably dead
                    break
            except Exception as e:
                print(f"WebSocket receive error: {str(e)}")
                break
    except WebSocketDisconnect:
        print(f"WebSocket client disconnected normally")
    except Exception as e:
        print(f"WebSocket connection error: {str(e)}")
    finally:
        # Remove from active connections
        active_websockets.remove(websocket)
        print("WebSocket connection closed")

# Broadcast perspectives to all connected WebSocket clients
async def broadcast_perspectives(color, perspectives):
    if perspectives:
        # Cache the perspectives
        perspective_cache[color] = perspectives
        
        # Send to all connected clients
        for websocket in list(active_websockets):
            try:
                await websocket.send_json({
                    "color": color,
                    "perspectives": perspectives
                })
            except Exception as e:
                print(f"Error sending to WebSocket client: {str(e)}")
                # Don't remove here, let the connection handler do it
