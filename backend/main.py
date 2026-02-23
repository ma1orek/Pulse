"""Pulse Browser Backend - FastAPI + Gemini Live API with WebSocket bridge."""

import os
import json
import asyncio
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from google import genai
from google.genai import types

app = FastAPI(title="Pulse Browser Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Tool declarations for Gemini Live API ─────────────────────────

BROWSER_TOOLS = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="navigate_to",
            description="Navigate the browser to a URL. Use this when the user asks to open a website.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "url": types.Schema(type="STRING", description="URL to navigate to (e.g. 'google.com' or 'https://youtube.com')")
                },
                required=["url"],
            ),
        ),
        types.FunctionDeclaration(
            name="click_element",
            description="Click on a visible element on the page. Estimate x,y coordinates from the screenshot (768x768 resolution).",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "x": types.Schema(type="INTEGER", description="X coordinate (0-768)"),
                    "y": types.Schema(type="INTEGER", description="Y coordinate (0-768)"),
                    "description": types.Schema(type="STRING", description="What element you are clicking"),
                },
                required=["x", "y"],
            ),
        ),
        types.FunctionDeclaration(
            name="type_text",
            description="Type text into the currently focused input field on the page.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "text": types.Schema(type="STRING", description="Text to type"),
                },
                required=["text"],
            ),
        ),
        types.FunctionDeclaration(
            name="press_enter",
            description="Press the Enter key to submit a form or search query.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
        types.FunctionDeclaration(
            name="scroll_page",
            description="Scroll the page up or down.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "direction": types.Schema(type="STRING", description="'up' or 'down'"),
                    "amount": types.Schema(type="INTEGER", description="Pixels to scroll (default 500)"),
                },
                required=["direction"],
            ),
        ),
        types.FunctionDeclaration(
            name="go_back",
            description="Navigate back to the previous page.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
        types.FunctionDeclaration(
            name="extract_page_text",
            description="Extract readable text content from the current page.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
        types.FunctionDeclaration(
            name="open_new_tab",
            description="Open a new browser tab, optionally with a URL.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "url": types.Schema(type="STRING", description="Optional URL for the new tab"),
                },
            ),
        ),
        types.FunctionDeclaration(
            name="close_current_tab",
            description="Close the currently active browser tab.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
        types.FunctionDeclaration(
            name="search_web",
            description="Search the web for a query using Google.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "query": types.Schema(type="STRING", description="Search query"),
                },
                required=["query"],
            ),
        ),
    ])
]

SYSTEM_INSTRUCTION = """You are Pulse, an AI-native browser agent that interprets the internet visually in real-time.

You can SEE the current webpage through screenshots streamed to you continuously.
You can HEAR the user through their microphone.
You can SPEAK back naturally.
You can ACT on pages using the tools provided.

Guidelines:
- When asked to go somewhere, use navigate_to with the URL
- When asked to click, look at the screenshot, estimate x,y coordinates (768x768 grid), use click_element
- When asked about page content, describe what you SEE in the screenshot
- Confirm actions: "Done, I've opened YouTube for you"
- Be conversational and natural. You are Pulse, a new kind of browser.
- Always respond with voice - the user expects voice interaction.
- If something fails, explain what happened and suggest alternatives."""


