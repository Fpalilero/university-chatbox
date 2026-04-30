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
