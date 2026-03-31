import json
import os
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from openai import OpenAI

from models import db, User, Conversation, ConversationMember, Message

load_dotenv()

# -------------------------
# GROQ CLIENT
# -------------------------
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def load_rowan_faq():
    faq_path = os.path.join(os.getcwd(), "rowan_faq.json")
    try:
        with open(faq_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print("rowan_faq.json not found")
        return []
    except json.JSONDecodeError as e:
        print("Invalid JSON:", e)
        return []


def create_app():
    app = Flask(__name__, static_folder=".", static_url_path="")
    CORS(app)

    # -------------------------
    # DATABASE
    # -------------------------
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        database_url = "sqlite:///chatbox.db"

    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.getenv(
        "JWT_SECRET",
        "change-this-to-a-long-random-string-at-least-32-characters"
    )

    print("USING DATABASE:", database_url)

    db.init_app(app)
    JWTManager(app)

    with app.app_context():
        db.create_all()

    ROWAN_FAQ = load_rowan_faq()

    # -------------------------
    # HELPERS
    # -------------------------
    def utcnow():
        return datetime.now(timezone.utc)

    def is_member(user_id, conversation_id):
        return (
            db.session.query(ConversationMember)
            .filter_by(user_id=user_id, conversation_id=conversation_id)
            .first()
            is not None
        )

    def get_or_create_bot_user():
        bot = User.query.filter_by(email="chatbot@rowan.edu").first()
        if not bot:
            bot = User(
                username="RowanBot",
                email="chatbot@rowan.edu",
                password_hash=generate_password_hash("bot-password"),
            )
            db.session.add(bot)
            db.session.commit()
        return bot

    def get_time_greeting():
        hour = datetime.now().hour
        if hour < 12:
            return "Good morning"
        elif hour < 18:
            return "Good afternoon"
        return "Good evening"

    def is_greeting_message(msg):
        msg = msg.lower().strip()
        greetings = [
            "hi", "hello", "hey",
            "good morning", "good afternoon", "good evening",
            "yo", "what's up"
        ]
        return msg in greetings

    def get_greeting_response():
        return (
            f"{get_time_greeting()}! Welcome to Rowan University. "
            "How can I assist you today? "
            "Are you looking for information on admissions, registration, advising, "
            "financial aid, or something else?"
        )

    def get_rowan_faq_answer(user_message):
        msg = user_message.lower().strip()

        if is_greeting_message(msg):
            return get_greeting_response()

        for item in ROWAN_FAQ:
            for keyword in item.get("keywords", []):
                if keyword.lower() in msg:
                    return item.get("answer")

        return None

    def generate_bot_reply(user_message):
        # 1️⃣ FAQ first
        faq = get_rowan_faq_answer(user_message)
        if faq:
            return faq

        # 2️⃣ Groq fallback
        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": """
You are RowanBot, a helpful university chatbot for Rowan University.

Answer only Rowan-university-related questions.
If unsure, recommend contacting the correct Rowan office.

Keep answers short and student-friendly.
""".strip(),
                    },
                    {"role": "user", "content": user_message},
                ],
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            print("Groq error:", e)
            return "I'm having trouble answering right now. Please try again."

    # -------------------------
    # STATIC ROUTES
    # -------------------------
    @app.get("/")
    def home():
        return send_from_directory(os.getcwd(), "index.html")

    @app.get("/chat.html")
    def chat():
        return send_from_directory(os.getcwd(), "chat.html")

    @app.get("/script.js")
    def js():
        return send_from_directory(os.getcwd(), "script.js")

    @app.get("/style.css")
    def css():
        return send_from_directory(os.getcwd(), "style.css")

    @app.get("/favicon.ico")
    def favicon():
        return "", 204

    # -------------------------
    # AUTH
    # -------------------------
    @app.post("/api/register")
    def register():
        data = request.get_json() or {}

        username = data.get("username", "").strip()
        email = data.get("email", "").lower().strip()
        password = data.get("password", "")

        if not username or not email or not password:
            return jsonify({"error": "missing fields"}), 400

        if not email.endswith("@rowan.edu"):
            return jsonify({"error": "must use @rowan.edu email"}), 400

        if User.query.filter(
            (User.username == username) | (User.email == email)
        ).first():
            return jsonify({"error": "user exists"}), 409

        user = User(
            username=username,
            email=email,
            password_hash=generate_password_hash(password)
        )

        db.session.add(user)
        db.session.commit()

        return jsonify({"user_id": user.id}), 201

    @app.post("/api/login")
    def login():
        data = request.get_json() or {}

        user = User.query.filter_by(
            email=data.get("email", "").lower().strip()
        ).first()

        if not user or not check_password_hash(user.password_hash, data.get("password", "")):
            return jsonify({"error": "invalid credentials"}), 401

        token = create_access_token(
            identity=str(user.id),
            expires_delta=timedelta(hours=8)
        )

        return jsonify({
            "access_token": token,
            "user_id": user.id
        })

    # -------------------------
    # CONVERSATIONS
    # -------------------------
    @app.get("/api/conversations")
    @jwt_required()
    def conversations():
        user_id = int(get_jwt_identity())

        rows = (
            db.session.query(Conversation)
            .join(ConversationMember)
            .filter(ConversationMember.user_id == user_id)
            .all()
        )

        return jsonify([
            {"conversation_id": c.id}
            for c in rows
        ])

    @app.post("/api/conversations")
    @jwt_required()
    def create_convo():
        user_id = int(get_jwt_identity())

        convo = Conversation(type="group")
        db.session.add(convo)
        db.session.flush()

        db.session.add(ConversationMember(
            conversation_id=convo.id,
            user_id=user_id,
            role="admin"
        ))

        db.session.commit()

        return jsonify({"conversation_id": convo.id}), 201

    # -------------------------
    # MESSAGES
    # -------------------------
    @app.get("/api/messages")
    @jwt_required()
    def get_messages():
        user_id = int(get_jwt_identity())
        convo_id = request.args.get("conversation_id", type=int)

        if not is_member(user_id, convo_id):
            return jsonify({"error": "not member"}), 403

        msgs = Message.query.filter_by(
            conversation_id=convo_id
        ).order_by(Message.created_at).all()

        return jsonify([
            {
                "sender_user_id": m.sender_user_id,
                "content": m.content
            }
            for m in msgs
        ])

    @app.post("/api/messages")
    @jwt_required()
    def send_message():
        user_id = int(get_jwt_identity())
        data = request.get_json() or {}

        convo_id = int(data.get("conversation_id"))
        content = data.get("content", "").strip()

        msg = Message(
            conversation_id=convo_id,
            sender_user_id=user_id,
            content=content
        )
        db.session.add(msg)
        db.session.commit()

        # bot reply
        bot_reply = generate_bot_reply(content)
        bot = get_or_create_bot_user()

        if not is_member(bot.id, convo_id):
            db.session.add(ConversationMember(
                conversation_id=convo_id,
                user_id=bot.id,
                role="member"
            ))
            db.session.commit()

        bot_msg = Message(
            conversation_id=convo_id,
            sender_user_id=bot.id,
            content=bot_reply
        )
        db.session.add(bot_msg)
        db.session.commit()

        return jsonify({"status": "ok"}), 201

    return app


# 🔥 REQUIRED FOR RENDER
app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)