def _map_tool_to_action(name: str, args: dict) -> dict | None:
    """Map Gemini tool calls to Electron browser actions."""
    if name == "navigate_to":
        url = args.get("url", "")
        if url and not url.startswith("http"):
            url = f"https://{url}"
        return {"action": "navigate", "url": url}
    elif name == "click_element":
        return {"action": "click", "x": args.get("x", 0), "y": args.get("y", 0)}
    elif name == "type_text":
        return {"action": "type", "text": args.get("text", "")}
    elif name == "press_enter":
        return {"action": "enter"}
    elif name == "scroll_page":
        return {"action": "scroll", "direction": args.get("direction", "down"), "amount": args.get("amount", 500)}
    elif name == "go_back":
        return {"action": "back"}
    elif name == "extract_page_text":
        return {"action": "extract-text"}
    elif name == "open_new_tab":
        return {"action": "new_tab", "url": args.get("url", "")}
    elif name == "close_current_tab":
        return {"action": "close_tab"}
    elif name == "search_web":
        query = args.get("query", "")
        return {"action": "navigate", "url": f"https://www.google.com/search?q={query.replace(' ', '+')}"}
    return None


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "pulse-backend"}


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, session_id: str):
    """WebSocket bridge between Electron and Gemini Live API.

    Binary protocol (from Electron):
      0x01 + bytes = Audio PCM 16kHz mono
      0x02 + bytes = Screenshot JPEG 768x768

    JSON protocol (from Electron):
      {"type": "text_command", "text": "..."} = Text command
      {"type": "action_result", ...} = Browser action result
    """
    await websocket.accept()
    result_queue: asyncio.Queue = asyncio.Queue()

    # Initialize Gemini client
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true"

    if use_vertex:
        client = genai.Client(vertexai=True)
    elif api_key:
        client = genai.Client(api_key=api_key)
    else:
        await websocket.send_json({
            "type": "error",
            "message": "No API key. Set GOOGLE_API_KEY in backend/.env"
        })
        await websocket.close()
        return

    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
            )
        ),
        system_instruction=types.Content(parts=[types.Part(text=SYSTEM_INSTRUCTION)]),
        tools=BROWSER_TOOLS,
    )

    try:
        async with client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=config,
        ) as session:

            await websocket.send_json({"type": "status", "state": "idle"})
            await websocket.send_json({
                "type": "transcript",
                "text": "Pulse is ready. Click the orb or type a command.",
            })

            async def receive_from_client():
                """Forward Electron data (audio/screenshots/text) to Gemini."""
                try:
                    while True:
                        msg = await websocket.receive()

                        if "bytes" in msg:
                            data = msg["bytes"]
                            if len(data) < 2:
                                continue
                            header = data[0]
                            payload = data[1:]

                            if header == 0x01:  # Audio PCM
                                await session.send_realtime_input(
                                    audio=types.Blob(
                                        mime_type="audio/pcm;rate=16000",
                                        data=payload,
                                    )
                                )
                            elif header == 0x02:  # Screenshot JPEG
                                await session.send_realtime_input(
                                    video=types.Blob(
                                        mime_type="image/jpeg",
                                        data=payload,
                                    )
                                )

                        elif "text" in msg:
                            data = json.loads(msg["text"])

                            if data.get("type") == "text_command":
                                await websocket.send_json({"type": "status", "state": "thinking"})
                                await session.send_client_content(
                                    turns=types.Content(
                                        role="user",
                                        parts=[types.Part(text=data["text"])],
                                    )
                                )
                            elif data.get("type") == "action_result":
                                await result_queue.put(data)

                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    print(f"[upstream] {e}")

            async def send_to_client():
                """Forward Gemini responses (audio/text/tool calls) to Electron."""
                try:
                    async for response in session.receive():
                        if response.server_content:
                            sc = response.server_content
                            if sc.model_turn:
                                for part in sc.model_turn.parts:
                                    if part.text:
                                        await websocket.send_json({
                                            "type": "transcript",
                                            "text": part.text,
                                        })
                                    if part.inline_data:
                                        # Audio response bytes
                                        await websocket.send_bytes(part.inline_data.data)
                                        await websocket.send_json({
                                            "type": "status", "state": "speaking",
                                        })
                            if sc.turn_complete:
                                await websocket.send_json({
                                    "type": "status", "state": "idle",
                                })

                        if response.tool_call:
                            for fc in response.tool_call.function_calls:
                                tool_args = dict(fc.args) if fc.args else {}
                                await websocket.send_json({
                                    "type": "transcript",
                                    "text": f"Action: {fc.name}({json.dumps(tool_args)})",
                                })

                                action = _map_tool_to_action(fc.name, tool_args)
                                if action:
                                    await websocket.send_json({"type": "action", **action})

                                    try:
                                        result = await asyncio.wait_for(
                                            result_queue.get(), timeout=15.0,
                                        )
                                    except asyncio.TimeoutError:
                                        result = {"status": "ok", "message": "Action completed"}

                                    await session.send_tool_response(
                                        function_responses=[
                                            types.FunctionResponse(
                                                name=fc.name,
                                                response=result,
                                            )
                                        ]
                                    )
                                else:
                                    await session.send_tool_response(
                                        function_responses=[
                                            types.FunctionResponse(
                                                name=fc.name,
                                                response={"error": f"Unknown: {fc.name}"},
                                            )
                                        ]
                                    )

                except Exception as e:
                    print(f"[downstream] {e}")

            await asyncio.gather(
                receive_from_client(),
                send_to_client(),
                return_exceptions=True,
            )

    except Exception as e:
        print(f"[session] {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
