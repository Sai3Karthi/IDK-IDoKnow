"""
Module for api_request pipeline execution when imported by orchestrator.
"""

import os
import sys
import subprocess
import threading
import time
import json
import asyncio
from contextlib import asynccontextmanager
from typing import Callable, Dict, List, Any, Optional
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
import requests
import argparse

# Add main_modules to path to import api_request
sys.path.append(os.path.join(os.path.dirname(__file__), 'main_modules'))
from main_modules import api_request

# Event to signal server shutdown
server_shutdown_event = threading.Event()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan function that starts a thread to monitor server shutdown."""
    def monitor_shutdown():
        print("Monitoring server shutdown...")
        server_shutdown_event.wait()
        print("Server shutdown signal received. Shutting down...")
        os._exit(0)
    
    threading.Thread(target=monitor_shutdown, daemon=True).start()
    yield

# Function to run pipeline with streaming for orchestrator
async def run_pipeline_with_streaming(
    input_file: str,
    output_file: str,
    stream_callback: Callable[[str, List[Dict[str, Any]]], None],
    temperature: float = 0.6
):
    """Run the perspective pipeline with streaming callback."""
    
    class Args:
        pass
    
    args = Args()
    args.input = input_file
    args.output = output_file
    args.endpoint = None
    args.model = None
    args.temperature = temperature
    args.stream_callback = stream_callback
    
    try:
        code = api_request.run_pipeline(args)
        return code
    except Exception as e:
        print(f"Error in pipeline execution: {str(e)}")
        raise

def run_clustering():
    """Run the clustering process after perspectives are generated."""
    clustering_file = os.path.join(os.path.dirname(__file__), "modules", "TOP-N_K_MEANS-CLUSTERING.py")
    
    try:
        subprocess.run([
            sys.executable,
            clustering_file
        ], cwd=os.path.dirname(__file__), check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Clustering failed with exit code: {e.returncode}")
        return False
    except Exception as e:
        print(f"Error running clustering: {str(e)}")
        return False

# Create FastAPI app

# Store the active WebSocket connection for streaming perspectives
active_ws = None

app = FastAPI(lifespan=lifespan)
@app.websocket("/ws/perspectives")
async def perspectives_ws(ws: WebSocket):
    global active_ws
    print(f"WebSocket connection request received")
    try:
        await ws.accept()
        print(f"WebSocket connection accepted")
        active_ws = ws
        
        # Log connection info
        client = ws.client
        print(f"WebSocket client connected from {client.host}:{client.port}")
        
        try:
            # Keep the connection alive
            while True:
                try:
                    # Wait for any message with a timeout
                    import asyncio
                    await asyncio.wait_for(ws.receive_text(), timeout=30)
                    print("Received keepalive from client")
                except asyncio.TimeoutError:
                    # Normal case - no message received, client still connected
                    if active_ws:
                        # Optionally send a ping to verify connection
                        try:
                            await ws.send_json({"type": "ping", "timestamp": time.time()})
                        except Exception:
                            # If ping fails, connection is probably dead
                            print("Ping failed, closing connection")
                            break
                except Exception as e:
                    print(f"WebSocket receive error: {str(e)}")
                    break
        except WebSocketDisconnect:
            print(f"WebSocket client disconnected normally")
        except Exception as e:
            print(f"WebSocket connection error: {str(e)}")
    except Exception as e:
        print(f"WebSocket accept error: {str(e)}")
    finally:
        print("WebSocket connection closed")
        active_ws = None

from fastapi.responses import JSONResponse

# Trigger pipeline and stream perspectives to WebSocket
@app.post("/api/run_pipeline_stream")
async def run_pipeline_stream():
    import importlib
    from main_modules import api_request
    global active_ws

    def stream_callback(color, perspectives):
        import asyncio
        if active_ws:
            print(f"Streaming {len(perspectives)} perspectives for color {color}")
            payload = {"color": color, "perspectives": perspectives}
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Use create_task instead of ensure_future for better error handling
                    async def send_and_log():
                        try:
                            await active_ws.send_json(payload)
                            print(f"Successfully sent {color} perspectives to client")
                        except Exception as e:
                            print(f"Failed to send {color} perspectives: {str(e)}")
                    
                    asyncio.create_task(send_and_log())
                else:
                    print("Running event loop to send perspectives")
                    loop.run_until_complete(active_ws.send_json(payload))
                    print(f"Sent {color} perspectives in new event loop")
            except Exception as e:
                print(f"WebSocket send error: {str(e)}")
                print(f"WebSocket state: {'connected' if active_ws else 'disconnected'}")
                # Print diagnostic info about the payload size
                import sys
                try:
                    payload_size = sys.getsizeof(json.dumps(payload))
                    print(f"Payload size: {payload_size} bytes")
                except:
                    print("Could not determine payload size")
        else:
            print(f"Cannot stream {color} perspectives: No active WebSocket connection")

    class Args:
        pass
    args = Args()
    args.input = "input.json"
    args.output = "output.json"
    args.endpoint = None
    args.model = None
    args.temperature = 0.6
    args.stream_callback = stream_callback

    try:
        code = api_request.run_pipeline(args)
        return JSONResponse({"status": "completed", "code": code})
    except Exception as e:
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)

@app.post("/api/pipeline_complete")
async def pipeline_complete(request: Request):
    """Endpoint to handle pipeline completion and start clustering."""
    def run_clustering():
        subprocess.run([
            sys.executable,
            os.path.join(os.path.dirname(__file__), "modules", "TOP-N_K_MEANS-CLUSTERING.py")
        ])
        # Notify server after clustering completes
        try:
            requests.post("http://127.0.0.1:8000/api/clustering_complete", json={"status": "clustering_done"})
        except Exception as e:
            print(f"Failed to notify clustering completion: {e}")
    threading.Thread(target=run_clustering).start()
    return {"status": "Clustering started"}

@app.post("/api/clustering_complete")
async def clustering_complete(request: Request):
    """Endpoint to handle clustering completion and signal server shutdown."""
    server_shutdown_event.set()
    return {"status": "server will end"}
@app.get("/api/status")
async def check_status():
    # Check if processing is complete by looking for output file
    output_exists = os.path.exists("output.json")
    clustering_exists = os.path.exists("final_output/common.json")
    
    if clustering_exists:
        return {"status": "completed"}
    elif output_exists:
        return {"status": "processing", "progress": 50}
    else:
        return {"status": "processing", "progress": 10}

@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify server is running and websocket is ready"""
    websocket_status = "available" if active_ws else "not_connected"
    return {
        "status": "ok",
        "websocket_connection": websocket_status,
        "server_time": time.time(),
        "backend_version": "1.0.0"
    }
if __name__ == "__main__":
    import uvicorn
    # Start server in a thread
    server_thread = threading.Thread(target=lambda: uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    ))
    server_thread.start()

    # Invoke api_request.py outside lifespan
    # Note: No need to read config.json here, api_request will read it directly
    args = argparse.Namespace(
        input="input.json",
        output="output.json", 
        endpoint=None,
        model=None,
        temperature=0.6
    )
    api_request.run_pipeline(args)

    # Notify server after pipeline completes
    try:
        requests.post("http://127.0.0.1:8000/api/pipeline_complete", json={"status": "done"})
    except Exception as e:
        print(f"Failed to notify server: {e}")

    # Wait for server shutdown
    server_thread.join()
    # Forcefully exit Python process
    os._exit(0)