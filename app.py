import os
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity
)
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from groq import Groq

from models import db, User, Conversation, ConversationMember, Message

load_dotenv()


def create_app():
    app = Flask(__name__)
    CORS(app)

    database_url = os.getenv("DATABASE_URL", "sqlite:///chatbox.db")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET", "dev-secret-change-me")

    db.init_app(app)
    JWTManager(app)

    with app.app_context():
        db.create_all()

    groq_api_key = os.getenv("GROQ_API_KEY")
    groq_client = Groq(api_key=groq_api_key) if groq_api_key else None

    # -------------------------
    # Static files
    # -------------------------
    @app.get("/")
    def serve_home():
        return send_from_directory(os.getcwd(), "index.html")

    @app.get("/index.html")
    def serve_index():
        return send_from_directory(os.getcwd(), "index.html")

    @app.get("/chat.html")
    def serve_chat():
        return send_from_directory(os.getcwd(), "chat.html")

    @app.get("/style.css")
    def serve_css():
        return send_from_directory(os.getcwd(), "style.css")

    @app.get("/script.js")
    def serve_js():
        return send_from_directory(os.getcwd(), "script.js")

    @app.get("/favicon.ico")
    def favicon():
        return "", 204

    # -------------------------
    # Helpers
    # -------------------------
    def utcnow():
        return datetime.now(timezone.utc)

    def is_member(user_id: int, conversation_id: int) -> bool:
        return (
            db.session.query(ConversationMember)
            .filter_by(user_id=user_id, conversation_id=conversation_id)
            .first()
            is not None
        )

    def get_or_create_rowan_bot():
        bot = User.query.filter_by(email="rowanbot@rowan.edu").first()
        if bot:
            return bot

        bot = User(
            username="RowanBot",
            email="rowanbot@rowan.edu",
            password_hash=generate_password_hash("rowan-bot-internal")
        )
        db.session.add(bot)
        db.session.commit()
        return bot

    def get_conversation_history(conversation_id: int, bot_user_id: int, limit: int = 12):
        messages = (
            Message.query
            .filter_by(conversation_id=conversation_id)
            .order_by(Message.created_at.asc())
            .all()
        )

        history = []
        for m in messages[-limit:]:
            if m.deleted_at or not m.content:
                continue

            role = "assistant" if m.sender_user_id == bot_user_id else "user"
            history.append({
                "role": role,
                "content": m.content
            })

        return history

    def generate_rowan_reply(user_message: str, conversation_id: int) -> str:
        if not groq_client:
            return "Groq is not connected yet. Please add your GROQ_API_KEY in Render environment variables."

        bot_user = get_or_create_rowan_bot()
        history = get_conversation_history(conversation_id, bot_user.id, limit=10)

        system_prompt = (
            "You are Rowan, a helpful chatbot for Rowan University students. "
            "Be friendly, clear, and concise. "
            "If you are unsure about a Rowan-specific fact, say you are not sure instead of inventing details. "
            "Keep answers practical and easy to understand."
        )

        try:
            completion = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system_prompt},
                    *history,
                    {"role": "user", "content": user_message}
                ],
                temperature=0.7,
                max_completion_tokens=300
            )

            reply = completion.choices[0].message.content
            return (reply or "").strip() or "I’m here to help."
        except Exception as e:
            print("GROQ ERROR:", str(e))
            return "Sorry, I had trouble generating a response right now."

    # -------------------------
    # Auth
    # -------------------------
    @app.post("/api/register")
    def register():
        try:
            data = request.get_json(silent=True) or {}
            username = (data.get("username") or "").strip()
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""

            if not username or not email or not password:
                return jsonify({"error": "username, email, and password are required"}), 400

            if not email.endswith("@rowan.edu"):
                return jsonify({"error": "registration requires a @rowan.edu email"}), 400

            existing = User.query.filter(
                (User.username == username) | (User.email == email)
            ).first()

            if existing:
                return jsonify({"error": "username or email already exists"}), 409

            user = User(
                username=username,
                email=email,
                password_hash=generate_password_hash(password),
            )
            db.session.add(user)
            db.session.commit()

            return jsonify({"message": "registered", "user_id": user.id}), 201

        except Exception as e:
            db.session.rollback()
            print("REGISTER ERROR:", str(e))
            return jsonify({"error": "register_failed", "details": str(e)}), 500

    @app.post("/api/login")
    def login():
        try:
            data = request.get_json(silent=True) or {}
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""

            user = User.query.filter_by(email=email).first()
            if not user or not check_password_hash(user.password_hash, password):
                return jsonify({"error": "invalid credentials"}), 401

            token = create_access_token(identity=str(user.id), expires_delta=timedelta(hours=8))
            return jsonify({
                "access_token": token,
                "user_id": user.id,
                "username": user.username
            })

        except Exception as e:
            print("LOGIN ERROR:", str(e))
            return jsonify({"error": "login_failed", "details": str(e)}), 500

    # -------------------------
    # Conversations
    # -------------------------
    @app.get("/api/conversations")
    @jwt_required()
    def my_conversations():
        try:
            user_id = int(get_jwt_identity())

            rows = (
                db.session.query(Conversation)
                .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
                .filter(ConversationMember.user_id == user_id)
                .order_by(Conversation.created_at.desc())
                .all()
            )

            return jsonify([{
                "conversation_id": c.id,
                "type": c.type,
                "name": c.name,
                "created_at": c.created_at.isoformat()
            } for c in rows])

        except Exception as e:
            print("GET CONVERSATIONS ERROR:", str(e))
            return jsonify({"error": "get_conversations_failed", "details": str(e)}), 500

    @app.post("/api/conversations")
    @jwt_required()
    def create_conversation():
        try:
            user_id = int(get_jwt_identity())
            data = request.get_json(silent=True) or {}

            ctype = data.get("type")
            name = data.get("name")
            member_ids = data.get("member_ids") or []

            if ctype not in ("direct", "group"):
                return jsonify({"error": "type must be 'direct' or 'group'"}), 400

            all_members = set([user_id] + [int(x) for x in member_ids])

            convo = Conversation(type=ctype, name=name if ctype == "group" else None)
            db.session.add(convo)
            db.session.flush()

            for uid in all_members:
                db.session.add(ConversationMember(
                    conversation_id=convo.id,
                    user_id=uid,
                    role="admin" if uid == user_id else "member"
                ))

            db.session.commit()

            return jsonify({
                "conversation_id": convo.id,
                "type": convo.type,
                "name": convo.name
            }), 201

        except Exception as e:
            db.session.rollback()
            print("CREATE CONVERSATION ERROR:", str(e))
            return jsonify({"error": "create_conversation_failed", "details": str(e)}), 500

    # -------------------------
    # Messages
    # -------------------------
    @app.get("/api/messages")
    @jwt_required()
    def get_messages():
        try:
            user_id = int(get_jwt_identity())
            conversation_id = request.args.get("conversation_id", type=int)

            if not conversation_id:
                return jsonify({"error": "conversation_id is required"}), 400

            if not is_member(user_id, conversation_id):
                return jsonify({"error": "not a member of this conversation"}), 403

            msgs = (
                Message.query
                .filter_by(conversation_id=conversation_id)
                .order_by(Message.created_at.asc())
                .all()
            )

            return jsonify([{
                "message_id": m.id,
                "conversation_id": m.conversation_id,
                "sender_user_id": m.sender_user_id,
                "content": None if m.deleted_at else m.content,
                "created_at": m.created_at.isoformat(),
                "edited_at": m.edited_at.isoformat() if m.edited_at else None,
                "deleted": bool(m.deleted_at),
            } for m in msgs])

        except Exception as e:
            print("GET MESSAGES ERROR:", str(e))
            return jsonify({"error": "get_messages_failed", "details": str(e)}), 500

    @app.post("/api/messages")
    @jwt_required()
    def send_message():
        try:
            user_id = int(get_jwt_identity())
            data = request.get_json(silent=True) or {}

            conversation_id = data.get("conversation_id")
            content = (data.get("content") or "").strip()

            if not conversation_id or not content:
                return jsonify({"error": "conversation_id and content are required"}), 400

            conversation_id = int(conversation_id)

            if not is_member(user_id, conversation_id):
                return jsonify({"error": "not a member of this conversation"}), 403

            # Save user message
            user_msg = Message(
                conversation_id=conversation_id,
                sender_user_id=user_id,
                content=content,
            )
            db.session.add(user_msg)
            db.session.commit()

            # Make sure bot exists
            bot_user = get_or_create_rowan_bot()

            # Generate AI reply
            ai_reply = generate_rowan_reply(content, conversation_id)

            # Save bot message
            bot_msg = Message(
                conversation_id=conversation_id,
                sender_user_id=bot_user.id,
                content=ai_reply,
            )
            db.session.add(bot_msg)
            db.session.commit()

            return jsonify({
                "message_id": user_msg.id,
                "created_at": user_msg.created_at.isoformat(),
                "bot_message": {
                    "message_id": bot_msg.id,
                    "sender_user_id": bot_msg.sender_user_id,
                    "content": bot_msg.content,
                    "created_at": bot_msg.created_at.isoformat()
                }
            }), 201

        except Exception as e:
            db.session.rollback()
            print("SEND MESSAGE ERROR:", str(e))
            return jsonify({
                "error": "send_message_failed",
                "details": str(e)
            }), 500

    @app.put("/api/messages/<int:message_id>")
    @jwt_required()
    def edit_message(message_id: int):
        try:
            user_id = int(get_jwt_identity())
            data = request.get_json(silent=True) or {}
            new_content = (data.get("content") or "").strip()

            if not new_content:
                return jsonify({"error": "content is required"}), 400

            msg = Message.query.get_or_404(message_id)

            if msg.sender_user_id != user_id:
                return jsonify({"error": "only sender can edit"}), 403

            if msg.deleted_at:
                return jsonify({"error": "cannot edit deleted message"}), 400

            created = msg.created_at.replace(tzinfo=timezone.utc) if msg.created_at.tzinfo is None else msg.created_at
            if utcnow() > created + timedelta(minutes=5):
                return jsonify({"error": "edit window expired (5 minutes)"}), 403

            msg.content = new_content
            msg.edited_at = datetime.utcnow()
            db.session.commit()
            return jsonify({"message": "edited"})

        except Exception as e:
            db.session.rollback()
            print("EDIT MESSAGE ERROR:", str(e))
            return jsonify({"error": "edit_message_failed", "details": str(e)}), 500

    @app.delete("/api/messages/<int:message_id>")
    @jwt_required()
    def delete_message(message_id: int):
        try:
            user_id = int(get_jwt_identity())
            msg = Message.query.get_or_404(message_id)

            if msg.sender_user_id != user_id:
                return jsonify({"error": "only sender can delete"}), 403

            if msg.deleted_at:
                return jsonify({"message": "already deleted"}), 200

            created = msg.created_at.replace(tzinfo=timezone.utc) if msg.created_at.tzinfo is None else msg.created_at
            if utcnow() > created + timedelta(minutes=5):
                return jsonify({"error": "delete window expired (5 minutes)"}), 403

            msg.deleted_at = datetime.utcnow()
            db.session.commit()
            return jsonify({"message": "deleted"})

        except Exception as e:
            db.session.rollback()
            print("DELETE MESSAGE ERROR:", str(e))
            return jsonify({"error": "delete_message_failed", "details": str(e)}), 500

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, host="0.0.0.0", port=5001)