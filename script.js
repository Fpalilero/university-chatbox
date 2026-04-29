const API_BASE = "";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatError = document.getElementById("chatError");
const logoutBtn = document.getElementById("logoutBtn");
const welcomeMessage = document.getElementById("welcomeMessage");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const imagePreviewWrapper = document.getElementById("imagePreviewWrapper");
const clearImageBtn = document.getElementById("clearImage");
const themeToggleBtn = document.getElementById("themeToggleBtn");

let pendingImageBase64 = null;
let pendingImageMediaType = null;

const token = localStorage.getItem("access_token");
const userId = localStorage.getItem("user_id");

function getSavedUsername() {
  const raw = localStorage.getItem("username");

  if (!raw) return "Student";

  const cleaned = raw.trim();
  if (
    cleaned === "" ||
    cleaned.toLowerCase() === "undefined" ||
    cleaned.toLowerCase() === "null"
  ) {
    return "Student";
  }

  return cleaned;
}

const username = getSavedUsername();
let conversationId = null;

if (!token) {
  window.location.href = "/";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

function setGreeting() {
  if (!welcomeMessage) return;

  const hour = new Date().getHours();
  let greeting = "Hello";

  if (hour < 12) greeting = "Good morning";
  else if (hour < 18) greeting = "Good afternoon";
  else greeting = "Good evening";

  welcomeMessage.textContent =
    `${greeting}! Welcome to Rowan University. How can I assist you today?`;
}

function applyTheme(theme) {
  const finalTheme = theme === "dark" ? "dark" : "light";

  if (finalTheme === "dark") {
    document.body.classList.add("dark-mode");
    if (themeToggleBtn) themeToggleBtn.textContent = "Light Mode";
  } else {
    document.body.classList.remove("dark-mode");
    if (themeToggleBtn) themeToggleBtn.textContent = "Dark Mode";
  }

  localStorage.setItem("theme", finalTheme);
}

async function loadThemeFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/api/me/theme`, {
      method: "GET",
      headers: authHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Could not load theme.");
    }

    applyTheme(data.theme || "light");
  } catch (error) {
    applyTheme(localStorage.getItem("theme") || "light");
  }
}

async function saveThemeToBackend(theme) {
  try {
    const res = await fetch(`${API_BASE}/api/me/theme`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ theme })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Could not save theme.");
    }

    applyTheme(data.theme || theme);
  } catch (error) {
    applyTheme(theme);
  }
}

function toggleTheme() {
  const isDark = document.body.classList.contains("dark-mode");
  const newTheme = isDark ? "light" : "dark";
  saveThemeToBackend(newTheme);
}

function scrollToBottom(smooth = true) {
  chatMessages.scrollTo({
    top: chatMessages.scrollHeight,
    behavior: smooth ? "smooth" : "auto"
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(text) {
  if (!text) return "";

  let safe = escapeHtml(text);

  // bold: **text**
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // split lines
  const lines = safe
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "");

  if (lines.length === 0) {
    return safe;
  }

  let html = "";
  let inList = false;

  for (const line of lines) {
    const isBullet = line.startsWith("- ") || line.startsWith("* ");

    if (isBullet) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${line.substring(2).trim()}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p>${line}</p>`;
    }
  }

  if (inList) {
    html += "</ul>";
  }

  // fallback for single-line AI bullet dumps like:
  // "text * item * item"
  if (!html.includes("<ul>") && safe.includes(" * ")) {
    const parts = safe.split(" * ").map(part => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      let fallbackHtml = `<p>${parts[0]}</p><ul>`;
      for (let i = 1; i < parts.length; i++) {
        fallbackHtml += `<li>${parts[i]}</li>`;
      }
      fallbackHtml += "</ul>";
      return fallbackHtml;
    }
  }

  return html;
}

function addMessage(role, text, animated = true, imageDataUrl = null) {
  const bubble = document.createElement("div");
  bubble.className = role === "user" ? "msg msg-user" : "msg msg-bot";

  if (animated) {
    bubble.classList.add("msg-enter");
  }

  if (imageDataUrl) {
    const img = document.createElement("img");
    img.src = imageDataUrl;
    img.className = "msg-image";
    bubble.appendChild(img);
  }

  if (text) {
    if (role === "bot") {
      const textNode = document.createElement("div");
      textNode.innerHTML = formatMessage(text);
      bubble.appendChild(textNode);
    } else {
      const textNode = document.createElement("span");
      textNode.textContent = text;
      bubble.appendChild(textNode);
    }
  }

  chatMessages.appendChild(bubble);

  if (animated) {
    requestAnimationFrame(() => {
      bubble.classList.add("msg-show");
    });
  }

  scrollToBottom(true);
}

