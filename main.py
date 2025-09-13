"""
Simple FastAPI application that calls api_request.py through lifespan function.
"""

import os
import sys
import subprocess
import threading
import time
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
    """Endpoint to handle pipeline completion and start KNN-assignment."""
    def run_knn():
        subprocess.run([
            sys.executable,
            os.path.join(os.path.dirname(__file__), "modules", "KNN-assignment.py")
        ])
        # Notify server after KNN completes
        try:
            requests.post("http://127.0.0.1:8000/api/knn_complete", json={"status": "knn_done"})
        except Exception as e:
            print(f"Failed to notify KNN completion: {e}")
    threading.Thread(target=run_knn).start()
    return {"status": "KNN started"}

@app.post("/api/knn_complete")
async def knn_complete(request: Request):
    """Endpoint to handle KNN completion and signal server shutdown."""
    server_shutdown_event.set()
    return {"status": "server will end"}

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
    args = argparse.Namespace(
        input="input.json",
        output="output.json", 
        endpoint=None,
        model=None,
        count=70,
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