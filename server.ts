const express = require("express");
const path = require("path");
const { PeerServer } = require("peer");

const app = express();
const PORT = process.env.PORT || 3001;

// Serve the built React app
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Start PeerJS signaling server
const peerServer = PeerServer({
  port: 9000,
  path: "/myapp",
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});