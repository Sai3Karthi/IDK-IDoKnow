"""
Simple FastAPI application that calls api_request.py through lifespan function.
"""

import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI

from main_modules import api_request

# Add main_modules to path to import api_request
sys.path.append(os.path.join(os.path.dirname(__file__), 'main_modules'))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan function that invokes api_request.py"""
    # Import and run api_request
    import argparse
    
    # Load perspective_count from config.json
    from modules.vertex_client import load_config
    config = load_config()
    perspective_count = config.get('perspective_count', 70)
    args = argparse.Namespace(
        input="input.json",
        output="output.json", 
        endpoint=None,
        model=None,
        count=perspective_count,
        temperature=0.6
    )
    api_request.run_pipeline(args)
    yield


# Create minimal FastAPI app
app = FastAPI(lifespan=lifespan)


if __name__ == "__main__":
    import uvicorn
    
    # Run with uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )