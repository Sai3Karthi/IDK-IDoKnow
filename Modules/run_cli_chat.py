import requests
import json

def run_cli_chat():

    LLAMA_SERVER_URL = "http://127.0.0.1:8080"
    
    print("Connecting to llama.cpp server...")
    
    try:
        requests.get(f"{LLAMA_SERVER_URL}/health", timeout=5)
        print("[OK] Server is responsive.")
    except requests.RequestException as e:
        print(f"[ERR] llama.cpp server not found at {LLAMA_SERVER_URL}. Please ensure it is running.")
        print(f"  > Details: {e}")
        return

    print("Type 'exit' to quit.\n")

    history = []
    system_prompt = "You are a helpful, concise assistant."

    while True:
        try:
            user = input("You> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye.")
            break
        if user.lower() in {"exit", "quit", "q"}:
            print("Bye.")
            break

        # The prompt format for llama.cpp server is typically just the user's message.
        # The server can be configured to use a chat template.
        # For simplicity, we'll just send the latest user message.
        
        # A more advanced implementation would send the history for context.
        # Let's build a simple prompt with history.
        prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
        for role, content in history:
            prompt += f"<|im_start|>{role}\n{content}<|im_end|>\n"
        prompt += f"<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n"


        payload = {
            "prompt": prompt,
            "n_predict": 256,
            "temperature": 2,
            "stream": True,
            "stop": ["<|im_end|>", "user:"] # Stop tokens
        }

        print("AI> ", end="", flush=True)
        full_response = ""
        try:
            with requests.post(f"{LLAMA_SERVER_URL}/completion", json=payload, stream=True) as response:
                response.raise_for_status()
                for chunk in response.iter_lines():
                    if chunk:
                        decoded_chunk = chunk.decode('utf-8')
                        if decoded_chunk.startswith('data: '):
                            try:
                                data = json.loads(decoded_chunk[6:])
                                content = data.get("content", "")
                                print(content, end="", flush=True)
                                full_response += content
                                if data.get("stop"):
                                    break
                            except json.JSONDecodeError:
                                continue # Ignore malformed data chunks
        except requests.RequestException as e:
            print(f"\n[ERR] Request to llama.cpp server failed: {e}")
            break
        
        history.append(("user", user))
        history.append(("assistant", full_response.strip()))
        print()

__all__ = ["run_cli_chat"]