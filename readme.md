# University Chatbox (Personal Build)
This project is a full-stack AI-powered chatbot designed to assist Rowan University students with academic and administrative questions.
It was built as part of a Software Engineering course, with additional personal improvements including UI enhancements, authentication fixes, and AI response optimization. The chatbot integrates real-time messaging, authentication, and an AI assistant that stays focused on Rowan University topics.

## Features
- 🔐 Secure authentication using JWT
- 🎓 Rowan-only access (@rowan.edu emails required)
- 💬 Real-time chat interface with message history
- 🤖 AI-powered responses using Groq API
- 📚 FAQ-based fallback system for common student questions
- 🔁 Conversation persistence using PostgreSQL
- ⏳ Typing indicator ("Rowan is typing...")
- 🌙 Dark mode UI with responsive design
- 🔑 Forgot password + reset token system

## Tech Stack
Frontend:
- HTML, CSS, JavaScript

Backend:
- Python (Flask)
- Flask-JWT-Extended (authentication)
- Flask-SQLAlchemy (database ORM)

Database:
- PostgreSQL (production)
- SQLite (development fallback)

AI Integration:
- Groq API (LLaMA model)

Deployment:
- Render (initial)
- AWS (planned migration)

## My Contributions
- Designed and implemented backend API using Flask
- Integrated Groq AI for dynamic chatbot responses
- Built an authentication system with JWT (login/register)
- Implemented password reset flow with token system
- Developed chat UI with typing indicator and animations
- Handled database migration from SQLite to PostgreSQL
- Fixed UI/UX issues (input visibility, mobile responsiveness)
- Improved chatbot to stay focused on Rowan University topics only

## 🏗️ Architecture

The application follows a client-server architecture:

Frontend (SPA)
- index.html → Login & Registration
- chat.html → Chat Interface
- script.js → Client-side logic
- style.css → UI styling

Backend (Flask API)
- app.py → Routes & business logic
- models.py → Database schema

Services
- PostgreSQL → Persistent storage
- Groq API → AI-powered responses

🚀 Setup Instructions
Prerequisites
Python 3.8 or higher
pip (Python package manager)
PostgreSQL (for production) or SQLite (for development - included with Python)
Groq API key (Get one here)
Installation
Clone the repository

git clone https://github.com/joshuarossell/group1-soft-eng-spring26.git
cd group1-soft-eng-spring26
Create a virtual environment (recommended)

python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate
Install dependencies

pip install -r requirements.txt
Create a .env file in the project root

# Required
GROQ_API_KEY=your_groq_api_key_here

# Optional (defaults provided)
DATABASE_URL=sqlite:///chatbox.db
JWT_SECRET=your-secret-key-change-in-production
Initialize the database The database will be automatically created when you first run the application.

🔐 Environment Variables
Variable	Required	Default	Description
GROQ_API_KEY	Yes	None	Your Groq API key for AI responses
DATABASE_URL	No	sqlite:///chatbox.db	Database connection string
JWT_SECRET	No	dev-secret-change-me	Secret key for JWT tokens (change in production!)
Getting a Groq API Key
Visit Groq Console
Sign up or log in
Navigate to API Keys section
Create a new API key
Copy and paste into your .env file
💻 Running Locally
Development Mode
python app.py
The application will start on http://localhost:5001

Production Mode (with Gunicorn)
gunicorn 'app:create_app()'

🌐 Deployment
The application is designed to be deployed on platforms like Render, Heroku, or any platform supporting Python web apps.

Deploying to Render
Push your code to GitHub

Create a new Web Service on Render

Configure the service:

Build Command: pip install -r requirements.txt
Start Command: gunicorn 'app:create_app()'
Environment Variables: Add GROQ_API_KEY, DATABASE_URL, and JWT_SECRET
Add a PostgreSQL database (optional but recommended for production)

Render will provide a DATABASE_URL environment variable
Deploy! Render will automatically build and deploy your application

📚 API Documentation
Authentication Endpoints
Register User
POST /api/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@rowan.edu",
  "password": "securepassword123"
}
Response: 201 Created

{
  "message": "registered",
  "user_id": 1
}
Login
POST /api/login
Content-Type: application/json

{
  "email": "john@rowan.edu",
  "password": "securepassword123"
}
Response: 200 OK