function createTypingIndicator() {
  removeTypingIndicator();

  const typingBubble = document.createElement("div");
  typingBubble.className = "msg msg-bot typing-indicator msg-enter";
  typingBubble.id = "typingIndicator";

  const typingText = document.createElement("span");
  typingText.textContent = "Rowan is typing";

  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";

  typingBubble.appendChild(typingText);
  typingBubble.appendChild(dots);

  chatMessages.appendChild(typingBubble);

  requestAnimationFrame(() => {
    typingBubble.classList.add("msg-show");
  });

  scrollToBottom(true);
}

function removeTypingIndicator() {
  const existing = document.getElementById("typingIndicator");
  if (existing) {
    existing.remove();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getOrCreateConversation() {
  try {
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: "GET",
      headers: authHeaders()
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("Conversations non-JSON response:", text);
      throw new Error("Server returned HTML when loading conversations.");
    }

    if (res.status === 401) {
      localStorage.clear();
      window.location.href = "/";
      return null;
    }

    const convos = await res.json();

    if (!res.ok) {
      throw new Error(convos.details || convos.error || "Failed to load conversations");
    }

    if (Array.isArray(convos) && convos.length > 0) {
      return convos[0].conversation_id;
    }

    const createRes = await fetch(`${API_BASE}/api/conversations`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "group",
        name: "General",
        member_ids: []
      })
    });

    const createContentType = createRes.headers.get("content-type") || "";
    if (!createContentType.includes("application/json")) {
      const text = await createRes.text();
      console.error("Create conversation non-JSON response:", text);
      throw new Error("Server returned HTML when creating a conversation.");
    }

    const created = await createRes.json();

    if (!createRes.ok) {
      throw new Error(created.details || created.error || "Failed to create conversation");
    }

    return created.conversation_id;
  } catch (error) {
    chatError.textContent = error.message || "Could not connect to the server.";
    return null;
  }
}

async function loadMessages() {
  if (!conversationId) return;

  try {
    const res = await fetch(`${API_BASE}/api/messages?conversation_id=${conversationId}`, {
      method: "GET",
      headers: authHeaders()
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("Messages non-JSON response:", text);
      throw new Error("Server returned HTML instead of JSON while loading messages.");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Failed to load messages");
    }

    chatMessages.innerHTML = "";

    for (const message of data) {
      const role = String(message.sender_user_id) === String(userId) ? "user" : "bot";
      addMessage(role, message.content ?? "[deleted]", false);
    }

    scrollToBottom(false);
  } catch (error) {
    chatError.textContent = error.message || "Could not load messages.";
  }
}

async function sendMessage(messageText, imageBase64 = null, imageMediaType = null) {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      conversation_id: conversationId,
      content: messageText,
      image_base64: imageBase64,
      image_media_type: imageMediaType
    })
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.error("Send message non-JSON response:", text);
    throw new Error("Server returned HTML instead of JSON. Check logs.");
  }

  const data = await res.json();

  if (!res.ok) {
    console.error("Backend JSON error:", data);
    throw new Error(data.details || data.error || "Failed to send message");
  }

  return data;
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;

  if (file.size > 4 * 1024 * 1024) {
    chatError.textContent = "Image must be under 4MB.";
    imageInput.value = "";
    return;
  }

  pendingImageMediaType = file.type;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    pendingImageBase64 = dataUrl.split(",")[1];
    imagePreview.src = dataUrl;
    imagePreviewWrapper.style.display = "flex";
  };
  reader.readAsDataURL(file);
});

clearImageBtn.addEventListener("click", () => {
  pendingImageBase64 = null;
  pendingImageMediaType = null;
  imageInput.value = "";
  imagePreviewWrapper.style.display = "none";
  imagePreview.src = "";
});

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", toggleTheme);
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  chatError.textContent = "";

  const msg = chatInput.value.trim();
  const imgBase64 = pendingImageBase64;
  const imgType = pendingImageMediaType;
  const imgPreviewUrl = imagePreview.src || null;

  if (!msg && !imgBase64) return;

  if (!conversationId) {
    chatError.textContent = "No conversation loaded yet. Refresh the page.";
    return;
  }

  addMessage("user", msg, true, imgBase64 ? imgPreviewUrl : null);
  chatInput.value = "";

  pendingImageBase64 = null;
  pendingImageMediaType = null;
  imageInput.value = "";
  imagePreviewWrapper.style.display = "none";
  imagePreview.src = "";

  chatInput.disabled = true;
  createTypingIndicator();

  try {
    const data = await sendMessage(msg, imgBase64, imgType);

    await sleep(700);
    removeTypingIndicator();

    if (data.bot_message && data.bot_message.content) {
      addMessage("bot", data.bot_message.content, true);
    }
  } catch (error) {
    removeTypingIndicator();
    chatError.textContent = error.message || "Could not send message.";
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user_id");
  localStorage.removeItem("username");
  window.location.href = "/";
});

(async function init() {
  await loadThemeFromBackend();
  setGreeting();
  conversationId = await getOrCreateConversation();

  if (conversationId) {
    await loadMessages();
  }

  if (chatInput) {
    chatInput.focus();
  }
})();