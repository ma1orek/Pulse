"""Pulse Browser Backend - FastAPI + ADK Agent with WebSocket bridge."""

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

from pulse_agent.tools.browser_tools import action_queues, result_queues
from pulse_agent.tools.memory_tools import save_page_visit

app = FastAPI(title="Pulse Browser Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "pulse-backend"}


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, session_id: str):
    """WebSocket endpoint for Electron client communication.

    Handles:
    - Text commands from user
    - Audio PCM data (binary, first byte = 0x01)
    - Screenshot JPEG data (binary, first byte = 0x02)

    Sends back:
    - Action commands (navigate, click, scroll, type)
    - Agent transcripts
    - Status updates
    - Audio responses
    """
    await websocket.accept()

    # Set up action queues for this session
    action_queues[session_id] = asyncio.Queue()
    result_queues[session_id] = asyncio.Queue()

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
            "message": "No API key configured. Set GOOGLE_API_KEY or GEMINI_API_KEY."
        })
        await websocket.close()
        return

    # Create Live API session config
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
            )
        ),
        system_instruction=types.Content(parts=[types.Part(text="""You are Pulse, an AI-native browser agent.
You can see web pages through screenshots streamed to you. You help users navigate the internet by voice.
When asked to navigate, click, type, or interact with pages, describe what you're doing and confirm when done.
Be natural, conversational, and helpful. You are a browser companion, not a robot.
When you see a screenshot, you can describe what's on the page.
Respond verbally - the user expects voice interaction.""")]),
    )

    try:
        async with client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=config,
        ) as session:
            # Send welcome message
            await websocket.send_json({
                "type": "status",
                "state": "idle",
            })
            await websocket.send_json({
                "type": "transcript",
                "text": "Pulse is ready. Click the orb or type a command.",
            })

            async def receive_from_client():
                """Receive data from Electron client."""
                while True:
                    try:
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
                            text_data = json.loads(msg["text"])
                            if text_data.get("type") == "text_command":
                                user_text = text_data["text"]
                                await websocket.send_json({
                                    "type": "status",
                                    "state": "thinking",
                                })
                                await session.send_client_content(
                                    turns=types.Content(
                                        role="user",
                                        parts=[types.Part(text=user_text)],
                                    )
                                )
                            elif text_data.get("type") == "action_result":
                                # Result from browser action
                                await result_queues[session_id].put(text_data)

                    except WebSocketDisconnect:
                        break
                    except Exception as e:
                        print(f"Error receiving from client: {e}")
                        break

            async def send_to_client():
                """Receive responses from Gemini and forward to client."""
                while True:
                    try:
                        async for response in session.receive():
                            # Handle server content (text/audio)
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
                                            # Audio response
                                            await websocket.send_bytes(part.inline_data.data)

                                if sc.turn_complete:
                                    await websocket.send_json({
                                        "type": "status",
                                        "state": "idle",
                                    })

                            # Handle tool calls
                            if response.tool_call:
                                for fc in response.tool_call.function_calls:
                                    await websocket.send_json({
                                        "type": "transcript",
                                        "text": f"Executing: {fc.name}({json.dumps(fc.args)})",
                                    })

                                    # Send action to Electron
                                    action = _map_tool_to_action(fc.name, fc.args)
                                    if action:
                                        await websocket.send_json({
                                            "type": "action",
                                            **action,
                                        })

                                        # Wait for result from Electron
                                        try:
                                            result = await asyncio.wait_for(
                                                result_queues[session_id].get(),
                                                timeout=15.0,
                                            )
                                        except asyncio.TimeoutError:
                                            result = {"status": "timeout"}

                                        # Send tool response back to Gemini
                                        await session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=fc.name,
                                                    response=result,
                                                )
                                            ]
                                        )

                    except Exception as e:
                        print(f"Error in send_to_client: {e}")
                        break

            async def process_action_queue():
                """Forward queued actions from tools to the client."""
                while True:
                    try:
                        action = await action_queues[session_id].get()
                        await websocket.send_json({"type": "action", **action})
                    except Exception:
                        break

            # Run all tasks concurrently
            await asyncio.gather(
                receive_from_client(),
                send_to_client(),
                process_action_queue(),
                return_exceptions=True,
            )

    except Exception as e:
        print(f"Session error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Cleanup
        action_queues.pop(session_id, None)
        result_queues.pop(session_id, None)
        try:
            await websocket.close()
        except Exception:
            pass


def _map_tool_to_action(name: str, args: dict) -> dict | None:
    """Map ADK tool calls to Electron action commands."""
    mapping = {
        "navigate_to": lambda a: {"action": "navigate", "url": a.get("url", "")},
        "click_element": lambda a: {"action": "click", "x": a.get("x", 0), "y": a.get("y", 0)},
        "scroll_page": lambda a: {"action": "scroll", "direction": a.get("direction", "down"), "amount": a.get("amount", 500)},
        "type_text": lambda a: {"action": "type", "text": a.get("text", "")},
        "press_enter": lambda a: {"action": "enter"},
        "go_back": lambda a: {"action": "back"},
        "extract_page_text": lambda a: {"action": "extract-text"},
        "open_new_tab": lambda a: {"action": "new_tab", "url": a.get("url", "")},
        "close_current_tab": lambda a: {"action": "close_tab"},
        "switch_to_tab": lambda a: {"action": "switch_tab", "tab_id": a.get("tab_id", 0)},
        "search_web": lambda a: {"action": "navigate", "url": f"https://www.google.com/search?q={a.get('query', '').replace(' ', '+')}"},
    }

    if name in mapping:
        return mapping[name](args)
    return None


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