{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user_id": 1,
  "username": "john_doe"
}
Conversation Endpoints
Get User's Conversations
GET /api/conversations
Authorization: Bearer {token}
Response: 200 OK

[
  {
    "conversation_id": 1,
    "type": "group",
    "name": "General",
    "created_at": "2026-04-02T10:30:00+00:00"
  }
]
Create Conversation
POST /api/conversations
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "group",
  "name": "Study Group",
  "member_ids": [2, 3]
}
Response: 201 Created

{
  "conversation_id": 2,
  "type": "group",
  "name": "Study Group"
}
Message Endpoints
Get Messages
GET /api/messages?conversation_id=1
Authorization: Bearer {token}
Response: 200 OK

[
  {
    "message_id": 1,
    "conversation_id": 1,
    "sender_user_id": 1,
    "content": "What are the registration dates?",
    "created_at": "2026-04-02T10:35:00+00:00",
    "edited_at": null,
    "deleted": false
  }
]
Send Message
POST /api/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "conversation_id": 1,
  "content": "What are the registration dates?"
}
Response: 201 Created

{
  "message_id": 1,
  "created_at": "2026-04-02T10:35:00+00:00",
  "bot_message": {
    "message_id": 2,
    "sender_user_id": 0,
    "content": "Rowan course registration is completed online...",
    "created_at": "2026-04-02T10:35:01+00:00"
  }
}
Edit Message
PUT /api/messages/{message_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "content": "Updated message content"
}
Response: 200 OK

Note: Can only edit within 5 minutes of sending, and only your own messages.

Delete Message
DELETE /api/messages/{message_id}
Authorization: Bearer {token}
Response: 200 OK

Note: Can only delete within 5 minutes of sending, and only your own messages.

📁 Project Structure
group1-soft-eng-spring26/
│
├── app.py                 # Main Flask application with all API routes
├── models.py              # SQLAlchemy database models
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables (not in git)
│
├── index.html             # Login/Registration page
├── chat.html              # Main chat interface
├── script.js              # Frontend JavaScript logic
├── style.css              # Application styling
│
├── rowan_faq.json         # Rowan University FAQ data (future use)
└── readme.md              # This file
🔍 How It Works
1. User Authentication Flow
┌─────────────┐
│ User visits │
│ index.html  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐      ┌──────────────┐
│ Enters @rowan   │─────▶│ POST /api/   │
│ email & password│      │ login        │
└─────────────────┘      └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │ JWT token    │
                         │ stored in    │
                         │ localStorage │
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │ Redirect to  │
                         │ chat.html    │
                         └──────────────┘
2. Chat Conversation Flow
┌──────────────┐
│ User loads   │
│ chat.html    │
└──────┬───────┘
       │
       ▼
┌─────────────────────┐
│ GET /api/          │
│ conversations      │ ← Creates one if none exist
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ GET /api/messages  │
│ Load history       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ User types message │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ POST /api/messages │
└──────┬──────────────┘
       │
       ▼
┌──────────────────────────┐
│ Backend:                 │
│ 1. Save user message     │
│ 2. Get last 10 messages  │
│ 3. Call Groq API         │
│ 4. Save bot response     │
│ 5. Return both to client │
└──────┬───────────────────┘
       │
       ▼
┌─────────────────────┐
│ Display messages   │
│ with animations    │
└────────────────────┘
3. AI Response Generation
When a user sends a message:

Context Gathering: The system retrieves the last 10 messages from the conversation
Prompt Building: Constructs a prompt with:
System message defining RowanBot's role
Conversation history
Current user message
AI Inference: Sends to Groq API (LLaMA 3.1 model)
Response Storage: Saves the AI response as a message from "RowanBot"
Return to User: Both user and bot messages are returned to the frontend
4. Database Schema
users
├── id (PK)
├── username (unique)
├── email (unique, @rowan.edu)
├── password_hash
└── created_at

conversations
├── id (PK)
├── type (direct/group)
├── name
└── created_at

conversation_members
├── conversation_id (PK, FK)
├── user_id (PK, FK)
├── role (admin/member)
└── joined_at

messages
├── id (PK)
├── conversation_id (FK)
├── sender_user_id (FK)
├── content
├── created_at
├── edited_at
└── deleted_at

