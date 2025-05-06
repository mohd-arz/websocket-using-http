# Raw WebSocket Server in Node.js (No Libraries)

This project is a basic WebSocket server built using only the native `http` modules in Node.js.

It **manually upgrades HTTP to WebSocket**, **reads binary WebSocket frames**, and **broadcasts messages** to all clients in the same room. No external libraries like `ws` are used.

---

##  Features

- WebSocket handshake done manually (`Sec-WebSocket-Accept`).
- Binary frame parsing (fin, rsv, opcode, mask, payload).
- Supports **room-based** communication (via query param `?room=123`).
- Parses **text frames** (opcode `0x1`).
- Handles **close frames** (opcode `0x8`) with close code interpretation.
- Broadcasts messages to all sockets in the same room.
- Validates UTF-8 encoded payloads.
- Logs when client disconnects or errors happen.

---

##  How It Works (Internals)

### 1. HTTP Server Setup

Creates a basic HTTP server that returns `"okey"` for non-WebSocket HTTP requests.

```js
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-type": "application/json" });
  res.end("okey");
});
```

---

### 2. WebSocket Upgrade

The `upgrade` event does:

- Parses the `Sec-WebSocket-Key` header.
- Appends the WebSocket GUID.
- Hashes it using SHA1 and encodes in Base64.
- Sends the required 101 Switching Protocols response.
- Extracts `roomId` from the query string (`/socket?room=myroom`).
- Stores sockets per room using a `Map<roomId, sockets[]>`.

```js
const hash = crypto
  .createHash("sha1")
  .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
  .digest("base64");
```

---

###  3. WebSocket Frame Parsing

Parses incoming WebSocket frames manually:

| Byte | Purpose                         |
|------|----------------------------------|
| 0    | FIN, RSV1-3, OPCODE              |
| 1    | MASK bit + Payload Length (7-bit)|
| 2–3  | Extended payload length (if needed) |
| 4–7  | Masking key                      |
| 8+   | Masked payload data              |

Only handles **text frames** (opcode `0x1`). If opcode is not `0x1`, it's ignored except `0x8` (Close).

---

###  Opcode Support

- `0x1` → Text frame (message broadcasted).
- `0x8` → Close frame (reads close code and closes socket).
- Others → Currently ignored.

---

###  Room-Based Broadcast

After decoding message, it finds all sockets in the same room and sends the message using **framed binary format**:

```js
let sendD = Buffer.alloc(2);
sendD[0] = 129; // 10000001 = FIN + text opcode
sendD[1] = message length;
let payloadData = Buffer.from(decodedText, "utf-8");
let sendData = Buffer.concat([sendD, payloadData]);
socket.write(sendData);
```

---

##  Why This Exists

To learn the **raw WebSocket protocol**, including:

- How WebSocket handshake works.
- How binary WebSocket frames are structured and parsed.
- How UTF-8 text validation works in frames.
- How to manually send and receive framed binary messages.

---

##  Known Limitations

- No support for:
  - fragmented messages
  - ping/pong (heartbeat)
  - binary payloads (`opcode 0x2`)
- No reconnect logic or client-side code (yet).
- Masking logic assumes messages from client are masked (correct per RFC).

---

##  How to Run

```bash
node index.js
```

Open with any WebSocket client (Postman, browser, JS):

```js
const socket = new WebSocket("ws://localhost:1337/?room=chatroom1");
socket.onmessage = (e) => console.log("received:", e.data);
socket.send("hello everyone");
```

---

##  Project Structure

```
index.js     → core server with upgrade + room broadcast
README.md        → you're reading it!
```

---

##  Improvements You Can Try

- Add ping/pong handling (opcode `0x9` and `0xA`)
- Support binary frames (e.g., images, blobs)
- Add JSON message support with types
- Auto-remove disconnected clients from room
- Add heartbeat and reconnection support
- Write a WebSocket client in plain JavaScript

---

##  Author's Note

This is **not production-ready**, but built to **understand deeply how WebSockets work at protocol level**. Perfect for learning and custom implementations where you want fine-grained control over sockets and framing.

---