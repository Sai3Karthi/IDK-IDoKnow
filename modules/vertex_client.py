"""
Vertex AI Client Module

Handles Vertex AI endpoint validation, client initialization, and model calls
with rate limiting and retry logic.
"""

import re
import time
from typing import Optional, Tuple, List
from google import genai
from google.genai import types


# Vertex endpoint pattern validation
ENDPOINT_REGEX = re.compile(
    r"^projects/(?P<project>[A-Za-z0-9_-]+)/locations/(?P<location>[a-z0-9-]+)/endpoints/(?P<endpoint>[0-9]+)$"
)


def parse_endpoint_path(model: str) -> Optional[Tuple[str, str]]:
    """Return (project, location) if model looks like a Vertex endpoint path."""
    m = ENDPOINT_REGEX.match(model.strip())
    if not m:
        return None
    return m.group("project"), m.group("location")


def build_client(endpoint: str) -> genai.Client:
    """Build and return a Vertex AI client for the given endpoint."""
    parsed = parse_endpoint_path(endpoint)
    if not parsed:
        raise ValueError(
            "Endpoint must match pattern projects/<project>/locations/<region>/endpoints/<id>."
        )
    project, location = parsed
    print(f"[info] Connected to Vertex AI")
    return genai.Client(vertexai=True, project=project, location=location)


def call_model(
    client: genai.Client, 
    endpoint: str, 
    user_text: str, 
    temperature: float = 0.4, 
    delay_after: float = 2.0
) -> str:
    """
    Call the model with retry logic and rate limiting.
    
    Args:
        client: Initialized Vertex AI client
        endpoint: Vertex endpoint path
        user_text: Prompt text to send to model
        temperature: Sampling temperature (0.0-1.0)
        delay_after: Delay in seconds after successful call
        
    Returns:
        Generated text response from model
        
    Raises:
        Exception: If all retries are exhausted or non-rate-limit errors occur
    """
    try:
        part = types.Part.from_text(text=user_text)
    except TypeError:
        part = types.Part(text=user_text)
        
    contents = [types.Content(role="user", parts=[part])]
    config = types.GenerateContentConfig(
        temperature=temperature,
        top_p=0.95,
        max_output_tokens=32768,  # Increased for full batch generation
        safety_settings=[
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
        ],
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )
    
    max_retries = 5
    base_delay = 1.0
    
    for attempt in range(max_retries):
        try:
            print(f"[info] Generating batch...")
            text_chunks: List[str] = []
            for chunk in client.models.generate_content_stream(
                model=endpoint, contents=contents, config=config
            ):
                if hasattr(chunk, "text") and chunk.text:
                    text_chunks.append(chunk.text)
            
            # Add delay after successful call to avoid rate limiting
            if delay_after > 0:
                time.sleep(delay_after)
                
            return "".join(text_chunks)
            
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)  # Exponential backoff
                    print(f"[warn] Rate limit hit, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(delay)
                    continue
                else:
                    print(f"[error] Max retries exceeded for rate limiting: {e}")
                    raise
            else:
                print(f"[error] API call failed: {e}")
                raise