const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const axios = require("axios");
const ytsr = require("ytsr");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files from 'public' directory
app.use(express.static("public"));

// Ensure temp folder exists for optional local caching
const tempDir = path.join(__dirname, "temp");
fs.ensureDirSync(tempDir);

// YouTube to MP3 conversion endpoint
app.get("/play", async (req, res) => {
  const query = req.query.query;
  
  // Input validation
  if (!query) {
    return res.status(400).json({ error: "🎵 Provide a song name!" });
  }
  if (query.length > 100) {
    return res.status(400).json({ error: "📝 Song name too long! Max 100 chars." });
  }

  try {
    // 1️⃣ Search YouTube for official video
    const searchResults = await ytsr(`${query} official audio`, { limit: 5 });
    const video = searchResults.items.find(item => 
      item.type === "video" && 
      item.duration?.seconds > 30 // Avoid very short clips
    );

    if (!video) {
      return res.status(404).json({ error: "😕 Couldn't find that song. Try another one!" });
    }

    // 2️⃣ Convert to MP3 using API
    const apiUrl = `https://api.privatezia.biz.id/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`;
    const apiResp = await axios.get(apiUrl, { 
      timeout: 15000, // 15 seconds timeout
      headers: { 'User-Agent': 'Mozilla/5.0' } // Some APIs block default axios UA
    });
    const apiData = apiResp.data;

    if (!apiData.status || !apiData.result?.downloadUrl) {
      return res.status(500).json({ error: "💥 Failed to convert video to MP3" });
    }

    // Optional: Cache file locally (non-blocking)
    const timestamp = Date.now();
    const fileName = `audio_${timestamp}.mp3`;
    const filePath = path.join(tempDir, fileName);

    axios({
      method: "get",
      url: apiData.result.downloadUrl,
      responseType: "stream",
      timeout: 60000,
    })
      .then(audioResp => {
        const writer = fs.createWriteStream(filePath);
        audioResp.data.pipe(writer);
        writer.on("finish", () => {
          // Auto-delete after 10 minutes
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 10 * 60 * 1000);
        });
        writer.on("error", err => console.error("File write error:", err));
      })
      .catch(err => console.error("Background download failed:", err));

    // 3️⃣ Respond immediately with streaming URL
    res.json({
      title: apiData.result.title || video.title,
      downloadUrl: apiData.result.downloadUrl
    });

  } catch (err) {
    console.error("Server error:", err.message);
    
    // Handle specific errors
    if (err.code === 'ECONNABORTED') {
      return res.status(500).json({ error: "⏳ Conversion took too long. Try again!" });
    }
    if (err.response?.status === 429) {
      return res.status(500).json({ error: "🚦 Too many requests. Wait a moment!" });
    }
    
    res.status(500).json({ error: "💥 Unexpected error. Try again!" });
  }
});

// Optional: serve cached files (not used in current flow, but available)
app.use("/temp", express.static(tempDir, {
  maxAge: "1m" // short cache
}));

// Handle all other routes by serving the frontend (for SPA support)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎵 Music Downloader running on http://localhost:${PORT}`);
});
