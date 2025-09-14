"""
Simple FastAPI application that calls api_request.py through lifespan function.
"""

import os
import sys
import subprocess
import threading
import time
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
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

# Create FastAPI app
app = FastAPI(lifespan=lifespan)

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