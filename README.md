# Pulse Browser

**AI-native browser that interprets the internet visually in real-time.**

Pulse is a desktop browser powered by Google Gemini that replaces the traditional address bar with voice-first, vision-powered interaction. Instead of typing URLs and clicking links, you *talk* to Pulse and it navigates, clicks, scrolls, types, and surfs the web for you.

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon.

**Category:** UI Navigator

---

## How It Works

```
You speak → Pulse hears you (Gemini Live API)
Pulse sees the page → Screenshots streamed to Gemini Vision
Gemini decides what to do → Sends actions back to the browser
Pulse acts → Navigates, clicks, scrolls, types
Pulse remembers → Every page visit stored in Firestore
```

## Architecture

```
┌─────────────────────────┐          ┌──────────────────────────┐
│   ELECTRON DESKTOP APP  │   WSS    │   GOOGLE CLOUD (Run)     │
│                         │◄────────►│                          │
│  React UI:              │          │  FastAPI + Gemini Agent   │
│  - Voice Orb            │ Audio →  │  - Gemini Live API       │
│  - Tab Bar              │ Screen → │    (bidi-streaming)      │
│  - Agent Panel          │ ← Actions│  - Browser tools         │
│                         │ ← Audio  │                          │
│  Electron Main:         │          │  Google Cloud Services:  │
│  - WebContentsView      │          │  - Firestore (memory)    │
│  - Screenshot capture   │          │  - Cloud Storage         │
│  - Action execution     │          │                          │
└─────────────────────────┘          └──────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop App | Electron 40 + React 19 + TypeScript + Tailwind CSS |
| AI Model | Gemini 2.0 Flash (Live API - bidi-streaming) |
| Agent Framework | Google GenAI SDK |
| Backend | Python + FastAPI on Cloud Run |
| Session Memory | Cloud Firestore |
| Screenshot Storage | Cloud Storage |
| Infrastructure | Terraform |

## Setup

### Prerequisites
- Node.js 20+
- Python 3.12+
- Google Cloud account with Gemini API access
- A Gemini API key ([Get one here](https://aistudio.google.com/apikey))

### 1. Clone the repository
```bash
git clone https://github.com/ma1orek/Pulse.git
cd Pulse
```

### 2. Start the backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY

python main.py
```

### 3. Start the Electron app
```bash
cd electron
npm install
npm start
```

### 4. Use Pulse
1. Click the **Voice Orb** at the bottom of the screen
2. Say: *"Open YouTube"*
3. Pulse navigates to YouTube and confirms with voice
4. Say: *"What do I see on this page?"*
5. Pulse describes the page content

Or use the text input (keyboard icon) to type commands.

## Cloud Deployment

### Quick deploy (Cloud Run)
```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

### Infrastructure as Code (Terraform)
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project ID

terraform init
terraform plan
terraform apply
```

## Key Features

- **Voice-first navigation** - No address bar. Talk to browse.
- **Visual page comprehension** - Pulse sees screenshots and understands page layout
- **Stateful memory** - Firestore stores every page visit. Ask "what was on that page I closed?" and Pulse remembers.
- **Tab management** - Open, close, switch tabs by voice
- **Surf via Proxy** - "Research the top 3 JS frameworks" - Pulse browses autonomously

## Google Cloud Services Used

- **Cloud Run** - Backend hosting with WebSocket support
- **Firestore** - Session history and page memory (stateful browsing)
- **Cloud Storage** - Screenshot archive
- **Vertex AI** - Gemini model access (production)
- **Artifact Registry** - Container image storage
- **Cloud Build** - CI/CD pipeline

## License

Apache 2.0
