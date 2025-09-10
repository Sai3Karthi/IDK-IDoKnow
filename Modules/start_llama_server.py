import os
import subprocess
import time
import json
from pathlib import Path

def start_llama_server(config=None, base_dir=None):

    if base_dir is None:
        base_dir = Path(os.path.dirname(os.path.dirname(__file__)))  # Get parent dir of Modules
    
    if not config or not config.get("llama_path") or not config.get("models_path"):
        print("[WARN] Cannot start llama server: missing path configuration")
        return None
        
    try:
        # Build paths
        llama_dir = Path(config["llama_path"])
        models_dir = Path(config["models_path"])
        server_exe = llama_dir / "llama-server.exe"
        
        # Find model file
        ggufs = list(models_dir.rglob("*.gguf"))
        if not ggufs:
            print(f"[ERROR] No GGUF models found in {models_dir}")
            return None
            
        # Prefer gemma models
        model = None
        pref = None
        try:
            model_choice_path = base_dir / "model_choice.json"
            if model_choice_path.exists():
                with open(model_choice_path, "r") as f:
                    data = json.load(f)
                    pref = data.get("model")
        except Exception as e:
            print(f"[WARN] Could not load model_choice.json: {e}")
            pref = None
            
        for pattern in [pref, "gemma"]:
            if pattern is None:
                continue
            for file in ggufs:
                if pattern.lower() in file.name.lower():
                    model = file
                    break
            if model:
                break
                
        # Fall back to first model
        if not model and ggufs:
            model = ggufs[0]
        
        # Start server process
        print(f"[INFO] Starting server with model: {model.name}")
        log_file = open(base_dir / "llama_server.log", "w", encoding="utf-8")
        cmd = [str(server_exe), "-m", str(model), "--n-gpu-layers", "999", "--port", "8080"]
        llama_server = subprocess.Popen(cmd, stdout=log_file, stderr=subprocess.STDOUT)
        
        # Give it time to start
        for _ in range(30):
            import requests
            try:
                r = requests.get("http://127.0.0.1:8080/health", timeout=0.5)
                if r.status_code == 200:
                    print("[INFO] Llama server is ready")
                    return llama_server
            except:
                pass
            time.sleep(0.5)
            
        print("[WARN] Llama server did not respond to health check")
        return llama_server
                
    except Exception as e:
        print(f"[ERROR] Failed to start llama server: {e}")
        return None
