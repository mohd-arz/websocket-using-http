import http from "http";
import crypto from "crypto";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-type": "application/json" });
  res.end("okey"); // where the end goes if i commented to http request's header ?
});

const sockets = new Map();

server.on("error", (err) => {
  console.error("This is error ", err);
});

server.on("connection", (socket) => {
  console.log("Connection Established");
});

server.on("upgrade", (req, socket, head) => {
  const { upgrade } = req.headers;
  let roomId = req.url;
  roomId = roomId.replace(/^\/\?/, "");
  const query = new URLSearchParams(roomId);
  roomId = query.get("room") || 0;

  socket.roomId = roomId;

  if (!sockets.has(roomId)) {
    sockets.set(roomId, [socket]);
  } else {
    sockets.get(roomId).push(socket);
  }

  if (upgrade.toLowerCase() == "websocket") {
    // console.log("room", roomId);
    const acceptKey = req.headers["sec-websocket-key"];

    // console.log("acceptkey ", acceptKey);
    const hash = crypto
      .createHash("sha1")
      .update(acceptKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");

    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${hash}`,
    ];

    socket.write(responseHeaders.join("\r\n") + "\r\n\r\n");

    socket.on("data", (buffer) => {
      const paddedBin = BigInt("0x" + buffer.toString("hex"))
        .toString(2)
        .padStart(buffer.length * 8, "0");

      console.log("binary ", paddedBin);

      const firstByte = buffer.readUInt8(0);

      const rightShift = 7;

      const fin = (firstByte & 0x80) >> rightShift;

      const rs1 = (firstByte & 0x40) >> (rightShift - 1);
      const rs2 = (firstByte & 0x20) >> (rightShift - 2);
      const rs3 = (firstByte & 0x10) >> (rightShift - 3);

      const opcode = firstByte & 0x0f;

      console.log("opcode ", opcode);

      const secondByte = buffer.readUInt8(1);

      const mask = (secondByte & 0x80) >> rightShift;

      const payloadLength = secondByte & 0x7f;

      let offset = 2; // because we already processed 2 bytes

      if (payloadLength == 126) {
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2; // because we took the next two bytes
      } else if (payloadLength == 127) {
        // we dont going for 8 bytes
        payloadLength = buffer.readUInt32BE(offset + 4); // omitting the 4 bytes
        offset += 8;
      }

      console.log("payload length ", payloadLength);

      let maskKey = null;
      if (mask) {
        // next 4 bytes will be mask data
        maskKey = buffer.slice(offset, offset + 4); // slicing from the offset and next 4 bytes;
        offset += 4;
      }

      let payloadData = buffer.slice(offset, offset + payloadLength);
      // offset + payload for 0,1,2,3,4,5 // ex) 2,2+3 then 2,3,4

      if (mask) {
        for (let i = 0; i < payloadLength; i++) {
          payloadData[i] ^= maskKey.readUInt8(i % 4);
        }
      }

      // 0b1000
      if (opcode == 8) {
        const code = payloadData.readUIntBE(0, payloadData.length); // it returns the decimal
        console.log("code is ", code);
        if (code == 1000) {
          console.log(
            "1000 indicates a normal closure, meaning that the purpose forwhich the connection was established has been fulfilled."
          );
        }
        if (code == 1001) {
          console.log(
            '1001 indicates that an endpoint is "going away", such as a server going down or a browser having navigated away from a page'
          );
        }
        return;
      }

      if (opcode != 1) {
        console.log("Unknown parse other than text");
        return;
      }

      console.log("Payload is ", payloadData, payloadData.toString("utf-8"));

      /**
       *  Abrupt connection (each time getting  the same opcode 8)
       *  1000100010000010111001100001010001001100011010101110010111111101
       *  1000100010000010001000001110011001100010101011010010001100001111
       *  1000100010000010001011100100101010001110000111110010110110100011
       *  1000100010000010110001010000001110000000110111101100011011101010
       *  `<Buffer 03 e9>` PAYLOAD
       *
       *
       * -> just searched the internet (8 is for closing frame )
       * **/

      console.log("is valid utf-8 ", isValidUtf8(payloadData));
      if (!isValidUtf8(payloadData)) return;

      //if payload is hello and length is 5

      // we can't send data as normal response
      // we need to make frame for it

      // fin, rsv1, rsv2, rsv3, opcode
      //0 000 0001

      // masking, payload length => if = 126 then first 7 bits will be 0 and length will be on next 2 bytes
      // if 127 then first 7 bits will be 0 then length will be on next 8 bytes
      //1 0000101

      // next 4 bytes will be masking key
      // 4 2-hex value

      // payload length's payload data
      // 5 bytes of hello

      // first 2 bytes will be predictable

      let send1stByte = 0x00;
      send1stByte = send1stByte | 0x80; //fin

      // 1, 000 , 0001
      send1stByte = send1stByte | 0x01;

      // masking 0
      let send2ndByte = 0x00;
      send2ndByte = send2ndByte | payloadLength;

      let sendD = Buffer.alloc(2);
      sendD.writeUInt8(send1stByte, 0);
      sendD.writeUInt8(send2ndByte, 1);

      let sendData = Buffer.concat([sendD, payloadData]);

      sockets.get(socket.roomId).forEach((sock) => {
        console.log("socket is destroyed", sock.destroyed);
        if (!sock.destroyed) {
          sock.write(sendData);
        }
      });
    });

    socket.on("end", () => {
      console.log("the socket is disconnected");
    });
    socket.on("close", () => {
      console.log("socket inside closing");
    });
    socket.on("error", (err) => {
      const allSockets = sockets.get(socket.roomId) || [];
      sockets.set(
        socket.roomId,
        allSockets.filter((sock) => !sock.destroyed)
      );
      if (err.code === "ECONNRESET") {
        console.log("Client disconnected abruptly (refresh probably)");
      } else if (err.code === "EPIPE") {
        console.log("Either one socket is closed");
      } else {
        console.error("Socket error:", err);
      }
    });
  } else {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    return socket.destroy();
  }
});

// while listening to 1337
server.listen(1337, () => {
  console.log("Server is listening on 1337");
});

function isValidUtf8(bytes) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch (e) {
    return false;
  }
}
